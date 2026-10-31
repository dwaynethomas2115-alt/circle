/** Administrator-only normalized storage maintenance. Dry-run unless --apply is explicit. */
import { Client, TablesDB, Storage, Query } from "node-appwrite";
import { Repository } from "./function/repository";
import { parse, record } from "./function/records";
import type { Store } from "./function/domain";
import { getPostMedia } from "../src/lib/postMedia";

// Regular upload reservations use UUIDs. Shared-bucket wallpapers have wp_ IDs
// and must never be swept as abandoned person-owned uploads, even with a bad row.
const isRegularUploadFileId = (id: unknown): id is string =>
  typeof id === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
// Pure helper retained for domain/security tests; live cleanup uses indexed media_refs below.
export function unreferencedUploads(store: Store, before: number): string[] {
  const refs = new Set(
    [
      ...store.app.users.map((u) => u.avatar),
      ...store.app.circles.flatMap((c) => [c.avatar, c.cover]),
      ...store.app.posts.flatMap((p) =>
        getPostMedia(p).map((item) => item.uri),
      ),
    ]
      .filter((s): s is string => Boolean(s?.startsWith("awfile:")))
      .map((s) => s.slice(7)),
  );
  return Object.entries(store.uploads || {})
    .filter(
      ([id, u]) =>
        isRegularUploadFileId(id) && u.createdAt < before && !refs.has(id),
    )
    .map(([id]) => id);
}
async function main() {
  const endpoint = process.env.APPWRITE_ENDPOINT,
    project = process.env.APPWRITE_PROJECT_ID,
    key = process.env.APPWRITE_API_KEY,
    databaseId = process.env.CIRCLE_DATABASE_ID;
  if (!endpoint || !project || !key || !databaseId)
    throw new Error(
      "Provide private administrator variables. No changes made.",
    );
  const client = new Client()
      .setEndpoint(endpoint)
      .setProject(project)
      .setKey(key),
    db = new TablesDB(client),
    storage = new Storage(client),
    repo = new Repository(db, databaseId);
  const cutoff = new Date(Date.now() - 86400000).toISOString();
  let cursor: string | undefined,
    count = 0,
    failures = 0;
  do {
    const queries = [
      Query.lessThan("sort_at", cutoff),
      Query.orderDesc("sort_at"),
      Query.limit(100),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await db.listRows({
      databaseId,
      tableId: "uploads",
      queries,
      total: false,
    });
    cursor = page.rows.length === 100 ? page.rows.at(-1)!.$id : undefined;
    for (const upload of page.rows) {
      const fileId = upload.entity_id;
      if (!isRegularUploadFileId(fileId)) continue;
      if ((await repo.list("media_refs", "related_id", [fileId])).length)
        continue;
      count++;
      if (!process.argv.includes("--apply")) continue;
      let tx: string | undefined = (await db.createTransaction({ ttl: 60 }))
        .$id;
      try {
        // Same upload guard used by attachment creation/finalization. Recheck references
        // after staging the guard, then revoke readiness before touching Storage.
        await repo.guard(`upload:${fileId}`, tx);
        if (
          (await repo.list("media_refs", "related_id", [fileId], tx)).length
        ) {
          await db.updateTransaction({ transactionId: tx, rollback: true });
          tx = undefined;
          continue;
        }
        const latest = await repo.get("uploads", fileId, tx);
        if (!latest) throw new Error("Upload disappeared.");
        const value = parse(latest);
        value.ready = false;
        const entity = record(
          "uploads",
          fileId,
          value,
          "",
          value.owner,
          "pending",
          latest.sort_at,
        );
        await db.updateRow({
          databaseId,
          tableId: "uploads",
          rowId: entity.id,
          data: entity.data,
          permissions: [],
          transactionId: tx,
        });
        const result = await db.updateTransaction({
          transactionId: tx,
          commit: true,
        });
        if (result.status !== "committed")
          throw new Error("Cleanup commit not confirmed; no file was deleted.");
        tx = undefined;
        try {
          await storage.deleteFile({ bucketId: "circle-media", fileId });
        } catch (e) {
          if ((e as { code?: number }).code !== 404) throw e;
        }
        // Keep an individual tombstone so an interrupted cleanup can be retried.
      } catch {
        if (tx)
          await db
            .updateTransaction({ transactionId: tx, rollback: true })
            .catch(() => undefined);
        failures++;
      }
    }
  } while (cursor);
  console.log(
    `${count} old unreferenced reservations; ${process.argv.includes("--apply") ? "cleanup attempted" : "dry run, no changes"}; ${failures} failures.`,
  );
  if (failures) process.exitCode = 1;
}
if (process.argv[1]?.endsWith("cleanup.ts"))
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
