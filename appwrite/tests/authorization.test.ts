import assert from "node:assert/strict";
import test from "node:test";
import { execute, emptyStore, type Identity } from "../function/domain";
import type { AppState, Result } from "../../src/types";
import type { FeatureState } from "../../src/features/types";
const alice: Identity = {
  $id: "alice",
  name: "Alice",
  email: "alice@example.test",
};
const bob: Identity = { $id: "bob", name: "Bob", email: "bob@example.test" };
const eve: Identity = { $id: "eve", name: "Eve", email: "eve@example.test" };
function fixture() {
  let store = emptyStore();
  function call(who: Identity, kind: string, action?: unknown) {
    const outcome = execute(store, who, {
      kind,
      ...(action ? { action } : {}),
    });
    store = outcome.store;
    return outcome.data;
  }
  const act = (who: Identity, action: unknown) =>
    call(who, "action", action) as Result;
  const feature = (who: Identity, action: unknown) =>
    call(who, "featureAction", action) as Result;
  for (const who of [alice, bob, eve]) call(who, "snapshot");
  const circleId = act(alice, {
    type: "createCircle",
    input: {
      name: "Secret circle",
      description: "Private",
      category: "Friends",
      discoverable: false,
    },
  }).id!;
  const invitation = act(alice, { type: "createInvitation", circleId });
  assert.equal(
    act(bob, { type: "redeemInvitation", code: invitation.code }).ok,
    true,
  );
  return { call, act, feature, circleId, store: () => store };
}
test("outsiders receive no private rows, email, tokens or feature content", () => {
  const f = fixture();
  const postId = f.act(alice, {
    type: "createPost",
    input: { circleId: f.circleId, content: "secret post" },
  }).id;
  f.act(alice, {
    type: "sendMessage",
    circleId: f.circleId,
    content: "secret chat",
  });
  f.act(bob, { type: "addComment", postId, content: "secret reply" });
  f.feature(alice, {
    type: "createPoll",
    circleId: f.circleId,
    question: "Private question?",
    options: ["Yes", "No"],
  });
  const outsider = f.call(eve, "snapshot") as AppState;
  assert.equal(outsider.circles.length, 0);
  assert.equal(outsider.posts.length, 0);
  assert.equal(outsider.comments.length, 0);
  assert.equal(outsider.messages.length, 0);
  assert.equal(outsider.members.length, 0);
  assert.equal(outsider.invitations.length, 0);
  assert.deepEqual(
    outsider.users.map((u) => u.id),
    ["eve"],
  );
  assert.equal((f.call(eve, "features") as FeatureState).polls.length, 0);
  const member = f.call(bob, "snapshot") as AppState;
  assert.equal(member.posts.length, 1);
  assert.equal(member.users.find((u) => u.id === "alice")?.email, undefined);
  assert.equal(member.invitations.length, 0);
});
test("server rejects cross-circle writes, impersonation, privileged actions and malformed input", () => {
  const f = fixture();
  for (const action of [
    { type: "sendMessage", circleId: f.circleId, content: "intrusion" },
    {
      type: "createPost",
      input: { circleId: f.circleId, content: "intrusion" },
    },
    {
      type: "updateCircle",
      circleId: f.circleId,
      patch: { discoverable: true },
    },
    { type: "setRole", circleId: f.circleId, userId: "eve", role: "owner" },
    { type: "createInvitation", circleId: f.circleId },
  ])
    assert.equal(f.act(eve, action).ok, false);
  for (const action of [
    { type: "signIn", email: alice.email },
    { type: "resetDemo" },
    {
      type: "sendMessage",
      circleId: f.circleId,
      content: "spoof",
      authorId: "alice",
    },
    { type: "updateProfile", patch: { id: "alice" } },
    {
      type: "createPost",
      input: {
        circleId: f.circleId,
        content: "photo",
        media: "https://evil.test/private.jpg",
      },
    },
  ])
    assert.throws(() => f.act(bob, action), /Invalid request/);
  assert.throws(
    () => execute(f.store(), eve, { kind: "snapshot", userId: "alice" }),
    /Invalid request/,
  );
});
test("revocation immediately removes server reads and writes", () => {
  const f = fixture();
  f.act(alice, {
    type: "sendMessage",
    circleId: f.circleId,
    content: "secret",
  });
  f.feature(alice, {
    type: "createPoll",
    circleId: f.circleId,
    question: "Private?",
    options: ["Yes", "No"],
  });
  assert.equal(
    f.act(alice, { type: "removeMember", circleId: f.circleId, userId: "bob" })
      .ok,
    true,
  );
  assert.equal((f.call(bob, "snapshot") as AppState).messages.length, 0);
  assert.equal((f.call(bob, "features") as FeatureState).polls.length, 0);
  assert.equal(
    f.act(bob, { type: "sendMessage", circleId: f.circleId, content: "secret" })
      .ok,
    false,
  );
  assert.equal(
    f.feature(bob, {
      type: "createPoll",
      circleId: f.circleId,
      question: "Private?",
      options: ["Yes", "No"],
    }).ok,
    false,
  );
});
test("invite secrets are strong, single use and hidden from snapshots", () => {
  const f = fixture();
  const invite = f.act(alice, {
    type: "createInvitation",
    circleId: f.circleId,
  });
  assert.match(invite.code!, /^[A-F0-9]{48}$/);
  assert.equal(
    f.act(eve, { type: "redeemInvitation", code: invite.code }).ok,
    true,
  );
  assert.equal(
    f.act(eve, { type: "redeemInvitation", code: invite.code }).ok,
    false,
  );
  assert.equal((f.call(alice, "snapshot") as AppState).invitations.length, 0);
});
test("polls, events, read states and theme authorization run on the server", () => {
  const f = fixture();
  const pollId = f.feature(alice, {
    type: "createPoll",
    circleId: f.circleId,
    question: "Lunch?",
    options: ["One", "Two"],
  }).id;
  const polls = (f.call(bob, "features") as FeatureState).polls;
  assert.equal(
    f.feature(bob, { type: "vote", pollId, optionId: polls[0].options[0].id })
      .ok,
    true,
  );
  assert.equal(
    f.feature(eve, { type: "vote", pollId, optionId: polls[0].options[0].id })
      .ok,
    false,
  );
  assert.equal(f.feature(bob, { type: "closePoll", pollId }).ok, false);
  const startsAt = new Date(Date.now() + 86400000).toISOString(),
    endsAt = new Date(Date.now() + 90000000).toISOString();
  const eventId = f.feature(alice, {
    type: "createEvent",
    input: {
      circleId: f.circleId,
      title: "Meet",
      description: "",
      location: "",
      startsAt,
      endsAt,
    },
  }).id;
  assert.ok(eventId);
  assert.equal(
    f.feature(bob, { type: "rsvpEvent", eventId, response: "going" }).ok,
    true,
  );
  assert.equal(
    f.feature(bob, {
      type: "markCaughtUp",
      circleId: f.circleId,
      seenAt: new Date().toISOString(),
    }).ok,
    true,
  );
  assert.equal(
    (f.call(alice, "features") as FeatureState).readStates.length,
    0,
  );
});
test("unsupported operations fail without deleting data or making provider requests", () => {
  const f = fixture(),
    before = JSON.stringify(f.store());
  assert.throws(
    () => f.act(alice, { type: "deleteAccount" }),
    /not implemented/,
  );
  assert.throws(
    () =>
      execute(f.store(), alice, {
        kind: "room",
        circleId: f.circleId,
        action: "join",
      }),
    /not enabled/,
  );
  assert.equal(JSON.stringify(f.store()), before);
});
