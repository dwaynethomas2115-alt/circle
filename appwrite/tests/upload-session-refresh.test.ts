import assert from "node:assert/strict";
import test from "node:test";
import { Repository, type Request } from "../function/repository";
import { execute, type Identity } from "../function/domain";
import { FakeDatabase } from "./fake-database";
import { loadSessionSnapshot } from "../../src/lib/session";
import type { AppState, Result } from "../../src/types";

const alice: Identity = {
  $id: "alice",
  name: "Alice",
  email: "alice@example.test",
};
const bob: Identity = { $id: "bob", name: "Bob", email: "bob@example.test" };
const circleRequest: Request = {
  kind: "action",
  action: {
    type: "createCircle",
    input: {
      name: "Private Circle",
      description: "",
      category: "Friends",
      discoverable: false,
      approvalRequired: false,
    },
  },
};

async function setup() {
  const db = new FakeDatabase();
  const repo = new Repository(db.api, "circle");
  const call = (who: Identity, request: Request) =>
    repo.mutate(who, request, async (store) => execute(store, who, request));
  const cid = ((await call(alice, circleRequest)).data as Result).id!;
  await call(alice, {
    kind: "action",
    action: {
      type: "createPost",
      input: { circleId: cid, content: "Existing private memory" },
    },
  });
  return { db, repo, call, cid };
}

test("actual upload transactions interrupt guarded snapshots but bounded session refresh recovers without replaying writes", async () => {
  const h = await setup();
  const original = h.repo.load.bind(h.repo);
  const interruptions: string[] = [];
  let reads = 0;
  let accounts = 0;
  let reservationId: string | undefined;
  h.repo.load = async (...args) => {
    const store = await original(...args);
    if (args[1].kind === "snapshot") {
      reads++;
      if (reads === 1) {
        const result = await h.call(alice, {
          kind: "beginUpload",
          mediaType: "image",
        });
        reservationId = (result.data as Result).id!;
        interruptions.push("beginUpload");
      } else if (reads === 2) {
        // Storage sealing remains separately tested; this is a mocked transaction
        // commit matching finishUpload after a file was privately sealed.
        await h.call(alice, { kind: "finishUpload", fileId: reservationId! });
        interruptions.push("finishUpload");
      }
    }
    return store;
  };
  const statuses: number[] = [];
  const result = await loadSessionSnapshot({
    currentAccount: async () => {
      accounts++;
      return alice;
    },
    snapshot: async () => {
      try {
        return (await h.repo.read(alice, { kind: "snapshot" }))
          .data as AppState;
      } catch (cause) {
        statuses.push((cause as { code: number }).code);
        throw cause;
      }
    },
    waitForConflictRetry: async () => {},
  });
  assert.deepEqual(
    statuses,
    [409, 409],
    "real repository guards must reject both mixed reads",
  );
  assert.deepEqual(interruptions, ["beginUpload", "finishUpload"]);
  assert.equal(accounts, 3);
  assert.equal(reads, 3);
  assert.equal(result.status, "authenticated");
  assert.equal(result.state.posts[0].content, "Existing private memory");
  const fresh = await h.repo.read(alice, { kind: "snapshot" });
  assert.equal(
    Object.keys(fresh.store.uploads || {}).length,
    0,
    "unpublished reservations are never projected as post attachments",
  );
  assert.equal(
    [...h.db.rows.keys()].filter((key) => key.startsWith("uploads/")).length,
    1,
    "read retries cannot create more uploads",
  );
});

test("a real membership guard conflict retries into the revoked projection rather than retaining private memories", async () => {
  const h = await setup();
  const invitation = (
    await h.call(alice, {
      kind: "action",
      action: { type: "createInvitation", circleId: h.cid },
    })
  ).data as Result;
  await h.call(bob, {
    kind: "action",
    action: { type: "redeemInvitation", code: invitation.code! },
  });
  assert.equal(
    ((await h.repo.read(bob, { kind: "snapshot" })).data as AppState).posts
      .length,
    1,
  );
  const original = h.repo.load.bind(h.repo);
  let revoked = false;
  h.repo.load = async (...args) => {
    const store = await original(...args);
    if (args[0].$id === bob.$id && args[1].kind === "snapshot" && !revoked) {
      revoked = true;
      await h.call(alice, {
        kind: "action",
        action: { type: "removeMember", circleId: h.cid, userId: bob.$id },
      });
    }
    return store;
  };
  let reads = 0;
  const result = await loadSessionSnapshot({
    currentAccount: async () => bob,
    snapshot: async () => {
      reads++;
      return (await h.repo.read(bob, { kind: "snapshot" })).data as AppState;
    },
    waitForConflictRetry: async () => {},
  });
  assert.equal(reads, 2);
  assert.equal(result.status, "authenticated");
  assert.equal(result.state.currentUserId, bob.$id);
  assert.deepEqual(result.state.members, []);
  assert.deepEqual(result.state.posts, []);
  assert.deepEqual(result.state.circles, []);
});
