/** Creates missing resources; --update-media-limit permits only the existing media size ceiling to increase. */
import {
  Client,
  TablesDB,
  Storage,
  Permission,
  Role,
  TablesDBIndexType,
  OrderBy,
} from "node-appwrite";
import { TABLES, COLUMNS, INDEXES, TABLE_INDEXES } from "./function/tables";
async function main() {
  if (!process.argv.includes("--create-missing"))
    throw new Error(
      "No changes made. Review the schema and use --create-missing only after authorization.",
    );
  const endpoint = process.env.APPWRITE_ENDPOINT,
    project = process.env.APPWRITE_PROJECT_ID,
    key = process.env.APPWRITE_API_KEY,
    databaseId = process.env.CIRCLE_DATABASE_ID;
  if (!endpoint || !project || !key || !databaseId)
    throw new Error(
      "Provide the four private setup variables documented in appwrite/README.md.",
    );
  const client = new Client()
      .setEndpoint(endpoint)
      .setProject(project)
      .setKey(key),
    db = new TablesDB(client);
  try {
    await db.get({ databaseId });
  } catch (e) {
    if ((e as { code?: number }).code !== 404) throw e;
    await db.create({ databaseId, name: "Circle" });
  }
  for (const tableId of TABLES) {
    try {
      const existing = await db.getTable({ databaseId, tableId });
      if (!existing.rowSecurity || existing.$permissions.length)
        throw new Error(
          `${tableId} has incompatible permissions. No existing resource was modified.`,
        );
    } catch (e) {
      if ((e as { code?: number }).code !== 404) throw e;
      await db.createTable({
        databaseId,
        tableId,
        name: tableId,
        permissions: [],
        rowSecurity: true,
      });
    }
    for (const [key, size] of Object.entries(COLUMNS)) {
      try {
        const existing = await db.getColumn({ databaseId, tableId, key });
        if (
          existing.type !== "string" ||
          !("size" in existing) ||
          existing.size !== size ||
          !existing.required
        )
          throw new Error(
            `${tableId}.${key} is incompatible. No existing column was modified.`,
          );
      } catch (e) {
        if ((e as { code?: number }).code !== 404) throw e;
        await db.createStringColumn({
          databaseId,
          tableId,
          key,
          size,
          required: true,
        });
      }
    }
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      const columns = await db.listColumns({ databaseId, tableId });
      if (columns.columns.some((c) => c.status === "failed"))
        throw new Error(`${tableId}: column setup failed.`);
      if (
        Object.keys(COLUMNS).every((key) =>
          columns.columns.some(
            (c) => c.key === key && c.status === "available",
          ),
        )
      ) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!ready)
      throw new Error(
        `${tableId}: schema readiness timed out. Retry after inspection; existing data is never overwritten.`,
      );
    for (const index of INDEXES.filter((index) =>
      TABLE_INDEXES[tableId].includes(index.key),
    )) {
      try {
        const existing = await db.getIndex({
          databaseId,
          tableId,
          key: index.key,
        });
        if (
          JSON.stringify(existing.columns) !== JSON.stringify(index.columns) ||
          existing.type !== "key"
        )
          throw new Error(`${tableId}.${index.key} index is incompatible.`);
      } catch (e) {
        if ((e as { code?: number }).code !== 404) throw e;
        await db.createIndex({
          databaseId,
          tableId,
          key: index.key,
          type: TablesDBIndexType.Key,
          columns: index.columns,
          orders: index.orders.map((order) =>
            order === "ASC" ? OrderBy.Asc : OrderBy.Desc,
          ),
        });
      }
    }
  }
  const storage = new Storage(client);
  try {
    const bucket = await storage.getBucket({ bucketId: "circle-media" });
    if (
      !bucket.fileSecurity ||
      JSON.stringify([...bucket.$permissions].sort()) !==
        JSON.stringify([Permission.create(Role.users())])
    )
      throw new Error(
        "Existing media bucket has incompatible permissions; inspect it manually.",
      );
    if (bucket.maximumFileSize < 250 * 1024 * 1024) {
      if (process.argv.includes("--update-media-limit")) {
        try {
          await storage.updateBucket({
            bucketId: "circle-media",
            name: bucket.name,
            maximumFileSize: 250 * 1024 * 1024,
          });
        } catch {
          throw new Error(
            "Appwrite could not raise the media bucket limit to 250 MB. Check your plan's maximum file size; no plan upgrade was requested.",
          );
        }
      } else {
        console.warn(
          "The existing media bucket has a lower file-size ceiling. Photos are optimized before storage. To request a 250 MB bucket ceiling, rerun with --create-missing --update-media-limit; your plan's maximum still applies.",
        );
      }
    }
  } catch (e) {
    if ((e as { code?: number }).code !== 404) throw e;
    const mediaBucket = {
      bucketId: "circle-media",
      name: "Circle private media",
      permissions: [Permission.create(Role.users())],
      fileSecurity: true,
      maximumFileSize: 250 * 1024 * 1024,
      allowedFileExtensions: ["jpg", "mp4", "mov"],
      encryption: true,
      antivirus: true,
    };
    try {
      await storage.createBucket(mediaBucket);
    } catch (cause) {
      const message = (cause as { message?: string }).message || "";
      if (
        !/maximumFileSize|file.*size.*(?:limit|maximum|allow)|plan.*file/i.test(
          message,
        )
      )
        throw cause;
      console.warn(
        "Appwrite rejected the 250 MB file-size ceiling. Creating a private 50 MB bucket instead; optimized photos can still fit, but your plan's file limit applies to videos. No plan upgrade was requested.",
      );
      await storage.createBucket({
        ...mediaBucket,
        maximumFileSize: 50_000_000,
      });
    }
  }
  // JPEG wallpapers share circle-media with namespaced, server-private file IDs.
  // No second bucket is required; an existing legacy bucket is left untouched.
  console.log(
    "Normalized schema created/verified. Wait for all indexes to become available before enabling the Function. No data imported; circle_state was left untouched.",
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
