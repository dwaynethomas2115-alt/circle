import test from "node:test";
import assert from "node:assert/strict";
import { createSeed } from "../data/seed";
import { AppState } from "../types";
import {
  transition,
  visibleFeed,
  visibleMessages,
  visibleComments,
  Action,
} from "./model";
const apply = (state: AppState, action: Action) => {
  const out = transition(state, action);
  assert.equal(out.result.ok, true, out.result.error || "Action failed");
  return out.state;
};

test("combined feed excludes unjoined Circle content and cannot write across membership", () => {
  const state = createSeed();
  assert(!visibleFeed(state).some((p) => p.circleId === "weekenders"));
  assert.equal(visibleMessages(state, "weekenders").length, 0);
  assert.equal(
    transition(state, {
      type: "createPost",
      input: { circleId: "weekenders", content: "unauthorized" },
    }).result.ok,
    false,
  );
  assert.equal(
    transition(state, {
      type: "sendMessage",
      circleId: "weekenders",
      content: "unauthorized",
    }).result.ok,
    false,
  );
  assert.equal(
    transition(state, {
      type: "addComment",
      postId: "post-weekenders",
      content: "unauthorized",
    }).result.ok,
    false,
  );
  assert.equal(
    transition(state, { type: "toggleReaction", postId: "post-weekenders" })
      .result.ok,
    false,
  );
});

test("removed membership revokes read and write access immediately", () => {
  let state = createSeed();
  state.currentUserId = "sarah";
  state = apply(state, {
    type: "removeMember",
    circleId: "family",
    userId: "alex",
  });
  state.currentUserId = "alex";
  assert(!visibleFeed(state).some((p) => p.circleId === "family"));
  assert.deepEqual(visibleComments(state, "post-family"), []);
  assert.deepEqual(visibleMessages(state, "family"), []);
  assert.equal(
    transition(state, {
      type: "createPost",
      input: { circleId: "family", content: "no" },
    }).result.ok,
    false,
  );
  assert.equal(
    transition(state, {
      type: "sendMessage",
      circleId: "family",
      content: "no",
    }).result.ok,
    false,
  );
});

test("members cannot approve requests, remove others, assign roles, or mint invites", () => {
  const state = createSeed();
  assert.equal(
    transition(state, {
      type: "setRole",
      circleId: "family",
      userId: "alex",
      role: "owner",
    }).result.ok,
    false,
  );
  assert.equal(
    transition(state, {
      type: "removeMember",
      circleId: "family",
      userId: "sarah",
    }).result.ok,
    false,
  );
  assert.equal(
    transition(state, { type: "createInvitation", circleId: "family" }).result
      .ok,
    false,
  );
  const requestState = { ...state, currentUserId: "daniel" };
  assert.equal(
    transition(requestState, {
      type: "respondRequest",
      requestId: "request-daniel",
      approve: true,
    }).result.ok,
    false,
  );
});

test("join requests stay pending until a manager approves", () => {
  let state = createSeed();
  state = apply(state, { type: "requestJoin", circleId: "weekenders" });
  assert(!visibleFeed(state).some((p) => p.circleId === "weekenders"));
  assert.equal(
    transition(state, { type: "requestJoin", circleId: "weekenders" }).result
      .ok,
    false,
  );
  const request = state.requests.find(
    (r) => r.circleId === "weekenders" && r.userId === "alex",
  )!;
  state.currentUserId = "james";
  state = apply(state, {
    type: "respondRequest",
    requestId: request.id,
    approve: true,
  });
  state.currentUserId = "alex";
  assert(visibleFeed(state).some((p) => p.circleId === "weekenders"));
  assert.equal(
    state.notifications.find(
      (n) => n.userId === "alex" && n.type === "approval",
    )?.read,
    false,
  );
});

