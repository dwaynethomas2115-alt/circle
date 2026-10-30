import test from "node:test";
import assert from "node:assert/strict";
import {
  photoResize,
  mediaFrameRatio,
  validateMedia,
  formatDuration,
  MEDIA_MAX_BYTES,
} from "./media";

test("photo processing preserves portrait and landscape proportions without upscaling", () => {
  assert.equal(photoResize(1200, 800), undefined);
  assert.deepEqual(photoResize(6000, 4000), { width: 2560, height: 1707 });
  assert.deepEqual(photoResize(3000, 6000), { width: 1280, height: 2560 });
  assert.equal(photoResize(0, 1000), undefined);
});
test("media validation rejects oversized, long, unsupported and unreadable videos", () => {
  assert.equal(
    validateMedia({
      type: "video",
      bytes: 1024,
      durationMs: 60000,
      mimeType: "video/quicktime",
    }),
    null,
  );
  assert.match(
    validateMedia({ type: "image", bytes: MEDIA_MAX_BYTES + 1 }) || "",
    /50 MB/,
  );
  assert.match(
    validateMedia({ type: "video", durationMs: 60001 }) || "",
    /one minute/,
  );
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

test("client accepts the decimal 50MB boundary and rejects one byte above", () => {
  assert.equal(MEDIA_MAX_BYTES, 50_000_000);
  assert.equal(validateMedia({ type: "image", bytes: 50_000_000 }), null);
  assert.match(
    validateMedia({ type: "image", bytes: 50_000_001 }) || "",
    /50 MB/,
  );
});
