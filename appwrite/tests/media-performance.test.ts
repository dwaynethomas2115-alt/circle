import assert from "node:assert/strict";
import test from "node:test";
import {
  execute,
  emptyStore,
  type Identity,
  type Store,
} from "../function/domain";
import { hydrateMedia, type MediaServices } from "../function/media";
import { Repository } from "../function/repository";
import { records, record } from "../function/records";
import { FakeDatabase } from "./fake-database";
import type { AppState } from "../../src/types";
import { presetThemes } from "../../src/features/themes";

const alice: Identity = {
  $id: "alice",
  name: "Alice",
  email: "alice@example.test",
};
const bob: Identity = { $id: "bob", name: "Bob", email: "bob@example.test" };
const endpoint = "https://appwrite.example.test/v1";
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

function fixture(count = 13) {
  const store = emptyStore();
  store.uploads = {};
  store.app.currentUserId = alice.$id;
  store.app.users.push(
    {
      id: alice.$id,
      name: alice.name,
      email: alice.email,
      username: "alice",
      avatar: "",
      bio: "",
    },
    {
      id: bob.$id,
      name: bob.name,
      email: bob.email,
      username: "bob",
      avatar: "",
      bio: "",
    },
  );
  store.app.circles.push({
    id: "family",
    name: "Family",
    description: "",
    category: "Family",
    avatar: "🌿",
    cover: "",
    color: "#447766",
    discoverable: false,
    approvalRequired: true,
    ownerId: alice.$id,
    createdAt: "2026-01-01",
  });
  store.app.members.push(
    {
      circleId: "family",
      userId: alice.$id,
      role: "owner",
      joinedAt: "2026-01-01",
    },
    {
      circleId: "family",
      userId: bob.$id,
      role: "member",
      joinedAt: "2026-01-01",
    },
  );
  const ids = Array.from(
    { length: count },
    (_, index) =>
      `${index.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`,
  );
  for (const [index, id] of ids.entries()) {
    store.uploads[id] = {
      owner: alice.$id,
      ready: true,
      mediaType: "image",
      createdAt: 0,
    };
    store.app.posts.push({
      id: `post-${index}`,
      circleId: "family",
      authorId: alice.$id,
      content: "Sample memory",
      media: `awfile:${id}`,
      mediaType: "image",
      createdAt: "2026-01-01",
      reactions: [],
    });
  }
  if (ids[0]) {
    store.app.users[0].avatar = `awfile:${ids[0]}`;
    store.app.circles[0].cover = `awfile:${ids[0]}`;
  }
  return { store, ids };
}

function projected(store: Store, identity = alice) {
  return execute(store, identity, { kind: "snapshot" }).data as AppState;
}

function seed(store: Store) {
  const db = new FakeDatabase();
  for (const entity of records(store).values())
    db.seed(entity.table, entity.id, entity.data);
  return db;
}

async function drain(pending: (() => void)[]) {
  while (pending.length) {
    // Complete in reverse order: output album ordering must not follow network timing.
    for (const release of pending.splice(0).reverse()) release();
    await turn();
  }
}

test("private media signing deduplicates shared references, bounds concurrency, and preserves album order and 60-second expiry", async () => {
  const { store, ids } = fixture();
  store.app.posts[0].attachments = [ids[2], ids[0], ids[1]].map((id) => ({
    uri: `awfile:${id}`,
    type: "image",
  }));
  const app = projected(store);
  const before = JSON.stringify(app);
  const pending: (() => void)[] = [];
  const calls: string[] = [];
  let active = 0,
    peak = 0;
  const services = {
    tokens: {
      createFileToken: async (input: {
        bucketId: string;
        fileId: string;
        expire: string;
      }) => {
        assert.equal(input.bucketId, "circle-media");
        const ttl = Date.parse(input.expire) - Date.now();
        assert.ok(ttl > 59_000 && ttl <= 60_000);
        calls.push(input.fileId);
        peak = Math.max(peak, ++active);
        await new Promise<void>((resolve) =>
          pending.push(() => {
            active--;
            resolve();
          }),
        );
        return { secret: `dummy-token-${input.fileId}` };
      },
    },
  } as unknown as MediaServices;
  const result = hydrateMedia(app, services, store, endpoint, "project");
  await turn();
  assert.equal(
    calls.length,
    6,
    "six independent files start without waiting for each other",
  );
  assert.equal(active, 6);
  await drain(pending);
  const hydrated = await result;
  assert.equal(peak, 6, "a large snapshot cannot launch an unbounded batch");
  assert.equal(calls.length, ids.length);
  assert.equal(
    new Set(calls).size,
    ids.length,
    "avatar, cover, legacy image and album share one token per file",
  );
  assert.equal(
    JSON.stringify(app),
    before,
    "hydration must not rewrite the authorized input",
  );
  assert.equal(hydrated.users[0].avatar, hydrated.circles[0].cover);
  assert.deepEqual(
    hydrated.posts[0].attachments!.map((item) =>
      new URL(item.uri).pathname.split("/").at(-2),
    ),
    [ids[2], ids[0], ids[1]],
  );
  assert.equal(hydrated.posts[0].media, hydrated.posts[0].attachments![0].uri);
  assert.ok(!JSON.stringify(hydrated).includes("awfile:"));
});

