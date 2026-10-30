import test from "node:test";
import assert from "node:assert/strict";
import main, { type Context } from "../function/index";
import { FakeDatabase } from "./fake-database";
process.env.APPWRITE_FUNCTION_API_ENDPOINT = "https://appwrite.example.test/v1";
process.env.APPWRITE_FUNCTION_PROJECT_ID = "test-project";
process.env.CIRCLE_DATABASE_ID = "circle";
const identity = { $id: "alice", name: "Alice", email: "alice@example.test" };
function harness(body: unknown, invalid = false) {
  const db = new FakeDatabase();
  const context: Context = {
    req: {
      bodyJson: body,
      headers: {
        "x-appwrite-user-jwt": "test-jwt",
        "x-appwrite-key": "test-key",
      },
    },
    res: { json: (body, status = 200) => ({ body, status }) },
    error: () => {},
  };
  return {
    db,
    context,
    deps: {
      db: db.api,
      verifyIdentity: async () => {
        if (invalid) throw new Error("bad JWT");
        return identity;
      },
    },
  };
}
test("missing/invalid JWT cannot access database", async () => {
  for (const missing of [true, false]) {
    const h = harness({ kind: "snapshot" }, true);
    if (missing) h.context.req.headers["x-appwrite-user-jwt"] = "";
    const r = (await main(h.context, h.deps)) as { status: number };
    assert.equal(r.status, 401);
    assert.equal(h.db.calls.length, 0);
  }
});
test("handler bootstraps individual profile/username rows and never accesses circle_state", async () => {
  const h = harness({ kind: "snapshot" });
  const r = (await main(h.context, h.deps)) as {
    status: number;
    body: { data: { users: unknown[] } };
  };
  assert.equal(r.status, 200);
  assert.equal(r.body.data.users.length, 1);
  assert.ok([...h.db.rows.keys()].some((k) => k.startsWith("profiles/")));
  assert.ok(h.db.calls.every((c) => c.args.tableId !== "circle_state"));
});
test("conflict rolls back and never reports mutation success", async () => {
  const h = harness({
    kind: "action",
    action: { type: "updateProfile", patch: { name: "Alice Updated" } },
  });
  h.db.conflictNext = true;
  const r = (await main(h.context, h.deps)) as {
    status: number;
    body: { data?: unknown };
  };
  assert.equal(r.status, 409);
  assert.equal(r.body.data, undefined);
  assert.equal(h.db.rows.size, 0);
  assert.equal(h.db.calls.at(-1)?.method, "rollback");
});