test("private Circles cannot be requested and invitation is single-use", () => {
  let state = createSeed();
  state.currentUserId = "daniel";
  assert.equal(
    transition(state, { type: "requestJoin", circleId: "family" }).result.ok,
    false,
  );
  state = apply(state, { type: "redeemInvitation", code: "family2026" });
  assert(visibleFeed(state).some((p) => p.circleId === "family"));
  state.currentUserId = "olivia";
  state.members = state.members.filter(
    (m) => !(m.circleId === "family" && m.userId === "olivia"),
  );
  assert.equal(
    transition(state, { type: "redeemInvitation", code: "FAMILY2026" }).result
      .ok,
    false,
  );
});

test("owners transfer ownership before leaving and admins cannot grant admin roles", () => {
  let state = createSeed();
  assert.equal(
    transition(state, { type: "leaveCircle", circleId: "football" }).result.ok,
    false,
  );
  state = apply(state, {
    type: "setRole",
    circleId: "football",
    userId: "james",
    role: "admin",
  });
  state.currentUserId = "james";
  assert.equal(
    transition(state, {
      type: "setRole",
      circleId: "football",
      userId: "daniel",
      role: "admin",
    }).result.ok,
    false,
  );
  state.currentUserId = "alex";
  state = apply(state, {
    type: "setRole",
    circleId: "football",
    userId: "james",
    role: "owner",
  });
  assert.equal(
    state.circles.find((c) => c.id === "football")?.ownerId,
    "james",
  );
  state = apply(state, { type: "leaveCircle", circleId: "football" });
  assert(!visibleFeed(state).some((p) => p.circleId === "football"));
});

test("post reactions toggle, threaded comments reject cross-post parents, authors can delete", () => {
  let state = createSeed();
  const outcome = transition(state, {
    type: "createPost",
    input: { circleId: "family", content: "A new little moment" },
  });
  assert.equal(outcome.result.ok, true);
  state = outcome.state;
  const postId = outcome.result.id!;
  state = apply(state, { type: "toggleReaction", postId });
  assert(state.posts.find((p) => p.id === postId)?.reactions.includes("alex"));
  state = apply(state, { type: "toggleReaction", postId });
  assert(!state.posts.find((p) => p.id === postId)?.reactions.includes("alex"));
  assert.equal(
    transition(state, {
      type: "addComment",
      postId,
      content: "bad parent",
      parentId: "comment-1",
    }).result.ok,
    false,
  );
  state = apply(state, {
    type: "addComment",
    postId,
    content: "A real conversation",
  });
  assert.equal(visibleComments(state, postId).length, 1);
  state = apply(state, { type: "deletePost", postId });
  assert.equal(visibleComments(state, postId).length, 0);
});

test("blocking hides content in both directions and can be undone", () => {
  let state = createSeed();
  state = apply(state, { type: "blockUser", userId: "sarah" });
  assert(!visibleFeed(state).some((p) => p.authorId === "sarah"));
  assert(!visibleMessages(state, "family").some((m) => m.authorId === "sarah"));
  assert.equal(
    transition(state, {
      type: "addComment",
      postId: "post-family",
      content: "no",
    }).result.ok,
    false,
  );
  state.currentUserId = "sarah";
  assert(!visibleMessages(state, "family").some((m) => m.authorId === "alex"));
  state.currentUserId = "alex";
  state = apply(state, { type: "blockUser", userId: "sarah" });
  assert(visibleFeed(state).some((p) => p.authorId === "sarah"));
});

test("signup requires adult confirmation and logout prevents mutations", () => {
  let state = createSeed();
  assert.equal(
    transition(state, {
      type: "signUp",
      name: "New Person",
      username: "newperson",
      email: "new@example.com",
      adult: false,
    }).result.ok,
    false,
  );
  state = apply(state, {
    type: "signUp",
    name: "New Person",
    username: "newperson",
    email: "new@example.com",
    adult: true,
  });
  assert.equal(visibleFeed(state).length, 0);
  state = apply(state, { type: "signOut" });
  assert.equal(state.currentUserId, null);
  assert.equal(
    transition(state, {
      type: "createCircle",
      input: {
        name: "No access",
        description: "",
        category: "Other",
        discoverable: false,
      },
    }).result.ok,
    false,
  );
});