test("all projected media references must be valid and ready before any token is minted", async () => {
  for (const bad of ["unready", "missing", "malformed", "wallpaper"] as const) {
    const { store, ids } = fixture(2);
    if (bad === "unready") store.uploads![ids[1]].ready = false;
    if (bad === "missing") delete store.uploads![ids[1]];
    if (bad === "malformed") store.app.posts[1].media = "awfile:invalid";
    if (bad === "wallpaper") {
      store.app.posts[1].media = "awfile:wp_11111111111141118111111111111111";
      store.uploads!["wp_11111111111141118111111111111111"] = {
        owner: alice.$id,
        ready: true,
        mediaType: "image",
        createdAt: 0,
      };
    }
    let minted = 0;
    const services = {
      tokens: {
        createFileToken: async () => {
          minted++;
          return { secret: "dummy-token" };
        },
      },
    } as unknown as MediaServices;
    await assert.rejects(
      hydrateMedia(projected(store), services, store, endpoint, "project"),
      /unavailable/,
    );
    assert.equal(minted, 0, `${bad} references fail before token work`);
  }
});

test("a signing failure stops the queue and drains in-flight work before rejecting", async () => {
  const { store } = fixture();
  const pending: (() => void)[] = [];
  const failure = new Error("Mock token service unavailable");
  let calls = 0;
  const services = {
    tokens: {
      createFileToken: async () => {
        if (++calls === 1) throw failure;
        await new Promise<void>((resolve) => pending.push(resolve));
        return { secret: "dummy-token" };
      },
    },
  } as unknown as MediaServices;
  let settled = false;
  const result = hydrateMedia(
    projected(store),
    services,
    store,
    endpoint,
    "project",
  ).then(
    () => {
      settled = true;
      return null;
    },
    (cause) => {
      settled = true;
      return cause;
    },
  );
  await turn();
  assert.equal(calls, 6);
  assert.equal(
    settled,
    false,
    "already-started I/O is drained before returning",
  );
  await drain(pending);
  assert.equal(await result, failure);
  assert.equal(calls, 6, "the seventh file was never scheduled after failure");
});

test("fresh authorization excludes revoked memberships and blocked or deleted posts from token signing", async () => {
  const { store, ids } = fixture(3);
  const signed: string[] = [];
  const services = {
    tokens: {
      createFileToken: async ({ fileId }: { fileId: string }) => {
        signed.push(fileId);
        return { secret: "dummy-token" };
      },
    },
  } as unknown as MediaServices;
  await hydrateMedia(
    projected(store, bob),
    services,
    store,
    endpoint,
    "project",
  );
  assert.equal(signed.length, 3);
  signed.length = 0;
  store.app.members = store.app.members.filter(
    (member) => member.userId !== bob.$id,
  );
  await hydrateMedia(
    projected(store, bob),
    services,
    store,
    endpoint,
    "project",
  );
  assert.equal(
    signed.length,
    0,
    "no cross-request cache bypasses membership removal",
  );
  store.app.posts[2].authorId = bob.$id;
  store.app.blocks.push({ userId: alice.$id, blockedId: bob.$id });
  await hydrateMedia(projected(store), services, store, endpoint, "project");
  assert.ok(!signed.includes(ids[2]), "blocked author media isn't signed");
  signed.length = 0;
  store.app.posts = store.app.posts.filter((post) => post.id !== "post-1");
  await hydrateMedia(projected(store), services, store, endpoint, "project");
  assert.ok(!signed.includes(ids[1]), "deleted post media isn't signed");
});

test("independent media requests mint fresh tokens in the correct endpoint and project namespace", async () => {
  const { store } = fixture(1);
  let count = 0;
  const services = {
    tokens: {
      createFileToken: async () => ({ secret: `dummy-token-${++count}` }),
    },
  } as unknown as MediaServices;
  const first = await hydrateMedia(
    projected(store),
    services,
    store,
    endpoint,
    "first-project",
  );
  const second = await hydrateMedia(
    projected(store),
    services,
    store,
    "https://other.example.test/v1",
    "second-project",
  );
  assert.equal(count, 2, "tokens aren't cached across requests or tenants");
  assert.equal(
    new URL(first.users[0].avatar).searchParams.get("project"),
    "first-project",
  );
  assert.equal(
    new URL(second.users[0].avatar).searchParams.get("project"),
    "second-project",
  );
  assert.equal(new URL(second.users[0].avatar).hostname, "other.example.test");
  assert.notEqual(first.users[0].avatar, second.users[0].avatar);
});

