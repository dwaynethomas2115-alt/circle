import { createHash } from "node:crypto";
import type { Store } from "./domain";
import type { Table } from "./tables";
import type { Post } from "../../src/types";
import type { CirclePoll } from "../../src/features/types";
export type Value = Record<string, any>; // Runtime rows validated at the command boundary.
export interface RecordData {
  entity_id: string;
  scope_id: string;
  actor_id: string;
  related_id: string;
  sort_at: string;
  data: string;
}
export interface Entity {
  table: Table;
  id: string;
  data: RecordData;
}
export const rowId = (id: string) =>
  createHash("sha256").update(id).digest("hex").slice(0, 32);
export const parse = (row: Value) => JSON.parse(row.data) as Value;
export function record(
  table: Table,
  id: string,
  value: unknown,
  scope = "",
  actor = "",
  related = "",
  time = "",
): Entity {
  const data = JSON.stringify(value);
  if (Buffer.byteLength(data) > 32768)
    throw new Error(`This ${table} record exceeds its individual size limit.`);
  return {
    table,
    id: rowId(id),
    data: {
      entity_id: id,
      scope_id: scope,
      actor_id: actor,
      related_id: related,
      sort_at: time,
      data,
    },
  };
}
/** Normalize the loaded domain slice. Only differences in this slice are persisted. */
export function records(store: Store): Map<string, Entity> {
  const result = new Map<string, Entity>();
  const put = (entity: Entity) => {
    result.set(`${entity.table}/${entity.id}`, entity);
  };
  const app = store.app,
    features = store.features;
  for (const p of app.users)
    put(record("profiles", p.id, p, "", p.id, p.username));
  for (const c of app.circles)
    put(
      record(
        "circles",
        c.id,
        c,
        c.id,
        c.ownerId,
        c.discoverable ? "public" : "private",
        c.createdAt,
      ),
    );
  for (const m of app.members)
    put(
      record(
        "members",
        `${m.circleId}:${m.userId}`,
        m,
        m.circleId,
        m.userId,
        "",
        m.joinedAt,
      ),
    );
  for (const r of app.requests)
    put(
      record(
        "join_requests",
        r.id,
        r,
        r.circleId,
        r.userId,
        r.status,
        r.createdAt,
      ),
    );
  for (const i of app.invitations)
    put(
      record(
        "invitations",
        i.id,
        i,
        i.circleId,
        i.createdBy,
        i.code,
        i.expiresAt,
      ),
    );
  for (const p of app.posts) {
    const { reactions, ...body } = p;
    put(record("posts", p.id, body, p.circleId, p.authorId, "", p.createdAt));
    for (const uid of reactions)
      put(
        record(
          "reactions",
          `${p.id}:${uid}`,
          { postId: p.id, userId: uid },
          p.circleId,
          uid,
          p.id,
        ),
      );
  }
  for (const c of app.comments)
    put(
      record(
        "comments",
        c.id,
        c,
        app.posts.find((p) => p.id === c.postId)?.circleId || "",
        c.authorId,
        c.postId,
        c.createdAt,
      ),
    );
  for (const m of app.messages)
    put(record("messages", m.id, m, m.circleId, m.authorId, "", m.createdAt));
  for (const n of app.notifications)
    put(
      record(
        "notifications",
        n.id,
        n,
        n.postId || n.circleId || "",
        n.userId,
        n.read ? "read" : "unread",
        n.createdAt,
      ),
    );
  for (const b of app.blocks)
    put(
      record(
        "blocks",
        `${b.userId}:${b.blockedId}`,
        b,
        "",
        b.userId,
        b.blockedId,
      ),
    );
  for (const r of app.reports)
    put(
      record(
        "reports",
        r.id,
        r,
        r.circleId || "",
        r.userId,
        r.targetId,
        r.createdAt,
      ),
    );
  for (const p of features.polls) {
    const { options, ...body } = p;
    put(record("polls", p.id, body, p.circleId, p.authorId, "", p.createdAt));
    for (const [position, o] of options.entries())
      put(
        record(
          "poll_options",
          o.id,
          { ...o, pollId: p.id, position },
          p.circleId,
          "",
          p.id,
        ),
      );
  }
  for (const v of features.votes)
    put(
      record(
        "votes",
        `${v.pollId}:${v.userId}`,
        v,
        features.polls.find((p) => p.id === v.pollId)?.circleId || "",
        v.userId,
        v.pollId,
      ),
    );
  for (const e of features.events)
    put(record("events", e.id, e, e.circleId, e.authorId, "", e.createdAt));
  for (const r of features.rsvps)
    put(
      record(
        "rsvps",
        `${r.eventId}:${r.userId}`,
        r,
        features.events.find((e) => e.id === r.eventId)?.circleId || "",
        r.userId,
        r.eventId,
      ),
    );
  for (const [cid, t] of Object.entries(features.themes))
    put(record("themes", cid, t, cid));
  for (const r of features.readStates)
    put(
      record(
        "read_states",
        `${r.circleId}:${r.userId}`,
        r,
        r.circleId,
        r.userId,
        "",
        r.seenAt,
      ),
    );
  for (const [id, u] of Object.entries(store.uploads || {}))
    put(
      record(
        "uploads",
        id,
        u,
        "",
        u.owner,
        u.canceled ? "canceled" : u.ready ? "ready" : "pending",
        new Date(u.createdAt).toISOString(),
      ),
    );
  for (const [uid, times] of Object.entries(store.generations || {}))
    put(record("ai_quotas", uid, times, "", uid));
  for (const [uid, p] of Object.entries(store.proposals || {}))
    put(record("ai_proposals", uid, p, p.circleId, uid));
  for (const entity of [...result.values()]) {
    if (!["profiles", "circles", "posts"].includes(entity.table)) continue;
    const value = parse(entity.data),
      paths = [value.avatar, value.cover, value.media];
    for (const path of paths)
      if (typeof path === "string" && path.startsWith("awfile:")) {
        const fileId = path.slice(7),
          key = `${entity.table}:${entity.data.entity_id}:${fileId}`;
        put(
          record(
            "media_refs",
            key,
            { table: entity.table, entityId: entity.data.entity_id, fileId },
            entity.data.scope_id,
            entity.data.actor_id,
            fileId,
          ),
        );
      }
  }
  return result;
}
/** Reassemble one bounded/targeted slice for existing server-authorized domain rules. */
export function assemble(rows: Map<Table, Value[]>, store: Store): Store {
  const vals = (t: Table) => rows.get(t) || [];
  const app = store.app,
    f = store.features;
  app.users = vals("profiles") as typeof app.users;
  app.circles = vals("circles") as typeof app.circles;
  app.members = vals("members") as typeof app.members;
  app.requests = vals("join_requests") as typeof app.requests;
  app.invitations = vals("invitations") as typeof app.invitations;
  app.posts = vals("posts").map((p) => ({
    ...p,
    reactions: vals("reactions")
      .filter((r) => r.postId === p.id)
      .map((r) => r.userId),
  })) as Post[];
  app.comments = vals("comments") as typeof app.comments;
  app.messages = vals("messages") as typeof app.messages;
  app.notifications = vals("notifications") as typeof app.notifications;
  app.blocks = vals("blocks") as typeof app.blocks;
  app.reports = vals("reports") as typeof app.reports;
  f.polls = vals("polls").map((p) => ({
    ...p,
    options: vals("poll_options")
      .filter((o) => o.pollId === p.id)
      .sort((a, b) => a.position - b.position)
      .map((o) => ({ id: o.id, label: o.label })),
  })) as CirclePoll[];
  f.votes = vals("votes") as typeof f.votes;
  f.events = vals("events") as typeof f.events;
  f.rsvps = vals("rsvps") as typeof f.rsvps;
  f.readStates = vals("read_states") as typeof f.readStates;
  return store;
}
