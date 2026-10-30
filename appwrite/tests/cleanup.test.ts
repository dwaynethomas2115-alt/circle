import test from "node:test";
import assert from "node:assert/strict";
import { emptyStore, execute } from "../function/domain";
import { unreferencedUploads } from "../cleanup";
test("cleanup preserves referenced/recent files; expired revoked uploads cannot be finalized", () => {
  const store = emptyStore(),
    before = Date.now() - 86400000;
  const old = {
    owner: "alice",
    mediaType: "image" as const,
    ready: true,
    createdAt: before - 1,
  };
  const keep = "00000000-0000-4000-8000-000000000001",
    orphan = "00000000-0000-4000-8000-000000000002",
    recent = "00000000-0000-4000-8000-000000000003";
  store.uploads = {
    [keep]: { ...old },
    [orphan]: { ...old },
    [recent]: { ...old, createdAt: Date.now() },
  };
  store.app.users.push({
    id: "alice",
    name: "Alice",
    username: "alice",
    avatar: `awfile:${keep}`,
    bio: "",
  });
  assert.deepEqual(unreferencedUploads(store, before), [orphan]);
  store.uploads[orphan].ready = false;
  assert.throws(
    () =>
      execute(
        store,
        { $id: "alice", name: "Alice", email: "alice@example.test" },
        { kind: "finishUpload", fileId: orphan },
      ),
    /unavailable/,
  );
});
