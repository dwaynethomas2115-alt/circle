import test from "node:test";
import assert from "node:assert/strict";
import { Repository, type Request } from "../function/repository";
import { execute, type Identity } from "../function/domain";
import { record } from "../function/records";
import { FakeDatabase } from "./fake-database";
import type { AppState, Result } from "../../src/types";
const alice: Identity = {
    $id: "alice",
    name: "Alice",
    email: "alice@example.test",
  },
  bob: Identity = { $id: "bob", name: "Bob", email: "bob@example.test" };
function setup() {
  const db = new FakeDatabase(),
    repo = new Repository(db.api, "circle");
  const call = async (who: Identity, request: Request) =>
    repo.mutate(who, request, async (store) => execute(store, who, request));
  return { db, repo, call };
}
const circleRequest: Request = {
  kind: "action",
  action: {
    type: "createCircle",
    input: {
      name: "Private circle",
      description: "",
      category: "Friends",
      discoverable: false,
    },
  },
};
test("normalized storage grows beyond 900KB; a post writes only its own entities", async () => {
  const f = setup(),
    created = await f.call(alice, circleRequest),
    cid = (created.data as Result).id!;
  for (let i = 0; i < 500; i++) {
    const row = record(
      "messages",
      `old-${i}`,
      {
        id: `old-${i}`,
        circleId: "unrelated",
        authorId: "other",
        content: "x".repeat(3000),
        createdAt: new Date().toISOString(),
      },
      "unrelated",
      "other",
    );
    f.db.seed(row.table, row.id, row.data);
  }
  assert.ok(JSON.stringify([...f.db.rows]).length > 900000);
  f.db.calls = [];
  const result = await f.call(alice, {
    kind: "action",
    action: {
      type: "createPost",
      input: { circleId: cid, content: "New photo caption" },
    },
  });
  assert.equal((result.data as Result).ok, true);
  const writes = f.db.calls.filter((c) =>
    ["createRow", "updateRow", "deleteRow"].includes(c.method),
  );
  assert.ok(writes.length < 8);
  assert.ok(writes.every((c) => c.args.tableId !== "messages"));
  assert.ok(
    f.db.calls.filter(
      (c) => c.method === "listRows" && c.args.tableId === "messages",
    ).length === 0,
  );
});
test("repository pages through memberships rather than accepting the default 25", async () => {
  const f = setup();
  for (let i = 0; i < 240; i++) {
    const r = record(
      "members",
      `c${i}:alice`,
      {
        circleId: `c${i}`,
        userId: "alice",
        role: "member",
        joinedAt: "2026-01-01",
      },
      `c${i}`,
      "alice",
    );
    f.db.seed(r.table, r.id, r.data);
  }
  const members = await f.repo.list("members", "actor_id", ["alice"]);
  assert.equal(members.length, 240);
  assert.equal(f.db.calls.filter((c) => c.method === "listRows").length, 3);
});
test("independent circles use distinct guards; same-circle stale mutation conflicts", async () => {
  const f = setup();
  const ca = (await f.call(alice, circleRequest)).data as Result,
    cb = (await f.call(bob, circleRequest)).data as Result;
  f.db.calls = [];
  await f.call(alice, {
    kind: "action",
    action: { type: "sendMessage", circleId: ca.id!, content: "one" },
  });
  const first = f.db.calls
    .filter((c) => c.args.tableId === "guards" && c.method === "updateRow")
    .map((c) => c.args.rowId);
  f.db.calls = [];
  await f.call(bob, {
    kind: "action",
    action: { type: "sendMessage", circleId: cb.id!, content: "two" },
  });
  const second = f.db.calls
    .filter((c) => c.args.tableId === "guards" && c.method === "updateRow")
    .map((c) => c.args.rowId);
  assert.ok(first.every((id) => !second.includes(id)));
  const t1 = await f.db.createTransaction({ ttl: 60 }),
    t2 = await f.db.createTransaction({ ttl: 60 });
  await f.repo.guard(`circle:${ca.id}`, t1.$id);
  await f.repo.guard(`circle:${ca.id}`, t2.$id);
  await f.db.updateTransaction({ transactionId: t1.$id, commit: true });
  await assert.rejects(
    f.db.updateTransaction({ transactionId: t2.$id, commit: true }),
    { code: 409 },
  );
});
test("hashed invitations, membership revocation and separate reactions survive repository round trips", async () => {
  const f = setup(),
    cid = ((await f.call(alice, circleRequest)).data as Result).id!;
  const code = (
    (
      await f.call(alice, {
        kind: "action",
        action: { type: "createInvitation", circleId: cid },
      })
    ).data as Result
  ).code!;
  await f.call(bob, {
    kind: "action",
    action: { type: "redeemInvitation", code },
  });
  const pid = (
    (
      await f.call(alice, {
        kind: "action",
        action: {
          type: "createPost",
          input: { circleId: cid, content: "private" },
        },
      })
    ).data as Result
  ).id!;
  await f.call(bob, {
    kind: "action",
    action: { type: "toggleReaction", postId: pid },
  });
  assert.equal(
    [...f.db.rows.keys()].filter((k) => k.startsWith("reactions/")).length,
    1,
  );
  const member = (await f.repo.read(bob, { kind: "snapshot" }))
    .data as AppState;
  assert.equal(member.posts[0].reactions[0], "bob");
  await f.call(alice, {
    kind: "action",
    action: { type: "removeMember", circleId: cid, userId: "bob" },
  });
  assert.equal(
    ((await f.repo.read(bob, { kind: "snapshot" })).data as AppState).posts
      .length,
    0,
  );
  assert.equal(
    (
      (
        await f.call(bob, {
          kind: "action",
          action: { type: "sendMessage", circleId: cid, content: "intrusion" },
        })
      ).data as Result
    ).ok,
    false,
  );
});
test("concurrent username claims cannot assign one username to two accounts", async () => {
  const f = setup();
  await f.call(alice, {
    kind: "action",
    action: { type: "updateProfile", patch: { username: "unique_name" } },
  });
  const second = await f.call(bob, {
    kind: "action",
    action: { type: "updateProfile", patch: { username: "unique_name" } },
  });
  assert.equal((second.data as Result).ok, false);
});
test("reads fail closed when membership changes during multi-table hydration", async () => {
  const f = setup(),
    cid = ((await f.call(alice, circleRequest)).data as Result).id!;
  const code = (
    (
      await f.call(alice, {
        kind: "action",
        action: { type: "createInvitation", circleId: cid },
      })
    ).data as Result
  ).code!;
  await f.call(bob, {
    kind: "action",
    action: { type: "redeemInvitation", code },
  });
  const original = f.repo.load.bind(f.repo);
  let revoked = false;
  f.repo.load = async (...args) => {
    const store = await original(...args);
    if (args[0].$id === "bob" && args[1].kind === "snapshot" && !revoked) {
      revoked = true;
      await f.call(alice, {
        kind: "action",
        action: { type: "removeMember", circleId: cid, userId: "bob" },
      });
    }
    return store;
  };
  await assert.rejects(f.repo.read(bob, { kind: "snapshot" }), { code: 409 });
});
test("free-plan operation budget rejects large fan-out without partial posts or notifications", async () => {
  const f = setup(),
    cid = ((await f.call(alice, circleRequest)).data as Result).id!;
  for (let i = 0; i < 110; i++) {
    const r = record(
      "members",
      `${cid}:user${i}`,
      {
        circleId: cid,
        userId: `user${i}`,
        role: "member",
        joinedAt: "2026-01-01",
      },
      cid,
      `user${i}`,
    );
    f.db.seed(r.table, r.id, r.data);
  }
  const before = JSON.stringify([...f.db.rows]);
  await assert.rejects(
    f.call(alice, {
      kind: "action",
      action: {
        type: "createPost",
        input: { circleId: cid, content: "Fan out" },
      },
    }),
    /transaction budget/,
  );
  assert.equal(JSON.stringify([...f.db.rows]), before);
});
test("concurrent unique-name claims conflict even when both preflight reads see it available", async () => {
  const f = setup();
  let arrived = 0;
  let release: () => void = () => {};
  const barrier = new Promise<void>((r) => (release = r));
  const request: Request = {
    kind: "action",
    action: { type: "updateProfile", patch: { username: "same_name" } },
  };
  const run = (who: Identity) =>
    f.repo.mutate(who, request, async (store) => {
      if (++arrived === 2) release();
      await barrier;
      return execute(store, who, request);
    });
  const result = await Promise.allSettled([run(alice), run(bob)]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(result.filter((r) => r.status === "rejected").length, 1);
});
test("poll options/votes, event RSVPs and read markers round-trip as separate rows", async () => {
  const f = setup(),
    cid = ((await f.call(alice, circleRequest)).data as Result).id!;
  const pollId = (
    (
      await f.call(alice, {
        kind: "featureAction",
        action: {
          type: "createPoll",
          circleId: cid,
          question: "Lunch?",
          options: ["One", "Two"],
        },
      })
    ).data as Result
  ).id!;
  const feature = (await f.repo.read(alice, { kind: "features" })).store
    .features;
  await f.call(alice, {
    kind: "featureAction",
    action: { type: "vote", pollId, optionId: feature.polls[0].options[0].id },
  });
  const eventId = (
    (
      await f.call(alice, {
        kind: "featureAction",
        action: {
          type: "createEvent",
          input: {
            circleId: cid,
            title: "Meet",
            description: "",
            location: "",
            startsAt: new Date(Date.now() + 86400000).toISOString(),
            endsAt: new Date(Date.now() + 90000000).toISOString(),
          },
        },
      })
    ).data as Result
  ).id!;
  await f.call(alice, {
    kind: "featureAction",
    action: { type: "rsvpEvent", eventId, response: "going" },
  });
  await f.call(alice, {
    kind: "featureAction",
    action: {
      type: "markCaughtUp",
      circleId: cid,
      seenAt: new Date().toISOString(),
    },
  });
  const next = (await f.repo.read(alice, { kind: "features" })).store.features;
  assert.equal(next.votes.length, 1);
  assert.equal(next.rsvps[0].response, "going");
  assert.equal(next.readStates.length, 1);
  await f.call(alice, {
    kind: "featureAction",
    action: { type: "deletePoll", pollId },
  });
  assert.equal(
    [...f.db.rows.keys()].filter(
      (k) => k.startsWith("poll_options/") || k.startsWith("votes/"),
    ).length,
    0,
  );
});
