import test from "node:test";
import assert from "node:assert/strict";
import { createSeed } from "../data/seed";
import type { AppState } from "../types";
import type { FeatureState } from "./types";
import { createFeatureSeed } from "./seed";
import {
  emptyFeatures,
  pruneFeatures,
  transitionFeatures,
  visibleFeatures,
  type FeatureAction,
} from "./model";
import { presetThemes } from "./themes";
const now = Date.parse("2026-10-29T12:00:00.000Z");
const app = () => createSeed();
const features = (a = app()) => createFeatureSeed(a, now);
const apply = (state: FeatureState, base: AppState, action: FeatureAction) => {
  const result = transitionFeatures(state, base, action, now);
  assert.equal(result.result.ok, true, result.result.error || "Action failed");
  return result.state;
};

test("feature projections hide unauthorized Circle records, nested responses, and other read states", () => {
  const base = app(),
    state = features(base);
  base.members = base.members.filter(
    (member) => !(member.userId === "alex" && member.circleId === "family"),
  );
  const visible = visibleFeatures(state, base);
  assert(!visible.polls.some((poll) => poll.circleId === "family"));
  assert(!visible.votes.some((vote) => vote.pollId === "poll-family"));
  assert(!visible.events.some((event) => event.circleId === "family"));
  assert(!visible.rsvps.some((rsvp) => rsvp.eventId === "event-family"));
  assert.equal(visible.themes.family, undefined);
  assert(
    visible.readStates.every(
      (read) => read.userId === "alex" && read.circleId !== "family",
    ),
  );
});

test("removed members cannot vote, RSVP, create, manage, theme, or mark caught up", () => {
  const base = app(),
    state = features(base);
  base.members = base.members.filter(
    (member) => !(member.userId === "alex" && member.circleId === "family"),
  );
  const actions: FeatureAction[] = [
    { type: "vote", pollId: "poll-family", optionId: "family-option-1" },
    { type: "rsvpEvent", eventId: "event-family", response: "going" },
    {
      type: "createPoll",
      circleId: "family",
      question: "Unauthorized question?",
      options: ["Yes", "No"],
    },
    {
      type: "createEvent",
      input: {
        circleId: "family",
        title: "Unauthorized event",
        description: "",
        location: "",
        startsAt: new Date(now + 60_000).toISOString(),
        endsAt: new Date(now + 120_000).toISOString(),
      },
    },
    { type: "closePoll", pollId: "poll-family" },
    { type: "deleteEvent", eventId: "event-family" },
    { type: "saveTheme", circleId: "family", theme: presetThemes[0] },
    {
      type: "markCaughtUp",
      circleId: "family",
      seenAt: new Date(now).toISOString(),
    },
  ];
  for (const action of actions)
    assert.equal(
      transitionFeatures(state, base, action, now).result.ok,
      false,
      action.type,
    );
  assert(
    !pruneFeatures(state, base).readStates.some(
      (read) => read.circleId === "family" && read.userId === "alex",
    ),
  );
});

test("sign-out exposes no data and deletion prunes authored content and owned Circle themes", () => {
  const base = app(),
    state = features(base);
  base.currentUserId = null;
  assert.deepEqual(visibleFeatures(state, base), emptyFeatures());
  assert.equal(
    transitionFeatures(
      state,
      base,
      { type: "vote", pollId: "poll-family", optionId: "family-option-1" },
      now,
    ).result.ok,
    false,
  );
  base.users = base.users.filter((user) => user.id !== "sarah");
  base.circles = base.circles.filter((circle) => circle.id !== "family");
  const clean = pruneFeatures(state, base);
  assert(!clean.polls.some((poll) => poll.authorId === "sarah"));
  assert(!clean.events.some((event) => event.circleId === "family"));
  assert.equal(clean.themes.family, undefined);
  assert(!clean.votes.some((vote) => vote.userId === "sarah"));
});

test("a vote changes one selection and rejects options belonging to another poll", () => {
  const base = app();
  let state = features(base);
  state = apply(state, base, {
    type: "vote",
    pollId: "poll-family",
    optionId: "family-option-1",
  });
  state = apply(state, base, {
    type: "vote",
    pollId: "poll-family",
    optionId: "family-option-2",
  });
  const own = state.votes.filter(
    (vote) => vote.pollId === "poll-family" && vote.userId === "alex",
  );
  assert.equal(own.length, 1);
  assert.equal(own[0].optionId, "family-option-2");
  assert.equal(
    transitionFeatures(
      state,
      base,
      { type: "vote", pollId: "poll-family", optionId: "school-option-1" },
      now,
    ).result.ok,
    false,
  );
});

