import type { AppState, Post } from "../types";
import type { FeatureState } from "./types";
import { visibleFeed, visibleMessages } from "../state/model";
const DAY = 86_400_000;
export function buildCatchUp(
  app: AppState,
  features: FeatureState,
  circleId: string,
  cutoff = new Date().toISOString(),
) {
  const member =
    app.currentUserId &&
    app.members.some(
      (m) => m.circleId === circleId && m.userId === app.currentUserId,
    );
  const end = Date.parse(cutoff);
  const safeEnd = Number.isFinite(end) ? end : Date.now();
  const read = features.readStates.find(
    (r) => r.circleId === circleId && r.userId === app.currentUserId,
  );
  const saved = read ? Date.parse(read.seenAt) : NaN;
  const start = Number.isFinite(saved)
    ? Math.min(saved, safeEnd)
    : safeEnd - 7 * DAY;
  const empty = {
    authorized: false,
    since: new Date(start).toISOString(),
    cutoff: new Date(safeEnd).toISOString(),
    posts: [] as Post[],
    montage: [] as Post[],
    commentCount: 0,
    messageCount: 0,
    polls: [] as FeatureState["polls"],
    events: [] as FeatureState["events"],
    total: 0,
  };
  if (!member) return empty;
  const inWindow = (date: string) =>
    Date.parse(date) > start && Date.parse(date) <= safeEnd;
  const visible = visibleFeed(app).filter(
    (p) => p.circleId === circleId && Date.parse(p.createdAt) <= safeEnd,
  );
  const posts = visible.filter((p) => inWindow(p.createdAt));
  const postIds = new Set(visible.map((p) => p.id));
  const blocked = (id: string) =>
    app.blocks.some(
      (b) =>
        (b.userId === app.currentUserId && b.blockedId === id) ||
        (b.blockedId === app.currentUserId && b.userId === id),
    );
  const commentCount = app.comments.filter(
    (c) =>
      postIds.has(c.postId) && !blocked(c.authorId) && inWindow(c.createdAt),
  ).length;
  const messageCount = visibleMessages(app, circleId).filter((m) =>
    inWindow(m.createdAt),
  ).length;
  const polls = features.polls.filter(
    (p) => p.circleId === circleId && inWindow(p.createdAt),
  );
  const events = features.events
    .filter((e) => e.circleId === circleId && Date.parse(e.endsAt) >= safeEnd)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const montage = (
    posts.length
      ? posts
      : visible.filter((p) => Date.parse(p.createdAt) >= safeEnd - 7 * DAY)
  )
    .slice(0, 12)
    .reverse();
  return {
    ...empty,
    authorized: true,
    posts,
    montage,
    commentCount,
    messageCount,
    polls,
    events,
    total: posts.length + commentCount + messageCount + polls.length,
  };
}
