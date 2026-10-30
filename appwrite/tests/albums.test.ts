import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execute, type Identity } from "../function/domain";
import { Repository, type Request } from "../function/repository";
import { record, rowId } from "../function/records";
import { hydrateMedia, type MediaServices } from "../function/media";
import { unreferencedUploads } from "../cleanup";
import { FakeDatabase } from "./fake-database";
import type { AppState, PostAttachment, Result } from "../../src/types";
const alice: Identity = {
  $id: "alice",
  name: "Alice",
  email: "alice@example.test",
};
const bob: Identity = { $id: "bob", name: "Bob", email: "bob@example.test" };

async function setup() {
  const db = new FakeDatabase(),
    repo = new Repository(db.api, "circle");
  const call = (who: Identity, request: Request) =>
    repo.mutate(who, request, async (store) => execute(store, who, request));
  const created = await call(alice, {
    kind: "action",
    action: {
      type: "createCircle",
      input: {
        name: "Album",
        description: "",
        category: "Family",
        discoverable: false,
      },
    },
  });
  const circleId = (created.data as Result).id!;
  const upload = (
    owner = alice.$id,
    ready = true,
    type: "image" | "video" = "image",
  ) => {
    const id = randomUUID();
    const value = record(
      "uploads",
      id,
      { owner, ready, mediaType: type, createdAt: Date.now() - 2 * 86400000 },
      "",
      owner,
      ready ? "ready" : "pending",
    );
    db.seed(value.table, value.id, value.data);
    return `awfile:${id}`;
  };
  return { db, repo, call, circleId, upload };
}

test("album capability preflight is authenticated to Circle membership and advertises ten photos without modifying storage", async () => {
  const h = await setup();
  const before = [...h.db.rows];
  const capabilities = await h.repo.read(alice, {
    kind: "mediaCapabilities",
    circleId: h.circleId,
  });
  assert.deepEqual(capabilities.data, { maxPostPhotos: 10 });
  assert.deepEqual([...h.db.rows], before);
  await assert.rejects(
    h.repo.read(bob, { kind: "mediaCapabilities", circleId: h.circleId }),
    /Join this Circle/,
  );
  assert.equal(
    [...h.db.rows.keys()].filter((key) => key.startsWith("uploads/")).length,
    0,
  );
});

test("album creation atomically records every private attachment and deletion removes all references", async () => {
  const h = await setup();
  const attachments: PostAttachment[] = Array.from({ length: 10 }, () => ({
    uri: h.upload(),
    type: "image",
    width: 1200,
    height: 800,
  }));
  const created = await h.call(alice, {
    kind: "action",
    action: {
      type: "createPost",
      input: { circleId: h.circleId, content: "A whole day", attachments },
    },
  });
  assert.equal((created.data as Result).ok, true);
  const postId = (created.data as Result).id!;
  const references = [...h.db.rows.values()].filter(
    (row) => row.data && row.entity_id?.startsWith(`posts:${postId}:`),
  );
  assert.equal(references.length, 10);
  assert.ok(references.every((row) => row.$permissions.length === 0));
  const snapshot = await h.repo.read(alice, { kind: "snapshot" });
  const post = (snapshot.data as AppState).posts.find(
    (value) => value.id === postId,
  )!;
  assert.deepEqual(post.attachments, attachments);
  assert.equal(post.media, attachments[0].uri);
  assert.deepEqual(unreferencedUploads(snapshot.store, Date.now()), []);
  const outsider = await h.repo.read(bob, { kind: "snapshot" });
  assert.equal((outsider.data as AppState).posts.length, 0);
  assert.equal(Object.keys(outsider.store.uploads || {}).length, 0);
  await h.call(alice, {
    kind: "action",
    action: { type: "deletePost", postId },
  });
  assert.equal(
    [...h.db.rows.values()].filter((row) =>
      row.entity_id?.startsWith(`posts:${postId}:`),
    ).length,
    0,
  );
  assert.ok(
    attachments.every((item) =>
      h.db.rows.has(`uploads/${rowId(item.uri.slice(7))}`),
    ),
    "Deleting a post doesn't delete files still potentially used elsewhere",
  );
});