test("closed and expired polls reject votes at the exact expiry boundary", () => {
  const base = app(),
    state = features(base),
    poll = state.polls.find((poll) => poll.id === "poll-family")!;
  poll.closesAt = new Date(now).toISOString();
  assert.equal(
    transitionFeatures(
      state,
      base,
      { type: "vote", pollId: poll.id, optionId: poll.options[0].id },
      now,
    ).result.ok,
    false,
  );
  poll.closesAt = new Date(now + 1000).toISOString();
  poll.closed = true;
  assert.equal(
    transitionFeatures(
      state,
      base,
      { type: "vote", pollId: poll.id, optionId: poll.options[0].id },
      now,
    ).result.ok,
    false,
  );
});

test("poll creation validates options, expiry, and attaches author membership correctly", () => {
  const base = app(),
    state = features(base);
  assert.equal(
    transitionFeatures(
      state,
      base,
      {
        type: "createPoll",
        circleId: "family",
        question: "Choose a day?",
        options: [" Friday ", "friday"],
      },
      now,
    ).result.ok,
    false,
  );
  assert.equal(
    transitionFeatures(
      state,
      base,
      {
        type: "createPoll",
        circleId: "family",
        question: "Choose a day?",
        options: ["Only one"],
      },
      now,
    ).result.ok,
    false,
  );
  assert.equal(
    transitionFeatures(
      state,
      base,
      {
        type: "createPoll",
        circleId: "family",
        question: "Choose a day?",
        options: ["Friday", "Sunday"],
        closesAt: "invalid",
      },
      now,
    ).result.ok,
    false,
  );
  const created = apply(state, base, {
    type: "createPoll",
    circleId: "family",
    question: "  Choose a day?  ",
    options: [" Friday ", " Sunday "],
    closesAt: new Date(now + 1000).toISOString(),
  }).polls[0];
  assert.equal(created.authorId, "alex");
  assert.equal(created.question, "Choose a day?");
  assert.deepEqual(
    created.options.map((option) => option.label),
    ["Friday", "Sunday"],
  );
});

test("only a poll or event author and owner/admin can manage it; moderators cannot grant themselves permission", () => {
  const base = app();
  let state = features(base);
  assert.equal(
    transitionFeatures(
      state,
      base,
      { type: "closePoll", pollId: "poll-family" },
      now,
    ).result.ok,
    false,
  );
  const own = transitionFeatures(
    state,
    base,
    {
      type: "createPoll",
      circleId: "family",
      question: "My own question?",
      options: ["Yes", "No"],
    },
    now,
  );
  assert(own.result.ok);
  state = own.state;
  state = apply(state, base, { type: "closePoll", pollId: own.result.id! });
  assert(state.polls.find((poll) => poll.id === own.result.id)?.closed);
  base.members.find(
    (member) => member.userId === "alex" && member.circleId === "family",
  )!.role = "moderator";
  assert.equal(
    transitionFeatures(
      state,
      base,
      { type: "deletePoll", pollId: "poll-family" },
      now,
    ).result.ok,
    false,
  );
  assert.equal(
    transitionFeatures(
      state,
      base,
      { type: "deleteEvent", eventId: "event-family" },
      now,
    ).result.ok,
    false,
  );
  base.members.find(
    (member) => member.userId === "alex" && member.circleId === "family",
  )!.role = "admin";
  state = apply(state, base, { type: "deletePoll", pollId: "poll-family" });
  state = apply(state, base, { type: "deleteEvent", eventId: "event-family" });
  assert(!state.votes.some((vote) => vote.pollId === "poll-family"));
  assert(!state.rsvps.some((rsvp) => rsvp.eventId === "event-family"));
});

