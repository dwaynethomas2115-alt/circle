import test from "node:test";
import assert from "node:assert/strict";
import {
  photoResize,
  mediaFrameRatio,
  validateMedia,
  formatDuration,
  PHOTO_MAX_BYTES,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_DURATION_MS,
} from "./media";

test("photo processing preserves portrait and landscape proportions without upscaling", () => {
  assert.equal(photoResize(1200, 800), undefined);
  assert.deepEqual(photoResize(6000, 4000), { width: 4096, height: 2731 });
  assert.deepEqual(photoResize(3000, 6000), { width: 2048, height: 4096 });
  assert.equal(photoResize(0, 1000), undefined);
});
test("media validation rejects oversized, long, unsupported and unreadable videos", () => {
  assert.equal(
    validateMedia({
      type: "video",
      durationMs: VIDEO_MAX_DURATION_MS,
      bytes: VIDEO_MAX_BYTES,
      mimeType: "video/quicktime",
    }),
    null,
  );
  assert.match(
    validateMedia({ type: "image", bytes: PHOTO_MAX_BYTES + 1 }) || "",
    /50 MB/,
  );
  assert.match(
    validateMedia({ type: "video", durationMs: VIDEO_MAX_DURATION_MS + 1 }) ||
      "",
    /10 minutes/,
  );
  assert.equal(validateMedia({ type: "image", bytes: PHOTO_MAX_BYTES }), null);
  assert.equal(validateMedia({ type: "video", durationMs: 61_000 }), null);
  assert.match(
    validateMedia({
      type: "video",
      durationMs: 90_000,
      bytes: VIDEO_MAX_BYTES + 1,
    }) || "",
    /250 MB/,
  );
  for (const bytes of [0, -1, NaN, Infinity])
    assert.match(validateMedia({ type: "image", bytes }) || "", /empty|read/);
  assert.match(
    validateMedia({
      type: "video",
      durationMs: 1000,
      mimeType: "video/webm",
    }) || "",
    /MP4 or MOV/,
  );
  assert.match(validateMedia({ type: "video" }) || "", /couldn’t read/);
});
test("media frame and duration handle portrait, panorama and short videos", () => {
  assert.equal(mediaFrameRatio(600, 1200), 0.78);
  assert.equal(mediaFrameRatio(4000, 1000), 2.1);
  assert.equal(mediaFrameRatio(1200, 800), 1.5);
  assert.equal(formatDuration(59001), "1:00");
  assert.equal(formatDuration(11500), "0:12");
});
