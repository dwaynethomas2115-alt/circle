import test from "node:test";
import assert from "node:assert/strict";
import { createPostDraftStore, type PostDraft } from "../state/postDrafts";

const draft = (circleId = "family"): PostDraft => ({
  circleId,
  content: "Keep this caption",
  media: [
    {
      id: "chosen-8",
      uri: "blob:https://circle.test/local-8",
      type: "image",
      width: 1200,
      height: 900,
    },
    {
      id: "chosen-9",
      uri: "file:///local/photo-9.jpg",
      type: "image",
      width: 900,
      height: 1200,
    },
  ],
  activeId: "chosen-9",
});
function connected(accountId = "alice", circleIds = ["family", "trip"]) {
  return { status: "authenticated" as const, accountId, circleIds };
}

test("recovery retains local caption, photo order and selection but cannot restore or accept late writes until freshly authorized", () => {
  const store = createPostDraftStore();
  store.observe(connected());
  const lease = store.open("family");
  assert.ok(lease);
  assert.equal(store.write(lease, draft()), true);
  store.observe({ status: "unknown", accountId: "alice", circleIds: [] });
  assert.equal(store.restore("family"), null);
  assert.equal(
    store.write(lease, { ...draft(), content: "late picker" }),
    false,
  );
  store.observe(connected());
  assert.deepEqual(store.restore("family"), draft());
  assert.equal(
    store.write(lease, draft()),
    false,
    "reconnection does not renew an old mount's write lease",
  );
  const resumed = store.open("family");
  assert.equal(
    store.write(resumed, { ...draft(), content: "Resumed manually" }),
    true,
  );
  assert.equal(store.restore()?.content, "Resumed manually");
});

test("a failed account check can retain a hidden draft without assuming an identity", () => {
  const store = createPostDraftStore();
  store.observe(connected());
  store.write(store.open("family"), draft());
  store.observe({ status: "unknown", circleIds: [] });
  assert.equal(store.restore(), null);
  assert.equal(store.open("family"), null);
  store.observe(connected());
  assert.deepEqual(store.restore(), draft());
});

test("sign-out, explicit local clearing and verified account changes erase the prior account's draft", () => {
  for (const boundary of [
    "signedOut",
    "clear",
    "authenticatedOther",
    "uncertainOther",
  ]) {
    const store = createPostDraftStore();
    store.observe(connected());
    const lease = store.open("family");
    store.write(lease, draft());
    if (boundary === "signedOut")
      store.observe({ status: "signedOut", circleIds: [] });
    if (boundary === "clear") store.clear();
    if (boundary === "authenticatedOther") store.observe(connected("bob"));
    if (boundary === "uncertainOther")
      store.observe({ status: "unknown", accountId: "bob", circleIds: [] });
    assert.equal(store.write(lease, draft()), false);
    store.observe(connected());
    assert.equal(store.restore(), null, boundary);
  }
});

test("verified membership revocation clears local photos and never restores them after membership returns", () => {
  const store = createPostDraftStore();
  store.observe(connected());
  const lease = store.open("family");
  store.write(lease, draft());
  store.observe(connected("alice", ["trip"]));
  assert.equal(store.restore("family"), null);
  assert.equal(store.open("family"), null);
  assert.equal(store.write(lease, draft()), false);
  store.observe(connected());
  assert.equal(store.restore("family"), null);
});

test("requested-Circle mismatch does not restore or mix content, and a new lease fences prior-Circle callbacks", () => {
  const store = createPostDraftStore();
  store.observe(connected());
  const family = store.open("family");
  store.write(family, draft());
  assert.equal(store.restore("trip"), null);
  const trip = store.open("trip");
  assert.equal(store.write(family, draft()), false);
  assert.equal(
    store.write(trip, draft()),
    false,
    "a lease cannot store another Circle's data",
  );
  assert.equal(
    store.write(trip, { ...draft("trip"), content: "Trip draft" }),
    true,
  );
  assert.equal(
    store.complete(family),
    false,
    "late success must not clear the other Circle's draft",
  );
  assert.equal(store.restore("trip")?.content, "Trip draft");
  assert.equal(store.restore("family"), null);
});

