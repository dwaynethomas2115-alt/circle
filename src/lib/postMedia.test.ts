import test from "node:test";
import assert from "node:assert/strict";
import {
  getPostMedia,
  getPostMediaInput,
  preparePostAttachments,
  requireAlbumSupport,
  validatePostMedia,
} from "./postMedia";
import { transition } from "../state/model";
import { createSeed } from "../data/seed";
import { restoreDemoState, serializeDemoState } from "../state/persistence";
import type { PostAttachmentInput } from "../types";

test("legacy photos and videos remain readable, and albums preserve their order and dimensions", () => {
  assert.deepEqual(getPostMedia({ media: "legacy.jpg" }), [
    { uri: "legacy.jpg", type: "image" },
  ]);
  assert.deepEqual(getPostMedia({ media: "legacy.mp4", mediaType: "video" }), [
    { uri: "legacy.mp4", type: "video" },
  ]);
  const attachments: PostAttachmentInput[] = [
    { uri: "portrait.jpg", type: "image", width: 800, height: 1200 },
    { uri: "landscape.jpg", type: "image", width: 1200, height: 800 },
  ];
  assert.deepEqual(
    getPostMedia({ attachments, media: "portrait.jpg" }),
    attachments,
  );
  const outcome = transition(createSeed(), {
    type: "createPost",
    input: { circleId: "family", content: "", attachments },
  });
  assert.equal(outcome.result.ok, true);
  const post = outcome.state.posts.find((p) => p.id === outcome.result.id)!;
  assert.deepEqual(post.attachments, attachments);
  assert.equal(post.media, attachments[0].uri);
  assert.equal(post.mediaType, "image");
});

test("an older server blocks an album before any upload, while single photos keep their legacy path", async () => {
  const items: PostAttachmentInput[] = [
    { uri: "first", type: "image" },
    { uri: "second", type: "image" },
  ];
  let uploads = 0,
    checks = 0;
  const prepare = async (uri: string) => {
    uploads++;
    return uri;
  };
  const checkAlbumSupport = () =>
    requireAlbumSupport(2, async () => {
      checks++;
      throw new Error("Invalid Circle request. Check the fields.");
    });
  await assert.rejects(
    preparePostAttachments(items, prepare, { checkAlbumSupport }),
    /Photo albums need the latest Circle server update. Your draft is still here/,
  );
  assert.equal(uploads, 0);
  assert.equal(checks, 1);
  await preparePostAttachments(items.slice(0, 1), prepare, {
    checkAlbumSupport,
  });
  assert.equal(uploads, 1);
  assert.equal(checks, 1);
  await preparePostAttachments(items, prepare, {
    checkAlbumSupport: () =>
      requireAlbumSupport(2, async () => ({ maxPostPhotos: 10 })),
  });
  assert.equal(uploads, 3);
});

test("an album accepts ten distinct photos, but rejects mixed video, duplicates, and an eleventh photo", () => {
  const photos: PostAttachmentInput[] = Array.from({ length: 10 }, (_, i) => ({
    uri: `photo-${i}`,
    type: "image",
  }));
  assert.equal(validatePostMedia(photos), null);
  assert.match(
    validatePostMedia([...photos, { uri: "eleventh", type: "image" }]) || "",
    /10/,
  );
  assert.match(
    validatePostMedia([
      ...photos.slice(0, 1),
      { uri: "video", type: "video" },
    ]) || "",
    /one video/,
  );
  assert.match(validatePostMedia([photos[0], photos[0]]) || "", /once/);
  assert.equal(validatePostMedia([{ uri: "video", type: "video" }]), null);
  const before = createSeed();
  const outcome = transition(before, {
    type: "createPost",
    input: {
      circleId: "family",
      content: "",
      attachments: [...photos, { uri: "too-many", type: "image" }],
    },
  });
  assert.equal(outcome.result.ok, false);
  assert.deepEqual(outcome.state.posts, before.posts);
});

test("sequential preparation reports real per-file bytes and stops the album on failure or cancellation", async () => {
  const items: PostAttachmentInput[] = ["first", "second", "third"].map(
    (uri) => ({ uri, type: "image" }),
  );
  const calls: string[] = [];
  const progress: unknown[] = [];
  await assert.rejects(
    preparePostAttachments(
      items,
      async (uri, _type, _duration, options) => {
        calls.push(uri);
        options.onProgress?.({ uploaded: 25, total: 100 });
        if (uri === "second") throw new Error("Storage is full");
        return `stored:${uri}`;
      },
      { onProgress: (value) => progress.push(value) },
    ),
    /Storage is full/,
  );
  assert.deepEqual(calls, ["first", "second"]);
  assert.deepEqual(progress, [
    { uploaded: 25, total: 100, itemIndex: 1, itemCount: 3 },
    { uploaded: 25, total: 100, itemIndex: 2, itemCount: 3 },
  ]);
  const controller = new AbortController();
  let count = 0;
  await assert.rejects(
    preparePostAttachments(
      items,
      async (uri) => {
        count++;
        controller.abort();
        return uri;
      },
      { signal: controller.signal },
    ),
    /canceled/,
  );
  assert.equal(count, 1);
});

test("album media survives a demo reload and preserves stable bundled asset identities", () => {
  const before = createSeed({ forest: "old-forest.jpg" });
  before.posts[0].attachments = [
    { uri: "old-forest.jpg", type: "image", width: 900, height: 600 },
    { uri: "blob:second", type: "image" },
  ];
  const raw = serializeDemoState(before, { forest: "old-forest.jpg" }, (uri) =>
    uri === "blob:second" ? "circle-local-media:second" : uri,
  );
  const after = restoreDemoState(raw, { forest: "new-forest.jpg" }, (uri) =>
    uri === "circle-local-media:second" ? "blob:restored" : uri,
  );
  assert.deepEqual(after.posts[0].attachments, [
    { uri: "new-forest.jpg", type: "image", width: 900, height: 600 },
    { uri: "blob:restored", type: "image" },
  ]);
  assert.equal(
    getPostMediaInput({
      media: "video.mp4",
      mediaType: "video",
      mediaDurationMs: 1200,
    })[0].durationMs,
    1200,
  );
});