test("each album item must be the actor's sealed file, including non-cover items", async () => {
  for (const invalid of ["foreign", "unsealed", "wrong-type"] as const) {
    const h = await setup();
    const valid = h.upload();
    const bad =
      invalid === "foreign"
        ? h.upload(bob.$id)
        : invalid === "unsealed"
          ? h.upload(alice.$id, false)
          : h.upload(alice.$id, true, "video");
    await assert.rejects(
      h.call(alice, {
        kind: "action",
        action: {
          type: "createPost",
          input: {
            circleId: h.circleId,
            content: "",
            attachments: [
              { uri: valid, type: "image" },
              { uri: bad, type: "image" },
            ],
          },
        },
      }),
      /unavailable|another account/,
    );
    assert.equal(
      [...h.db.rows.keys()].filter((key) => key.startsWith("posts/")).length,
      0,
    );
    assert.equal(
      [...h.db.rows.keys()].filter((key) => key.startsWith("media_refs/"))
        .length,
      0,
    );
  }
});

test("server rejects overfull, duplicate, mixed, arbitrary-URL and conflicting-preview albums", async () => {
  const h = await setup(),
    image = h.upload(),
    other = h.upload(),
    video = h.upload(alice.$id, true, "video");
  const invalid: unknown[] = [
    Array.from({ length: 11 }, () => ({ uri: h.upload(), type: "image" })),
    [
      { uri: image, type: "image" },
      { uri: image, type: "image" },
    ],
    [
      { uri: image, type: "image" },
      { uri: video, type: "video" },
    ],
    [
      { uri: image, type: "image" },
      { uri: "https://outside.example/private.jpg", type: "image" },
    ],
  ];
  for (const attachments of invalid)
    await assert.rejects(
      h.call(alice, {
        kind: "action",
        action: {
          type: "createPost",
          input: { circleId: h.circleId, content: "", attachments },
        },
      } as Request),
      /Invalid request/,
    );
  await assert.rejects(
    h.call(alice, {
      kind: "action",
      action: {
        type: "createPost",
        input: {
          circleId: h.circleId,
          content: "",
          media: other,
          attachments: [{ uri: image, type: "image" }],
        },
      },
    }),
    /Invalid request/,
  );
});

test("authorized album hydration signs every photo once and leaves no internal references in the snapshot", async () => {
  const h = await setup(),
    first = h.upload(),
    second = h.upload();
  await h.call(alice, {
    kind: "action",
    action: {
      type: "createPost",
      input: {
        circleId: h.circleId,
        content: "",
        attachments: [
          { uri: first, type: "image" },
          { uri: second, type: "image" },
        ],
      },
    },
  });
  const snapshot = await h.repo.read(alice, { kind: "snapshot" });
  const signed: string[] = [];
  const services = {
    tokens: {
      createFileToken: async ({ fileId }: { fileId: string }) => {
        signed.push(fileId);
        return { secret: `token-${signed.length}` };
      },
    },
  } as unknown as MediaServices;
  const hydrated = await hydrateMedia(
    snapshot.data as AppState,
    services,
    snapshot.store,
    "https://appwrite.example/v1",
    "test-project",
  );
  assert.deepEqual(signed, [first.slice(7), second.slice(7)]);
  assert.equal(hydrated.posts[0].media, hydrated.posts[0].attachments![0].uri);
  assert.ok(
    hydrated.posts[0].attachments!.every(
      (item) =>
        item.uri.includes("/storage/buckets/circle-media/files/") &&
        item.uri.includes("token="),
    ),
  );
  assert.ok(!JSON.stringify(hydrated.posts[0]).includes("awfile:"));
  assert.equal(
    (snapshot.data as AppState).posts[0].attachments![0].uri,
    first,
    "Hydration doesn't rewrite stored references",
  );
});