test("creating a Circle creates owner membership and deleting local account removes owned data", () => {
  let state = createSeed();
  const out = transition(state, {
    type: "createCircle",
    input: {
      name: "My new Circle",
      description: "Friends",
      category: "Friends",
      discoverable: false,
    },
  });
  assert(out.result.ok);
  state = out.state;
  const circleId = out.result.id!;
  assert.equal(
    state.members.find((m) => m.circleId === circleId)?.role,
    "owner",
  );
  state = apply(state, {
    type: "createPost",
    input: { circleId, content: "Hello" },
  });
  state = apply(state, { type: "deleteAccount" });
  assert.equal(state.currentUserId, null);
  assert(!state.circles.some((c) => c.id === circleId));
  assert(!state.posts.some((p) => p.circleId === circleId));
});

test("failed actions do not mutate their input or leak a partial update", () => {
  const state = createSeed();
  const original = JSON.stringify(state);
  transition(state, {
    type: "setRole",
    circleId: "family",
    userId: "alex",
    role: "owner",
  });
  assert.equal(JSON.stringify(state), original);
});

test("moderators can remove reported content but cannot manage membership or settings", () => {
  let state = createSeed();
  state = apply(state, {
    type: "report",
    targetType: "post",
    targetId: "post-football",
    reason: "Please review this conversation",
  });
  assert.equal(state.reports[0].circleId, "football");
  state = apply(state, {
    type: "setRole",
    circleId: "football",
    userId: "james",
    role: "moderator",
  });
  state.currentUserId = "james";
  assert.equal(
    transition(state, {
      type: "removeMember",
      circleId: "football",
      userId: "daniel",
    }).result.ok,
    false,
  );
  assert.equal(
    transition(state, {
      type: "updateCircle",
      circleId: "football",
      patch: { discoverable: false },
    }).result.ok,
    false,
  );
  state = apply(state, { type: "deletePost", postId: "post-football" });
  assert(!state.posts.some((p) => p.id === "post-football"));
  assert.equal(
    state.reports[0].circleId,
    "football",
    "a report remains scoped after its content is removed",
  );
  state.currentUserId = "daniel";
  assert.equal(
    transition(state, {
      type: "report",
      targetType: "post",
      targetId: "post-weekenders",
      reason: "Unauthorized target",
    }).result.ok,
    false,
  );
});

test("Circle settings updates cannot smuggle ownership changes through runtime input", () => {
  let state = createSeed();
  state = apply(state, {
    type: "updateCircle",
    circleId: "football",
    patch: {
      name: "Saturday friends",
      ownerId: "james",
      id: "forged-id",
    } as never,
  });
  const circle = state.circles.find((c) => c.id === "football");
  assert.equal(circle?.name, "Saturday friends");
  assert.equal(circle?.ownerId, "alex");
  assert(!state.circles.some((c) => c.id === "forged-id"));
  assert.equal(
    transition(state, {
      type: "updateCircle",
      circleId: "football",
      patch: { name: "" },
    }).result.ok,
    false,
  );
});

test("account deletion cleans owned Circle reports and preserves replies without dangling parents", () => {
  let state = createSeed();
  const outcome = transition(state, {
    type: "addComment",
    postId: "post-family",
    content: "A thought from Alex",
  });
  assert(outcome.result.ok);
  state = outcome.state;
  const parent = outcome.result.id!;
  state.currentUserId = "james";
  state = apply(state, {
    type: "addComment",
    postId: "post-family",
    content: "A reply worth keeping",
    parentId: parent,
  });
  state = apply(state, {
    type: "report",
    targetType: "post",
    targetId: "post-football",
    reason: "Review this post",
  });
  state.currentUserId = "alex";
  state = apply(state, { type: "deleteAccount" });
  assert(!state.reports.some((r) => r.circleId === "football"));
  const reply = state.comments.find(
    (c) => c.content === "A reply worth keeping",
  );
  assert(reply);
  assert.equal(reply.parentId, undefined);
  assert(!state.notifications.some((n) => n.circleId === "football"));
});
