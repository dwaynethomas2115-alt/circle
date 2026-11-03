import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCalendarLocalUri,
  assertCalendarTextMetadata,
  calendarFileName,
  calendarImageSource,
  calendarTextSource,
  calendarUtf8Text,
  inspectCalendarOriginalImage,
} from "./calendarInputValidation";
import { CALENDAR_LIMITS } from "../features/calendarAssistant";

const encode = (text: string) => new TextEncoder().encode(text);
const jpeg = (width: number, height: number) =>
  new Uint8Array([
    255,
    216,
    255,
    192,
    0,
    17,
    8,
    height >>> 8,
    height & 255,
    width >>> 8,
    width & 255,
    3,
    1,
    17,
    0,
    2,
    17,
    1,
    3,
    17,
    1,
    255,
    217,
  ]);
function png(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
function webp(width: number, height: number, animated = false) {
  const bytes = new Uint8Array(30);
  bytes.set(encode("RIFF"));
  bytes.set(encode("WEBPVP8X"), 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 22, true);
  view.setUint32(16, 10, true);
  bytes[20] = animated ? 2 : 0;
  for (const [at, value] of [
    [24, width - 1],
    [27, height - 1],
  ])
    for (let n = 0; n < 3; n++) bytes[at + n] = (value >>> (8 * n)) & 255;
  return bytes;
}

test("TXT/CSV use bounded strict UTF-8, including a single UTF-8 BOM and international event names", () => {
  const csv = "title,date\nCafé 🦄,2027-01-02";
  assert.deepEqual(
    calendarTextSource(
      "schedule.csv",
      "text/csv;charset=utf-8",
      encode("\ufeff" + csv),
    ),
    {
      kind: "text",
      name: "schedule.csv",
      text: csv,
    },
  );
  assert.equal(
    calendarTextSource("notes.TXT", "text/plain", encode("Lunch at noon")).kind,
    "text",
  );
  assert.throws(
    () =>
      calendarTextSource(
        "too-big.txt",
        "",
        encode("x".repeat(CALENDAR_LIMITS.maxTextBytes + 1)),
      ),
    /12,000/,
  );
  assert.throws(
    () => calendarTextSource("binary.txt", "", new Uint8Array([0, 1, 2])),
    /readable/,
  );
  assert.throws(
    () => calendarTextSource("empty.txt", "", new Uint8Array()),
    /12,000/,
  );
});

test("unsupported file types are rejected from metadata before decoding or treating them as calendar text", () => {
  for (const [name, mime] of [
    ["calendar.pdf", "application/pdf"],
    ["calendar.ics", "text/calendar"],
    ["calendar.xlsx", "application/vnd.ms-excel"],
    ["calendar.docx", ""],
    ["calendar.html", "text/html"],
    ["calendar.csv", "application/pdf"],
  ])
    assert.throws(
      () => assertCalendarTextMetadata(name, mime),
      /not supported/,
    );
  assert.doesNotThrow(() =>
    assertCalendarTextMetadata("calendar.csv", "application/vnd.ms-excel"),
  );
});

test("malformed UTF-8 cannot be silently replaced or interpreted as valid imported text", () => {
  for (const input of [
    [0xc0, 0x80],
    [0xe0, 0x80, 0x80],
    [0xed, 0xa0, 0x80],
    [0xf4, 0x90, 0x80, 0x80],
    [0xf5, 0x80, 0x80, 0x80],
    [0xe2, 0x82],
    [0xc2, 0x41],
    [0xff, 0xfe, 0x41, 0],
    [0xef, 0xbf, 0xbd],
  ])
    assert.throws(() => calendarUtf8Text(new Uint8Array(input)), /UTF-8/);
});

test("calendar selection never fetches arbitrary web URLs and names are bounded without losing their extension", () => {
  for (const uri of [
    "https://example.test/calendar.jpg",
    "http://127.0.0.1/photo",
    "/photo",
    "awfile:private",
  ])
    assert.throws(() => assertCalendarLocalUri(uri), /local file/);
  for (const uri of [
    "blob:https://circle.test/local",
    "file:///photo",
    "data:image/jpeg;base64,AA==",
    "content://local/photo",
    "ph:photo",
  ])
    assert.doesNotThrow(() => assertCalendarLocalUri(uri));
  const safe = calendarFileName("folder/" + "a".repeat(300) + "\n.csv");
  assert.equal(safe.length, CALENDAR_LIMITS.maxSourceNameChars);
  assert.ok(safe.endsWith(".csv"));
  assert.doesNotMatch(safe, /[\n/]/);
});

test("photo metadata is verified against actual JPEG, PNG or WebP headers and pixel/byte bounds before decode", () => {
  assert.deepEqual(
    inspectCalendarOriginalImage(jpeg(1200, 800), "calendar.jpg", "image/jpeg"),
    { mime: "image/jpeg", width: 1200, height: 800 },
  );
  assert.deepEqual(
    inspectCalendarOriginalImage(png(800, 1200), "calendar.png", "image/png"),
    { mime: "image/png", width: 800, height: 1200 },
  );
  assert.deepEqual(
    inspectCalendarOriginalImage(
      webp(1000, 600),
      "calendar.webp",
      "image/webp",
    ),
    { mime: "image/webp", width: 1000, height: 600 },
  );
  assert.throws(
    () => inspectCalendarOriginalImage(webp(1000, 600, true), "calendar.webp"),
    /Choose a JPEG/,
  );
  const animatedPng = new Uint8Array(53);
  animatedPng.set(png(1000, 600));
  const animatedView = new DataView(animatedPng.buffer);
  animatedView.setUint32(8, 13);
  animatedView.setUint32(33, 8);
  animatedPng.set(encode("acTL"), 37);
  assert.throws(
    () => inspectCalendarOriginalImage(animatedPng, "calendar.png"),
    /Choose a JPEG/,
  );
  assert.throws(
    () => inspectCalendarOriginalImage(png(10000, 10000), "huge.png"),
    /20 megapixels/,
  );
  assert.throws(
    () =>
      inspectCalendarOriginalImage(
        new Uint8Array(CALENDAR_LIMITS.maxOriginalImageBytes + 1),
        "huge.jpg",
      ),
    /10 MiB/,
  );
  assert.throws(
    () =>
      inspectCalendarOriginalImage(
        encode("<svg></svg>"),
        "fake.jpg",
        "image/jpeg",
      ),
    /Choose a JPEG/,
  );
  assert.throws(
    () =>
      inspectCalendarOriginalImage(jpeg(100, 100), "photo.heic", "image/jpeg"),
    /HEIC/,
  );
  assert.throws(
    () =>
      inspectCalendarOriginalImage(jpeg(100, 100), "photo.jpg", "image/heic"),
    /HEIC/,
  );
});

test("prepared photos are bounded JPEG data only, never arbitrary source URLs or oversized output", () => {
  const value = calendarImageSource(
    "calendar.png",
    Buffer.from(jpeg(1200, 800)).toString("base64"),
  );
  assert.equal(value.kind, "image");
  assert.throws(
    () =>
      calendarImageSource(
        "calendar.jpg",
        Buffer.from(jpeg(1601, 900)).toString("base64"),
      ),
    /1,600/,
  );
  assert.throws(
    () => calendarImageSource("calendar.jpg", "https://example.test/picture"),
    /JPEG/,
  );
  assert.throws(
    () =>
      calendarImageSource(
        "calendar.jpg",
        Buffer.from(new Uint8Array(CALENDAR_LIMITS.maxImageBytes + 1)).toString(
          "base64",
        ),
      ),
    /JPEG/,
  );
});
