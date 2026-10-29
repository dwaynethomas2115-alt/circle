import test from "node:test";
import assert from "node:assert/strict";
import { createSeed } from "../data/seed";
import { buildCatchUp } from "./catchup";
import type { FeatureState } from "./types";
const blank = (): FeatureState => ({
  version: 1,
  polls: [],
  votes: [],
  events: [],
  rsvps: [],
  themes: {},
  readStates: [],
});
test("catch-up counts only authorized Circle activity and hides blocked authors", () => {
  const app = createSeed(),
    features = blank();
  const cutoff = new Date(Date.now() + 1000).toISOString();
  const family = buildCatchUp(app, features, "family", cutoff);
  assert.equal(family.authorized, true);
  assert.ok(family.posts.length > 0);
  assert.ok(family.posts.every((p) => p.circleId === "family"));
  assert.equal(buildCatchUp(app, features, "weekenders", cutoff).total, 0);
  app.blocks.push({ userId: "alex", blockedId: family.posts[0].authorId });
  assert.equal(buildCatchUp(app, features, "family", cutoff).posts.length, 0);
});
test("marking a catch-up stops recounting old activity and preserves later arrivals", () => {
  const app = createSeed(),
    features = blank();
  const cutoff = new Date().toISOString();
  features.readStates.push({
    circleId: "family",
    userId: "alex",
    seenAt: cutoff,
  });
  assert.equal(buildCatchUp(app, features, "family", cutoff).total, 0);
  app.posts.push({
    id: "later",
    circleId: "family",
    authorId: "alex",
    content: "Later",
    createdAt: new Date(Date.parse(cutoff) + 2000).toISOString(),
    reactions: [],
  });
  assert.equal(
    buildCatchUp(
      app,
      features,
      "family",
      new Date(Date.parse(cutoff) + 3000).toISOString(),
    ).posts[0].id,
    "later",
  );
});
test("membership removal excludes montage and calendars even with cached content", () => {
  const app = createSeed(),
    features = blank();
  features.events.push({
    id: "event",
    circleId: "family",
    authorId: "alex",
    title: "Lunch",
    description: "",
    location: "",
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
  });
  app.members = app.members.filter(
    (m) => !(m.circleId === "family" && m.userId === "alex"),
  );
  const result = buildCatchUp(app, features, "family");
  assert.equal(result.authorized, false);
  assert.deepEqual(result.montage, []);
  assert.deepEqual(result.events, []);
});
test("another users read position does not hide your catch-up", () => {
  const app = createSeed(),
    features = blank();
  features.readStates.push({
    circleId: "family",
    userId: "sarah",
    seenAt: new Date().toISOString(),
  });
  assert.ok(buildCatchUp(app, features, "family").posts.length > 0);
});
