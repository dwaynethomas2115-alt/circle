import {
  CALENDAR_LIMITS,
  inspectCalendarJpeg,
  validateCalendarSource,
  type CalendarSource,
} from "../features/calendarAssistant";

const textError =
  "Choose a readable UTF-8 TXT or CSV file up to 12,000 bytes. PDF, ICS, Office and HTML files are not supported yet.";
const imageError =
  "Choose a JPEG, PNG or WebP photo up to 10 MiB and 20 megapixels. HEIC, GIF, SVG and other image formats are not supported yet.";

export function calendarFileName(name: string): string {
  const leaf =
    name
      .split(/[\\/]/)
      .at(-1)
      ?.replace(/[\u0000-\u001f\u007f]/g, "")
      .trim() || "";
  const match = /^(.*)(\.[^.]+)$/.exec(leaf);
  if (!match) return leaf.slice(0, CALENDAR_LIMITS.maxSourceNameChars);
  const extension = match[2];
  return (
    match[1].slice(0, CALENDAR_LIMITS.maxSourceNameChars - extension.length) +
    extension
  );
}

export function assertCalendarLocalUri(uri: string) {
  if (!/^(?:file:|blob:|data:|content:|ph:|assets-library:)/i.test(uri))
    throw new Error(
      "Choose a local file or photo from your device. Web links cannot be imported.",
    );
}

/** Strict UTF-8 decoder also works on native runtimes without TextDecoder. */
export function calendarUtf8Text(bytes: Uint8Array): string {
  if (!bytes.length || bytes.length > CALENDAR_LIMITS.maxTextBytes)
    throw new Error(textError);
  let out = "";
  for (let at = 0; at < bytes.length;) {
    const first = bytes[at++];
    let point: number;
    let count = 0;
    if (first <= 0x7f) point = first;
    else if (first >= 0xc2 && first <= 0xdf) {
      point = first & 31;
      count = 1;
    } else if (first >= 0xe0 && first <= 0xef) {
      point = first & 15;
      count = 2;
    } else if (first >= 0xf0 && first <= 0xf4) {
      point = first & 7;
      count = 3;
    } else throw new Error(textError);
    if (at + count > bytes.length) throw new Error(textError);
    const second = bytes[at];
    if (
      (first === 0xe0 && second < 0xa0) ||
      (first === 0xed && second >= 0xa0) ||
      (first === 0xf0 && second < 0x90) ||
      (first === 0xf4 && second >= 0x90)
    )
      throw new Error(textError);
    for (let n = 0; n < count; n++) {
      const next = bytes[at++];
      if (next < 0x80 || next > 0xbf) throw new Error(textError);
      point = (point << 6) | (next & 63);
    }
    if (point === 0xfffd) throw new Error(textError);
    out += String.fromCodePoint(point);
  }
  return out.replace(/^\ufeff/, "");
}

export function calendarTextSource(
  name: string,
  mimeType: string | undefined,
  bytes: Uint8Array,
): CalendarSource {
  assertCalendarTextMetadata(name, mimeType);
  const safeName = calendarFileName(name);
  const result: CalendarSource = {
    kind: "text",
    name: safeName,
    text: calendarUtf8Text(bytes),
  };
  const problem = validateCalendarSource(result);
  if (problem) throw new Error(problem);
  return result;
}

export function assertCalendarTextMetadata(name: string, mimeType?: string) {
  const extension = calendarFileName(name)
    .toLowerCase()
    .match(/\.(txt|csv)$/)?.[1];
  const mime = (mimeType || "").split(";")[0].trim().toLowerCase();
  const allowed =
    !mime ||
    mime === "application/octet-stream" ||
    mime === "text/plain" ||
    (extension === "csv" &&
      ["text/csv", "application/csv", "application/vnd.ms-excel"].includes(
        mime,
      ));
  if (!extension || !allowed) throw new Error(textError);
}

function jpegSize(bytes: Uint8Array) {
  let at = 2;
  while (at + 3 < bytes.length) {
    if (bytes[at++] !== 0xff) return null;
    while (bytes[at] === 0xff) at++;
    const marker = bytes[at++];
    if (marker === 0xda || marker === 0xd9) return null;
    if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (at + 1 >= bytes.length) return null;
    const length = bytes[at] * 256 + bytes[at + 1];
    if (length < 2 || at + length > bytes.length) return null;
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      if (length < 8) return null;
      return {
        width: bytes[at + 5] * 256 + bytes[at + 6],
        height: bytes[at + 3] * 256 + bytes[at + 4],
      };
    }
    at += length;
  }
  return null;
}

export interface CalendarImageInfo {
  mime: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
}
/** Inspect actual file headers before asking a full decoder to allocate pixels. */
export function inspectCalendarOriginalImage(
  bytes: Uint8Array,
  name?: string | null,
  mimeType?: string | null,
): CalendarImageInfo {
  if (!bytes.length || bytes.length > CALENDAR_LIMITS.maxOriginalImageBytes)
    throw new Error(imageError);
  const mime = (mimeType || "").split(";")[0].trim().toLowerCase();
  if (
    (mime &&
      ![
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "application/octet-stream",
      ].includes(mime)) ||
    (name && !/\.(jpe?g|png|webp)$/i.test(name))
  )
    throw new Error(imageError);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let result: CalendarImageInfo | null = null;
  if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const size = jpegSize(bytes);
    if (size) result = { mime: "image/jpeg", ...size };
  } else if (
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b) &&
    [73, 72, 68, 82].every((b, i) => bytes[i + 12] === b)
  ) {
    for (let at = 8; at + 12 <= bytes.length;) {
      const length = view.getUint32(at);
      const kind = String.fromCharCode(...bytes.slice(at + 4, at + 8));
      if (kind === "acTL") throw new Error(imageError);
      if (kind === "IDAT" || kind === "IEND") break;
      if (at + length + 12 > bytes.length) break;
      at += length + 12;
    }
    result = {
      mime: "image/png",
      width: view.getUint32(16),
      height: view.getUint32(20),
    };
  } else if (
    bytes.length >= 30 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    const kind = String.fromCharCode(...bytes.slice(12, 16));
    const le24 = (at: number) =>
      bytes[at] + bytes[at + 1] * 256 + bytes[at + 2] * 65536;
    if (kind === "VP8X" && !(bytes[20] & 2))
      result = {
        mime: "image/webp",
        width: le24(24) + 1,
        height: le24(27) + 1,
      };
    else if (
      kind === "VP8 " &&
      bytes[23] === 0x9d &&
      bytes[24] === 1 &&
      bytes[25] === 0x2a
    )
      result = {
        mime: "image/webp",
        width: view.getUint16(26, true) & 16383,
        height: view.getUint16(28, true) & 16383,
      };
    else if (kind === "VP8L" && bytes[20] === 0x2f)
      result = {
        mime: "image/webp",
        width: 1 + (view.getUint32(21, true) & 16383),
        height: 1 + ((view.getUint32(21, true) >>> 14) & 16383),
      };
  }
  if (
    !result ||
    result.width < 1 ||
    result.height < 1 ||
    result.width * result.height > CALENDAR_LIMITS.maxOriginalImagePixels
  )
    throw new Error(imageError);
  return result;
}

export function calendarImageSource(
  name: string,
  base64: string,
): CalendarSource {
  const safeName = calendarFileName(name);
  const result: CalendarSource = {
    kind: "image",
    name: safeName,
    dataUrl: `data:image/jpeg;base64,${base64}`,
  };
  const problem = validateCalendarSource(result);
  if (problem || !inspectCalendarJpeg(result.dataUrl))
    throw new Error(problem || imageError);
  return result;
}
