import { randomUUID, createHash } from "node:crypto";
import { Query, type TablesDB } from "node-appwrite";
import { emptyStore, execute, type Identity, type Store } from "./domain";
import {
  record,
  records,
  assemble,
  parse,
  rowId,
  type Value,
  type Entity,
} from "./records";
import type { Table } from "./tables";
import type { z } from "zod";
import type { requestSchema } from "./schema";
export type Request = z.infer<typeof requestSchema>;
export type Database = Pick<
  TablesDB,
  | "getRow"
  | "listRows"
  | "createRow"
  | "updateRow"
  | "deleteRow"
  | "createTransaction"
  | "updateTransaction"
>;
export class Conflict extends Error {
  code = 409;
}
const PAGE = 100;
const hashInvite = (code: string) =>
  createHash("sha256")
    .update(code.trim().toUpperCase())
    .digest("hex")
    .toUpperCase();
export class Repository {
  constructor(
    readonly db: Database,
    readonly databaseId: string,
  ) {}
  async get(
    table: Table,
    id: string,
    transactionId?: string,
  ): Promise<Value | null> {
    try {
      return await this.db.getRow({
        databaseId: this.databaseId,
        tableId: table,
        rowId: rowId(id),
        transactionId,
      });
    } catch (e) {
      if ((e as { code?: number }).code === 404) return null;
      throw e;
    }
  }
  async list(
    table: Table,
    column: string,
    values: string[],
    transactionId?: string,
    limit?: number,
    extra: string[] = [],
  ): Promise<Value[]> {
    const all: Value[] = [];
    for (let offset = 0; offset < values.length; offset += 50) {
      let cursor: string | undefined;
      let count = 0;
      do {
        const queries = [
          Query.equal(column, values.slice(offset, offset + 50)),
          ...extra,
          Query.limit(limit ? Math.min(PAGE, limit - count) : PAGE),
          limit ? Query.orderDesc("sort_at") : Query.orderAsc("$id"),
        ];
        if (cursor) queries.push(Query.cursorAfter(cursor));
        const page = await this.db.listRows({
          databaseId: this.databaseId,
          tableId: table,
          queries,
          transactionId,
          total: false,
        });
        all.push(...page.rows);
        count += page.rows.length;
        cursor =
          page.rows.length === PAGE && (!limit || count < limit)
            ? page.rows.at(-1)!.$id
            : undefined;
      } while (cursor);
    }
    return [...new Map(all.map((r) => [r.$id, r])).values()];
  }
  /** Pre-transaction lookups route commands only; all authorization is reloaded after guards. */
  async scopes(identity: Identity, request: Request): Promise<string[]> {
    if (
      request.kind === "snapshot" ||
      request.kind === "features" ||
      (request.kind === "action" && request.action.type === "blockUser")
    )
      return (await this.list("members", "actor_id", [identity.$id])).map(
        (r) => r.scope_id,
      );
    if ("circleId" in request) return [request.circleId];
    if (!("action" in request)) return [];
    const a = request.action;
    if ("circleId" in a) return [a.circleId];
    if ("input" in a && "circleId" in a.input) return [a.input.circleId];
    const targets: [string, Table][] = [
      ["postId", "posts"],
      ["commentId", "comments"],
      ["messageId", "messages"],
      ["requestId", "join_requests"],
      ["pollId", "polls"],
      ["eventId", "events"],
    ];
    for (const [key, table] of targets)
      if (key in a) {
        const row = await this.get(table, String((a as Value)[key]));
        return row ? [row.scope_id] : [];
      }
    if (a.type === "report") {
      const table =
        a.targetType === "post"
          ? "posts"
          : a.targetType === "comment"
            ? "comments"
            : "messages";
      const row = await this.get(table, a.targetId);
      return row ? [row.scope_id] : [];
    }
    if (a.type === "redeemInvitation")
      return (
        await this.list("invitations", "related_id", [hashInvite(a.code)])
      ).map((r) => r.scope_id);
    return [];
  }
  async guard(key: string, transactionId: string) {
    const old = await this.get("guards", key, transactionId),
      entity = record("guards", key, { nonce: randomUUID() });
    const args = {
      databaseId: this.databaseId,
      tableId: "guards",
      rowId: entity.id,
      data: entity.data,
      permissions: [],
      transactionId,
    };
    if (old) await this.db.updateRow(args);
    else await this.db.createRow(args);
  }
  async stamps(keys: string[]) {
    return Promise.all(
      keys.map(
        async (key) => (await this.get("guards", key))?.data || "missing",
      ),
    );
  }
  async load(
    identity: Identity,
    request: Request,
    scopes: string[],
    transactionId?: string,
  ): Promise<Store> {
    const store = emptyStore(),
      rows = new Map<Table, Value[]>();
    const merge = (table: Table, items: Value[]) => {
      const prior = rows.get(table) || [];
      rows.set(table, [
        ...new Map([...prior, ...items].map((r) => [r.$id, r])).values(),
      ]);
    };
    const load = async (
      table: Table,
      column: string,
      ids: string[],
      limit?: number,
    ) =>
      merge(table, await this.list(table, column, ids, transactionId, limit));
    const get = async (table: Table, id: string) => {
      const row = await this.get(table, id, transactionId);
      if (row) merge(table, [row]);
      return row;
    };
    const snapshot = request.kind === "snapshot",
      features = request.kind === "features",
      reading = snapshot || features;
    const a: Value | null =
        request.kind === "action" || request.kind === "featureAction"
          ? request.action
          : null,
      type = a?.type;
    await get("profiles", identity.$id);
    await Promise.all([
      load("circles", "entity_id", scopes),
      snapshot ||
      ["createPost", "requestJoin", "blockUser"].includes(type || "")
        ? load("members", "scope_id", scopes)
        : Promise.all(
            scopes.map((cid) => get("members", `${cid}:${identity.$id}`)),
          ),
      load("blocks", "actor_id", [identity.$id]),
      load("blocks", "related_id", [identity.$id]),
    ]);
    if (snapshot) {
      await Promise.all([
        load("circles", "related_id", ["public"], 100),
        load("members", "actor_id", [identity.$id]),
        load("join_requests", "actor_id", [identity.$id], 100),
        load("join_requests", "scope_id", scopes, 100),
        load("posts", "scope_id", scopes, 100),
        load("messages", "scope_id", scopes, 100),
        load("reports", "scope_id", scopes, 100),
        load("notifications", "actor_id", [identity.$id], 100),
      ]);
    }
    if (features) {
      await Promise.all([
        load("polls", "scope_id", scopes, 100),
        load("events", "scope_id", scopes, 100),
        load("themes", "scope_id", scopes),
        load("read_states", "actor_id", [identity.$id]),
      ]);
    }
    if (!reading && a) {
      if (["setRole", "removeMember"].includes(type || ""))
        for (const cid of scopes) await get("members", `${cid}:${a.userId}`);
      if ("postId" in a) await get("posts", a.postId);
      if ("commentId" in a) await get("comments", a.commentId);
      if ("messageId" in a) await get("messages", a.messageId);
      if ("requestId" in a) await get("join_requests", a.requestId);
      if ("pollId" in a) await get("polls", a.pollId);
      if ("eventId" in a) await get("events", a.eventId);
      if (type === "report")
        await get(
          a.targetType === "post"
            ? "posts"
            : a.targetType === "comment"
              ? "comments"
              : "messages",
          a.targetId,
        );
      if (
        type === "respondRequest" ||
        type === "requestJoin" ||
        type === "removeMember" ||
        type === "leaveCircle"
      )
        await load("join_requests", "scope_id", scopes);
      if (type === "removeMember" || type === "leaveCircle")
        await load("invitations", "scope_id", scopes);
      if (type === "redeemInvitation")
        await load("invitations", "related_id", [hashInvite(a.code)]);
      if (type === "markRead")
        merge(
          "notifications",
          await this.list(
            "notifications",
            "actor_id",
            [identity.$id],
            transactionId,
            80,
            [Query.equal("related_id", "unread")],
          ),
        );
      if (type === "markCaughtUp")
        await get("read_states", `${a.circleId}:${identity.$id}`);
      if (type === "saveTheme") {
        await get("themes", a.circleId);
        await get("ai_proposals", identity.$id);
      }
      if (type === "updateProfile" && a.patch.username)
        await load("profiles", "related_id", [
          a.patch.username.trim().replace(/^@/, "").toLowerCase(),
        ]);
    }
    if (type === "respondRequest")
      for (const row of rows.get("join_requests") || []) {
        const target = parse(row);
        await get("members", `${target.circleId}:${target.userId}`);
      }
    // A comment command needs its parent post, even if that post is outside the recent window.
    for (const row of rows.get("comments") || [])
      await get("posts", parse(row).postId);
    const postIds = (rows.get("posts") || []).map((r) => r.entity_id);
    if (postIds.length) {
      await load("reactions", "related_id", postIds);
      if (
        snapshot ||
        ["deletePost", "addComment", "deleteComment"].includes(type || "")
      )
        await load("comments", "related_id", postIds);
      if (type === "deletePost")
        await load("notifications", "scope_id", postIds);
    }
    const pollIds = (rows.get("polls") || []).map((r) => r.entity_id),
      eventIds = (rows.get("events") || []).map((r) => r.entity_id);
    await Promise.all([
      load("poll_options", "related_id", pollIds),
      load("votes", "related_id", pollIds),
      load("rsvps", "related_id", eventIds),
    ]);
    const relevant = new Set([identity.$id]);
    for (const [table, items] of rows)
      if (
        ["members", "join_requests", "posts", "comments", "messages"].includes(
          table,
        )
      )
        for (const r of items) relevant.add(r.actor_id);
    await load("profiles", "entity_id", [...relevant]);
    const parsed = new Map<Table, Value[]>();
    for (const [table, items] of rows) parsed.set(table, items.map(parse));
    assemble(parsed, store);
    store.features.themes = Object.fromEntries(
      (rows.get("themes") || []).map((r) => [r.scope_id, parse(r)]),
    ) as Store["features"]["themes"];
    store.proposals = Object.fromEntries(
      (rows.get("ai_proposals") || []).map((r) => [r.actor_id, parse(r)]),
    ) as Store["proposals"];
    if (request.kind === "beginUpload")
      merge(
        "uploads",
        await this.list(
          "uploads",
          "actor_id",
          [identity.$id],
          transactionId,
          11,
          [
            Query.equal("related_id", "pending"),
            Query.greaterThan(
              "sort_at",
              new Date(Date.now() - 86400000).toISOString(),
            ),
          ],
        ),
      );
    if (request.kind === "finishUpload") await get("uploads", request.fileId);
    if (request.kind === "generateTheme") {
      await get("ai_quotas", identity.$id);
      await get("ai_proposals", identity.$id);
    }
    const strings = reading
      ? [
          ...store.app.users.map((u) => u.avatar),
          ...store.app.circles.flatMap((c) => [c.avatar, c.cover]),
          ...store.app.posts.map((p) => p.media),
        ]
      : [];
    const body = JSON.stringify(request);
    for (const match of body.matchAll(/awfile:([a-f0-9-]{36})/g))
      strings.push(match[0]);
    for (const id of new Set(
      strings
        .filter((s): s is string => Boolean(s?.startsWith("awfile:")))
        .map((s) => s.slice(7)),
    ))
      await get("uploads", id);
    store.uploads = Object.fromEntries(
      (rows.get("uploads") || []).map((r) => [r.entity_id, parse(r)]),
    ) as Store["uploads"];
    store.generations = Object.fromEntries(
      (rows.get("ai_quotas") || []).map((r) => [
        r.actor_id,
        JSON.parse(r.data),
      ]),
    );
    store.proposals = Object.fromEntries(
      (rows.get("ai_proposals") || []).map((r) => [r.actor_id, parse(r)]),
    ) as Store["proposals"];
    return store;
  }
  async persist(
    before: Store,
    after: Store,
    transactionId: string,
    guardCount: number,
  ) {
    const old = records(before),
      next = records(after),
      changes: { kind: "create" | "update" | "delete"; entity: Entity }[] = [];
    for (const [key, value] of next) {
      const prior = old.get(key);
      if (!prior) changes.push({ kind: "create", entity: value });
      else if (JSON.stringify(prior.data) !== JSON.stringify(value.data))
        changes.push({ kind: "update", entity: value });
    }
    for (const [key, value] of old)
      if (!next.has(key)) changes.push({ kind: "delete", entity: value });
    // Unique deterministic claim rows arbitrate concurrent usernames across users.
    for (const user of after.app.users) {
      const prior = before.app.users.find((u) => u.id === user.id);
      if (prior?.username === user.username) continue;
      if (prior)
        changes.push({
          kind: "delete",
          entity: record("usernames", prior.username, { userId: user.id }),
        });
      changes.push({
        kind: "create",
        entity: record(
          "usernames",
          user.username,
          { userId: user.id },
          "",
          user.id,
        ),
      });
    }
    if (changes.length + guardCount > 100)
      throw new Error(
        "This operation exceeds the Appwrite free-plan transaction budget. No changes were committed; reduce the operation size or configure a larger plan/worker workflow.",
      );
    for (const { kind, entity } of changes) {
      const args = {
        databaseId: this.databaseId,
        tableId: entity.table,
        rowId: entity.id,
        transactionId,
      };
      if (kind === "delete") await this.db.deleteRow(args);
      else if (kind === "create")
        await this.db.createRow({
          ...args,
          data: entity.data,
          permissions: [],
        });
      else
        await this.db.updateRow({
          ...args,
          data: entity.data,
          permissions: [],
        });
    }
  }
  async mutate<T>(
    identity: Identity,
    request: Request,
    work: (store: Store) => Promise<{ store: Store; data: T }>,
  ): Promise<{ store: Store; data: T }> {
    const scopes = [...new Set(await this.scopes(identity, request))];
    const fileIds = [
      ...JSON.stringify(request).matchAll(/awfile:([a-f0-9-]{36})/g),
    ].map((m) => m[1]);
    if (request.kind === "finishUpload") fileIds.push(request.fileId);
    const keys = [
      `user:${identity.$id}`,
      ...scopes.map((id) => `circle:${id}`),
      ...fileIds.map((id) => `upload:${id}`),
    ].sort();
    let tx: string | undefined = (await this.db.createTransaction({ ttl: 60 }))
      .$id;
    try {
      for (const key of [...new Set(keys)]) await this.guard(key, tx);
      const before = await this.load(identity, request, scopes, tx),
        result = await work(structuredClone(before));
      // New-circle guard is created atomically with owner membership and metadata.
      const created = result.store.app.circles.filter(
        (c) => !before.app.circles.some((p) => p.id === c.id),
      );
      for (const c of created) await this.guard(`circle:${c.id}`, tx);
      await this.persist(
        before,
        result.store,
        tx,
        new Set(keys).size + created.length,
      );
      const committed = await this.db.updateTransaction({
        transactionId: tx,
        commit: true,
      });
      if (committed.status !== "committed")
        throw new Error(
          "Appwrite did not confirm the commit. Refresh before retrying; outcome may be pending.",
        );
      tx = undefined;
      return result;
    } catch (e) {
      if (tx)
        await this.db
          .updateTransaction({ transactionId: tx, rollback: true })
          .catch(() => undefined);
      throw e;
    }
  }
  async read(identity: Identity, request: Request) {
    const scopes = [...new Set(await this.scopes(identity, request))],
      keys = [`user:${identity.$id}`, ...scopes.map((id) => `circle:${id}`)];
    const before = await this.stamps(keys),
      store = await this.load(identity, request, scopes);
    if (!store.app.users.some((u) => u.id === identity.$id))
      return this.mutate(identity, request, async (s) =>
        execute(s, identity, request),
      );
    if (JSON.stringify(before) !== JSON.stringify(await this.stamps(keys)))
      throw new Conflict(
        "Circle changed during this read. Refresh to continue.",
      );
    return execute(store, identity, request);
  }
}