function heldUploads(db: FakeDatabase) {
  const pending: (() => void)[] = [];
  const calls: string[] = [];
  let active = 0,
    peak = 0;
  const api = new Proxy(db.api, {
    get(target, key) {
      if (key === "getRow")
        return async (input: {
          databaseId: string;
          tableId: string;
          rowId: string;
          queries?: string[];
          transactionId?: string;
        }) => {
          if (input.tableId === "uploads") {
            calls.push(input.rowId);
            peak = Math.max(peak, ++active);
            await new Promise<void>((resolve) =>
              pending.push(() => {
                active--;
                resolve();
              }),
            );
          }
          return db.api.getRow(input);
        };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(db) : value;
    },
  });
  return { api, pending, calls, peak: () => peak };
}

test("snapshot reservation reads are deduplicated and bounded without writing any rows", async () => {
  const { store, ids } = fixture();
  const db = seed(store);
  const held = heldUploads(db);
  const result = new Repository(held.api, "circle").read(alice, {
    kind: "snapshot",
  });
  for (let turnIndex = 0; held.calls.length < 6 && turnIndex < 20; turnIndex++)
    await turn();
  assert.equal(held.calls.length, 6);
  await drain(held.pending);
  const snapshot = await result;
  assert.equal(held.peak(), 6);
  assert.equal(held.calls.length, ids.length);
  assert.equal(new Set(held.calls).size, ids.length);
  assert.equal(Object.keys(snapshot.store.uploads!).length, ids.length);
  assert.equal((snapshot.data as AppState).posts.length, ids.length);
  assert.ok(
    db.calls.every((call) => ["getRow", "listRows"].includes(call.method)),
  );
});

test("parallel reservation reads still reject a snapshot when revocation changes its authorization guard", async () => {
  const { store } = fixture();
  const db = seed(store);
  const held = heldUploads(db);
  const result = new Repository(held.api, "circle").read(bob, {
    kind: "snapshot",
  });
  for (let turnIndex = 0; held.calls.length < 6 && turnIndex < 20; turnIndex++)
    await turn();
  assert.equal(held.calls.length, 6);
  const guard = record("guards", "circle:family", {
    nonce: "revoked-during-read",
  });
  db.seed(guard.table, guard.id, guard.data);
  const rejected = assert.rejects(result, { code: 409 });
  await drain(held.pending);
  await rejected;
});

test("feature reads skip ordinary media reservations while preserving membership and guard checks", async () => {
  const { store } = fixture(3);
  store.features.themes.family = { ...presetThemes[0] };
  const db = seed(store);
  const repo = new Repository(db.api, "circle");
  const features = await repo.read(bob, { kind: "features" });
  assert.deepEqual(features.data, store.features);
  assert.ok(db.calls.some((call) => call.args.tableId === "members"));
  assert.ok(db.calls.some((call) => call.args.tableId === "guards"));
  assert.ok(!db.calls.some((call) => call.args.tableId === "uploads"));
  const outsider: Identity = {
    $id: "outsider",
    name: "Outsider",
    email: "outsider@example.test",
  };
  // Existing unknown-account initialization is unrelated to media reservation reads.
  const outsiderProfile = record(
    "profiles",
    outsider.$id,
    {
      id: outsider.$id,
      name: outsider.name,
      email: outsider.email,
      username: "outsider",
      avatar: "",
      bio: "",
    },
    "",
    outsider.$id,
    "outsider",
  );
  db.seed(outsiderProfile.table, outsiderProfile.id, outsiderProfile.data);
  db.calls = [];
  const empty = await repo.read(outsider, { kind: "features" });
  assert.deepEqual(empty.data, emptyStore().features);
  assert.ok(!db.calls.some((call) => call.args.tableId === "uploads"));
  const changing = new Proxy(db.api, {
    get(target, key) {
      if (key === "listRows")
        return async (input: {
          databaseId: string;
          tableId: string;
          queries?: string[];
          transactionId?: string;
        }) => {
          const page = await db.api.listRows(input);
          if (input.tableId === "themes") {
            const guard = record("guards", "circle:family", {
              nonce: "changed-during-features",
            });
            db.seed(guard.table, guard.id, guard.data);
          }
          return page;
        };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(db) : value;
    },
  });
  await assert.rejects(
    new Repository(changing, "circle").read(bob, { kind: "features" }),
    { code: 409 },
  );
});
