/** Narrow, idempotent calendar migration; uses existing administrator access. */
import { Client, TablesDB } from "node-appwrite";
import { COLUMNS } from "./function/tables";
async function main() {
  const endpoint = process.env.APPWRITE_ENDPOINT,
    project = process.env.APPWRITE_PROJECT_ID,
    key = process.env.APPWRITE_API_KEY,
    databaseId = process.env.CIRCLE_DATABASE_ID;
  if (!endpoint || !project || !key || !databaseId)
    throw new Error(
      "Existing Appwrite administrator connection is required. No credentials are created.",
    );
  const db = new TablesDB(
    new Client().setEndpoint(endpoint).setProject(project).setKey(key),
  );
  await db.get({ databaseId }); // Never create or choose a database.
  const tableId = "calendar_imports",
    apply = process.argv.includes("--apply");
  try {
    const table = await db.getTable({ databaseId, tableId });
    if (!table.rowSecurity || table.$permissions.length)
      throw new Error(
        "Calendar table permissions are incompatible; no permissions changed.",
      );
  } catch (e) {
    if ((e as { code?: number }).code !== 404) throw e;
    if (!apply) {
      console.log(
        "Would create the private calendar_imports table and its standard columns. Re-run with --apply to migrate.",
      );
      process.exitCode = 2;
      return;
    }
    await db.createTable({
      databaseId,
      tableId,
      name: tableId,
      rowSecurity: true,
      permissions: [],
    });
  }
  for (const [column, size] of Object.entries(COLUMNS)) {
    try {
      const existing = await db.getColumn({ databaseId, tableId, key: column });
      if (
        existing.type !== "string" ||
        !("size" in existing) ||
        existing.size !== size ||
        !existing.required
      )
        throw new Error(
          `Incompatible ${column} column; no existing column changed.`,
        );
      if (existing.status !== "available")
        throw new Error(
          `${column} is ${existing.status}; rerun after Appwrite completes it.`,
        );
    } catch (e) {
      if ((e as { code?: number }).code !== 404) throw e;
      if (!apply) {
        process.exitCode = 2;
        console.log(`Would add column ${column}.`);
        continue;
      }
      await db.createStringColumn({
        databaseId,
        tableId,
        key: column,
        size,
        required: true,
      });
    }
  }
  // Calendar uses exact-ID reads, so no secondary index is required.
  console.log(
    apply
      ? "Calendar schema submitted. Re-run without --apply to verify all columns are available before deployment."
      : "Existing calendar schema inspected. Resolve any missing/pending columns before deployment.",
  );
}
main().catch(() => {
  console.error(
    "Calendar migration did not complete. Check existing connection, permissions and schema readiness; no secrets are printed.",
  );
  process.exitCode = 1;
});
