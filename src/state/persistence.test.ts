import test from "node:test";
import assert from "node:assert/strict";
import { createSeed } from "../data/seed";
import { restoreDemoState, serializeDemoState } from "./persistence";

test("saved bundled media survives a rebuild and Metro origin change", () => {
  const oldAssets = {
    forest:
      "http://old-host:8081/assets/?unstable_path=./assets/photos/forest.jpg",
    "avatar-alex":
      "http://old-host:8081/assets/?unstable_path=./assets/photos/avatar-alex.jpg",
  };
  const newAssets = {
    forest: "/assets/forest.abc123456.jpg",
    "avatar-alex": "/assets/avatar-alex.def123456.jpg",
  };
  const before = createSeed(oldAssets);
  before.currentUserId = null;
  const raw = serializeDemoState(before, oldAssets);
  assert(!raw.includes("old-host"));
  const after = restoreDemoState(raw, newAssets);
  assert.equal(after.currentUserId, null, "logout stays persisted");
  assert.equal(
    after.posts.find((p) => p.id === "post-family")?.media,
    newAssets.forest,
  );
  assert.equal(
    after.circles.find((c) => c.id === "family")?.cover,
    newAssets.forest,
  );
  assert.equal(
    after.users.find((u) => u.id === "alex")?.avatar,
    newAssets["avatar-alex"],
  );
});

test("legacy asset URLs migrate while edited and uploaded images stay unchanged", () => {
  const before = createSeed({
    forest:
      "http://old-host:8081/assets/?unstable_path=./assets/photos/forest.jpg",
  });
  before.users[0].avatar = "https://my-image-host.example/forest.jpg";
  before.posts[1].media = "data:image/png;base64,abcdef";
  const after = restoreDemoState(JSON.stringify(before), {
    forest: "/assets/forest.aa11bb22.jpg",
  });
  assert.equal(after.posts[0].media, "/assets/forest.aa11bb22.jpg");
  assert.equal(
    after.users[0].avatar,
    "https://my-image-host.example/forest.jpg",
  );
  assert.equal(after.posts[1].media, "data:image/png;base64,abcdef");
});

test("truncated and incompatible saved state is rejected instead of crashing a screen later", () => {
  assert.throws(() => restoreDemoState("{", {}));
  assert.throws(() =>
    restoreDemoState(
      JSON.stringify({ version: 1, users: [], members: [], posts: [] }),
      {},
    ),
  );
  assert.throws(() =>
    restoreDemoState(JSON.stringify({ ...createSeed(), version: 99 }), {}),
  );
});
