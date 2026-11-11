import test from "node:test";
import assert from "node:assert/strict";
import { highlightFrames } from "./highlightsPresentation";
import type { Post } from "../types";

const photo: Post = {
  id: "one",
  circleId: "family",
  authorId: "alex",
  content: "A memory",
  media: "https://example.test/old.jpg",
  mediaType: "image",
  createdAt: "2026-11-11T12:00:00.000Z",
  reactions: [],
};

test("Highlights removes deleted/revoked posts and cannot mix Circle snapshots", () => {
  assert.deepEqual(highlightFrames([photo], []), []);
  assert.deepEqual(
    highlightFrames([photo], [{ ...photo, circleId: "other" }]),
    [],
  );
});

test("Highlights uses the current replacement file while retaining the album slot", () => {
  const first = highlightFrames([photo], [photo])[0];
  const fresh = highlightFrames(
    [photo],
    [{ ...photo, media: "https://example.test/new.jpg" }],
  )[0];
  assert.equal(fresh.attachment?.uri, "https://example.test/new.jpg");
  assert.equal(fresh.id, first.id);
  assert.notEqual(fresh.attachment?.uri, first.attachment?.uri);
});

test("Highlights keeps ordered album and text frames while reconciling current captions", () => {
  const album: Post = {
    ...photo,
    attachments: [
      { type: "image", uri: "https://example.test/a.jpg" },
      { type: "image", uri: "https://example.test/b.jpg" },
    ],
  };
  const frames = highlightFrames(
    [album],
    [{ ...album, content: "Updated caption" }],
  );
  assert.deepEqual(
    frames.map((frame) => frame.attachment?.uri),
    ["https://example.test/a.jpg", "https://example.test/b.jpg"],
  );
  assert.ok(frames.every((frame) => frame.post.content === "Updated caption"));
  const text: Post = { ...photo, media: undefined, mediaType: undefined };
  assert.equal(highlightFrames([text], [text])[0].id, "one:text");
});

test("signed URL refresh keeps frame identity and supplies only current access", () => {
  const first = {
    ...photo,
    media:
      "https://fra.cloud.appwrite.io/v1/storage/buckets/circle-media/files/a/view?project=circle&token=old",
  };
  const fresh = {
    ...first,
    media: first.media.replace("token=old", "token=fresh"),
  };
  const before = highlightFrames([first], [first])[0];
  const after = highlightFrames([first], [fresh])[0];
  assert.equal(before.id, after.id);
  assert.equal(after.attachment?.uri, fresh.media);
  assert.notEqual(after.attachment?.uri, first.media);
});
