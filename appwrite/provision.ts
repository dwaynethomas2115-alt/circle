/** Creates only missing normalized resources; never alters/deletes existing schema or data. */
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
  } catch (e) {
    if ((e as { code?: number }).code !== 404) throw e;
    await storage.createBucket({
      bucketId: "circle-media",
      name: "Circle private media",
      permissions: [Permission.create(Role.users())],
      fileSecurity: true,
      maximumFileSize: 50_000_000,
      allowedFileExtensions: ["jpg", "mp4", "mov"],
      encryption: true,
      antivirus: true,
    });
  }
  console.log(
    "Normalized schema created/verified. Wait for all indexes to become available before enabling the Function. No data imported; circle_state was left untouched.",
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