test("recovery restores a changed target Circle from its originating composer route without mixing explicit other routes", () => {
  const store = createPostDraftStore();
  store.observe(connected());
  const selected = {
    ...draft("trip"),
    routeCircleId: "family",
    content: "Selected Trip inside the Family composer",
  };
  store.write(store.open("trip"), selected);
  store.observe({ status: "unknown", accountId: "alice", circleIds: [] });
  assert.equal(
    store.restore("family"),
    null,
    "recovery cannot display local input before authorization",
  );
  store.observe(connected("alice", ["family", "trip", "other-circle"]));
  assert.deepEqual(store.restore("family"), selected);
  assert.deepEqual(store.restore("trip"), selected);
  assert.equal(
    store.restore("other-circle"),
    null,
    "a different explicit route must start its own draft",
  );
  store.observe(connected("alice", ["family", "other-circle"]));
  assert.equal(
    store.restore("family"),
    null,
    "the original route grants no access to the revoked target Circle",
  );
  store.observe(connected());
  assert.equal(
    store.restore("family"),
    null,
    "revocation erased the target draft rather than hiding it for later",
  );
});

test("confirmed post success clears its exact draft even after recovery, but not a newer mount's input", () => {
  const store = createPostDraftStore();
  store.observe(connected());
  const original = store.open("family");
  store.write(original, draft());
  store.observe({ status: "unknown", circleIds: [] });
  assert.equal(store.complete(original), true);
  store.observe(connected());
  assert.equal(store.restore(), null);
  const old = store.open("family");
  store.write(old, draft());
  const newer = store.open("family");
  store.write(newer, { ...draft(), content: "Newer edit" });
  assert.equal(store.complete(old), false);
  assert.equal(store.write(old, draft()), false);
  assert.equal(store.restore()?.content, "Newer edit");
  assert.equal(store.complete(newer), true);
  assert.equal(store.restore(), null);
});

test("unrelated Circle membership changes retain the current draft and allow edits after renewing the lease", () => {
  const store = createPostDraftStore();
  store.observe(connected());
  const old = store.open("family");
  store.write(old, draft());
  store.observe(connected("alice", ["family", "trip", "new-circle"]));
  assert.deepEqual(store.restore("family"), draft());
  assert.equal(store.isCurrent(old), false);
  const renewed = store.open("family");
  assert.equal(
    store.write(renewed, { ...draft(), content: "Still editable" }),
    true,
  );
  assert.equal(store.restore()?.content, "Still editable");
});

test("draft storage accepts local selections only and does not retain signed or reusable server URLs", () => {
  const store = createPostDraftStore();
  store.observe(connected());
  const lease = store.open("family");
  for (const uri of [
    "https://circle.test/private.jpg?token=secret",
    "awfile:11111111-1111-4111-8111-111111111111",
    "/private.jpg",
    "http://server/photo.jpg",
  ]) {
    const input = draft();
    input.media[0].uri = uri;
    assert.equal(store.write(lease, input), false);
    assert.equal(store.restore(), null);
  }
  for (const uri of [
    "file:///photo.jpg",
    "blob:https://circle.test/photo",
    "data:image/jpeg;base64,AAAA",
    "content://local/photo",
    "ph:local-photo",
    "assets-library://local/photo",
  ]) {
    const input = draft();
    input.media[0].uri = uri;
    assert.equal(store.write(lease, input), true);
  }
});

test("draft snapshots are copied so callbacks cannot mutate stored input without a valid lease", () => {
  const store = createPostDraftStore();
  store.observe(connected());
  const input = draft();
  store.write(store.open("family"), input);
  input.media.reverse();
  const restored = store.restore()!;
  restored.content = "outside mutation";
  restored.media[0].uri = "https://server/private?token=bad";
  assert.deepEqual(store.restore(), draft());
});