test("events require future times, a later end, and RSVPs replace one response", () => {
  const base = app();
  let state = features(base);
  const input = {
    circleId: "family",
    title: "A small gathering",
    description: "Bring yourself",
    location: "The garden",
    startsAt: new Date(now + 60_000).toISOString(),
    endsAt: new Date(now + 120_000).toISOString(),
  };
  assert.equal(
    transitionFeatures(
      state,
      base,
      {
        type: "createEvent",
        input: { ...input, startsAt: new Date(now - 1000).toISOString() },
      },
      now,
    ).result.ok,
    false,
  );
  assert.equal(
    transitionFeatures(
      state,
      base,
      { type: "createEvent", input: { ...input, endsAt: input.startsAt } },
      now,
    ).result.ok,
    false,
  );
  state = apply(state, base, { type: "createEvent", input });
  const id = state.events.at(-1)!.id;
  state = apply(state, base, {
    type: "rsvpEvent",
    eventId: id,
    response: "going",
  });
  state = apply(state, base, {
    type: "rsvpEvent",
    eventId: id,
    response: "maybe",
  });
  assert.deepEqual(
    state.rsvps.filter((rsvp) => rsvp.eventId === id && rsvp.userId === "alex"),
    [{ eventId: id, userId: "alex", response: "maybe" }],
  );
  assert.equal(
    transitionFeatures(
      state,
      base,
      { type: "rsvpEvent", eventId: id, response: "going" },
      now + 120_000,
    ).result.ok,
    false,
  );
});

test("catch-up cutoff is user-specific, captured, monotonic and cannot be future-dated", () => {
  const base = app();
  let state = features(base);
  const cutoff = new Date(now - 60_000).toISOString();
  state = apply(state, base, {
    type: "markCaughtUp",
    circleId: "family",
    seenAt: cutoff,
  });
  state = apply(state, base, {
    type: "markCaughtUp",
    circleId: "family",
    seenAt: new Date(now - 120_000).toISOString(),
  });
  assert.equal(
    state.readStates.find(
      (read) => read.circleId === "family" && read.userId === "alex",
    )?.seenAt,
    cutoff,
  );
  assert.notEqual(
    state.readStates.find(
      (read) => read.circleId === "family" && read.userId === "james",
    )?.seenAt,
    cutoff,
  );
  assert.equal(
    transitionFeatures(
      state,
      base,
      {
        type: "markCaughtUp",
        circleId: "family",
        seenAt: new Date(now + 1).toISOString(),
      },
      now,
    ).result.ok,
    false,
  );
  assert.equal(
    transitionFeatures(
      state,
      base,
      { type: "markCaughtUp", circleId: "family", seenAt: "invalid" },
      now,
    ).result.ok,
    false,
  );
});

test("only owner/admin can save a validated preset and local mode cannot claim AI provenance", () => {
  const base = app(),
    state = features(base);
  assert.equal(
    transitionFeatures(
      state,
      base,
      { type: "saveTheme", circleId: "family", theme: presetThemes[0] },
      now,
    ).result.ok,
    false,
  );
  const saved = apply(state, base, {
    type: "saveTheme",
    circleId: "football",
    theme: presetThemes[2],
  });
  assert.equal(saved.themes.football.motif, "vegas");
  assert.equal(
    transitionFeatures(
      state,
      base,
      {
        type: "saveTheme",
        circleId: "football",
        theme: { ...presetThemes[0], accent: "url(https://untrusted.invalid)" },
      },
      now,
    ).result.ok,
    false,
  );
  assert.equal(
    transitionFeatures(
      state,
      base,
      {
        type: "saveTheme",
        circleId: "football",
        theme: { ...presetThemes[0], source: "ai" },
      },
      now,
    ).result.ok,
    false,
  );
});

test("blocked authors and responses disappear and cannot be voted on or RSVPed to", () => {
  const base = app(),
    state = features(base);
  base.blocks.push({ userId: "alex", blockedId: "sarah" });
  const visible = visibleFeatures(state, base);
  assert(!visible.polls.some((poll) => poll.authorId === "sarah"));
  assert(!visible.events.some((event) => event.authorId === "sarah"));
  assert(!visible.votes.some((vote) => vote.userId === "sarah"));
  assert.equal(
    transitionFeatures(
      state,
      base,
      { type: "vote", pollId: "poll-family", optionId: "family-option-1" },
      now,
    ).result.ok,
    false,
  );
  assert.equal(
    transitionFeatures(
      state,
      base,
      { type: "rsvpEvent", eventId: "event-family", response: "going" },
      now,
    ).result.ok,
    false,
  );
});

test("failed operations preserve the original state, and JSON roundtrip preserves feature ownership and read cutoffs", () => {
  const base = app(),
    state = features(base),
    original = JSON.stringify(state);
  transitionFeatures(
    state,
    base,
    { type: "closePoll", pollId: "poll-family" },
    now,
  );
  assert.equal(JSON.stringify(state), original);
  assert.deepEqual(
    visibleFeatures(JSON.parse(original), base),
    visibleFeatures(state, base),
  );
});
