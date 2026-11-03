import type { Result } from "../types";

export const CALENDAR_LIMITS = {
  maxProposals: 20,
  maxEvents: 20,
  maxMessageChars: 4000,
  maxHistoryMessages: 6,
  maxHistoryMessageChars: 2000,
  maxHistoryChars: 12000,
  maxTextBytes: 12000,
  maxImageBytes: 120 * 1024,
  maxRequestBytes: 240000,
  maxImportRequestBytes: 24000,
  maxSourceNameChars: 120,
  maxOriginalImageBytes: 10 * 1024 * 1024,
  maxOriginalImagePixels: 20000000,
  maxImageEdge: 1600,
  maxImagePixels: 1600 * 1600,
} as const;

export type CalendarSource =
  | { kind: "text"; name: string; text: string }
  | { kind: "image"; name: string; dataUrl: string };
export interface CalendarMessage {
  role: "user" | "assistant";
  content: string;
}
export interface CalendarProposal {
  id: string;
  title: string;
  description: string;
  location: string;
  startDate: string | null;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  timeZone: string | null;
  startOffset: string | null;
  endOffset: string | null;
  issues: string[];
}
export interface CalendarAnalysisInput {
  circleId: string;
  message: string;
  history: CalendarMessage[];
  source?: CalendarSource;
  referenceDate: string;
  timeZone: string | null;
}
export interface CalendarAnalysisResult {
  reply: string;
  questions: string[];
  proposals: CalendarProposal[];
}
export interface CalendarImportEvent {
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
}
export interface CalendarImportInput {
  circleId: string;
  confirmed: true;
  events: CalendarImportEvent[];
}
export interface CalendarImportResult extends Result {
  created?: number;
  skipped?: number;
  eventIds?: string[];
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function keys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
) {
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every(
      (key) => required.includes(key) || optional.includes(key),
    )
  );
}
function text(value: unknown, max: number, min = 0): value is string {
  return (
    typeof value === "string" &&
    value.length <= max &&
    value.trim().length >= min
  );
}
/** UTF-8 size without Node Buffer, so validation also runs on native clients. */
export function calendarUtf8Bytes(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}
function utcFromParts(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
) {
  const value = new Date(0);
  value.setUTCFullYear(year, month - 1, day);
  value.setUTCHours(hour, minute, 0, 0);
  return value.getTime();
}
function dateParts(value: unknown): number[] | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(utcFromParts(year, month, day));
  return check.getUTCFullYear() === year &&
    check.getUTCMonth() + 1 === month &&
    check.getUTCDate() === day
    ? [year, month, day]
    : null;
}

/** Abbreviations such as CST are intentionally rejected because they are ambiguous. */
export function isCalendarTimeZone(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 100 ||
    !(value === "UTC" || /^[A-Za-z_]+\/[A-Za-z0-9_+/-]+$/.test(value))
  )
    return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Decode only a bounded, canonical base64 string; never fetch a supplied URL. */
function imageBytes(value: string): Uint8Array | null {
  const prefix = "data:image/jpeg;base64,";
  if (!value.startsWith(prefix)) return null;
  const encoded = value.slice(prefix.length);
  if (
    !encoded ||
    encoded.length > Math.ceil(CALENDAR_LIMITS.maxImageBytes / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      encoded,
    )
  )
    return null;
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  const result = new Uint8Array((encoded.length / 4) * 3 - padding);
  let index = 0;
  for (let at = 0; at < encoded.length; at += 4) {
    const a = alphabet.indexOf(encoded[at]),
      b = alphabet.indexOf(encoded[at + 1]);
    const c = encoded[at + 2] === "=" ? 0 : alphabet.indexOf(encoded[at + 2]);
    const d = encoded[at + 3] === "=" ? 0 : alphabet.indexOf(encoded[at + 3]);
    if (
      at === encoded.length - 4 &&
      ((padding === 2 && b & 15) || (padding === 1 && c & 3))
    )
      return null;
    const chunk = (a << 18) | (b << 12) | (c << 6) | d;
    if (index < result.length) result[index++] = chunk >>> 16;
    if (index < result.length) result[index++] = chunk >>> 8;
    if (index < result.length) result[index++] = chunk;
  }
  return result;
}
export function inspectCalendarJpeg(
  dataUrl: string,
): { width: number; height: number } | null {
  const bytes = imageBytes(dataUrl);
  if (
    !bytes ||
    bytes.length < 12 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[bytes.length - 2] !== 0xff ||
    bytes[bytes.length - 1] !== 0xd9
  )
    return null;
  let at = 2;
  while (at + 3 < bytes.length) {
    if (bytes[at++] !== 0xff) return null;
    while (bytes[at] === 0xff) at++;
    const marker = bytes[at++];
    if (marker === 0xda || marker === 0xd9) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
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
      const height = bytes[at + 3] * 256 + bytes[at + 4];
      const width = bytes[at + 5] * 256 + bytes[at + 6];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    at += length;
  }
  return null;
}

export function validateCalendarSource(value: unknown): string | null {
  if (
    !object(value) ||
    !text(value.name, CALENDAR_LIMITS.maxSourceNameChars, 1) ||
    /[\u0000-\u001f/\\]/.test(value.name)
  )
    return "Choose a file with a simple name of up to 120 characters.";
  if (value.kind === "text") {
    if (
      !keys(value, ["kind", "name", "text"]) ||
      !/\.(txt|csv)$/i.test(value.name) ||
      !text(value.text, CALENDAR_LIMITS.maxTextBytes, 1) ||
      calendarUtf8Bytes(value.text) > CALENDAR_LIMITS.maxTextBytes ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/.test(value.text) ||
      /^(?:%PDF-|PK\x03\x04|BEGIN:VCALENDAR|<!DOCTYPE\s+html\b|<html\b|<svg\b|<\?xml\b)/i.test(
        value.text.trimStart(),
      )
    )
      return "Use a readable UTF-8 TXT or CSV file up to 12,000 bytes. PDF, ICS and Office files are not supported yet.";
    return null;
  }
  if (value.kind === "image") {
    if (
      !keys(value, ["kind", "name", "dataUrl"]) ||
      !/\.(jpe?g|png|webp)$/i.test(value.name) ||
      typeof value.dataUrl !== "string"
    )
      return "Choose a JPEG, PNG or WebP calendar photo. Other image formats are not supported yet.";
    const size = inspectCalendarJpeg(value.dataUrl);
    if (
      !size ||
      size.width > CALENDAR_LIMITS.maxImageEdge ||
      size.height > CALENDAR_LIMITS.maxImageEdge ||
      size.width * size.height > CALENDAR_LIMITS.maxImagePixels
    )
      return "The prepared photo must be a valid JPEG up to 120 KiB and 1,600 pixels on each side. Crop it or choose a clearer, smaller photo.";
    return null;
  }
  return "Supported attachments are UTF-8 TXT/CSV and JPEG/PNG/WebP photos only.";
}

export function validateCalendarAnalysisInput(value: unknown): string | null {
  if (
    !object(value) ||
    !keys(
      value,
      ["circleId", "message", "history", "referenceDate", "timeZone"],
      ["source"],
    ) ||
    !text(value.circleId, 128, 1) ||
    !text(value.message, CALENDAR_LIMITS.maxMessageChars)
  )
    return "Choose a Circle and use a message up to 4,000 characters.";
  if (
    !Array.isArray(value.history) ||
    value.history.length > CALENDAR_LIMITS.maxHistoryMessages ||
    value.history.some(
      (item) =>
        !object(item) ||
        !keys(item, ["role", "content"]) ||
        !["user", "assistant"].includes(String(item.role)) ||
        !text(item.content, CALENDAR_LIMITS.maxHistoryMessageChars, 1),
    ) ||
    value.history.reduce((sum, item) => sum + item.content.length, 0) >
      CALENDAR_LIMITS.maxHistoryChars
  )
    return "Keep chat context to six messages of up to 2,000 characters each.";
  if (!dateParts(value.referenceDate))
    return "Choose a complete reference date using YYYY-MM-DD, including the year.";
  if (value.timeZone !== null && !isCalendarTimeZone(value.timeZone))
    return "Choose a valid IANA timezone, such as America/Chicago or UTC.";
  if (value.source !== undefined) {
    const problem = validateCalendarSource(value.source);
    if (problem) return problem;
  }
  if (!value.message.trim() && value.source === undefined)
    return "Describe an event or attach a supported calendar file/photo.";
  if (
    calendarUtf8Bytes(JSON.stringify(value)) > CALENDAR_LIMITS.maxRequestBytes
  )
    return "This calendar request is too large. Shorten the chat or choose a smaller attachment.";
  return null;
}

const proposalKeys = [
  "id",
  "title",
  "description",
  "location",
  "startDate",
  "startTime",
  "endDate",
  "endTime",
  "timeZone",
  "startOffset",
  "endOffset",
  "issues",
];
function strings(value: unknown, count: number, length: number) {
  return (
    Array.isArray(value) &&
    value.length <= count &&
    value.every((item) => text(item, length, 1))
  );
}
export function validateCalendarAnalysisResult(
  value: unknown,
): value is CalendarAnalysisResult {
  if (
    !object(value) ||
    !keys(value, ["reply", "questions", "proposals"]) ||
    !text(value.reply, 4000, 1) ||
    !strings(value.questions, 20, 300) ||
    !Array.isArray(value.proposals) ||
    value.proposals.length > CALENDAR_LIMITS.maxProposals
  )
    return false;
  const seen = new Set<string>();
  return value.proposals.every((item) => {
    if (
      !object(item) ||
      !keys(item, proposalKeys) ||
      !text(item.id, 100, 1) ||
      seen.has(item.id) ||
      !text(item.title, 120) ||
      !text(item.description, 2000) ||
      !text(item.location, 200) ||
      !strings(item.issues, 20, 300)
    )
      return false;
    seen.add(item.id);
    return (
      ["startDate", "endDate"].every(
        (key) => item[key] === null || text(item[key], 10),
      ) &&
      ["startTime", "endTime"].every(
        (key) => item[key] === null || text(item[key], 5),
      ) &&
      (item.timeZone === null || text(item.timeZone, 100)) &&
      ["startOffset", "endOffset"].every(
        (key) => item[key] === null || text(item[key], 6),
      )
    );
  });
}

interface ResolvedCalendarTime {
  iso?: string;
  error?: string;
  offsetChoices?: string[];
}
function offsetMinutes(value: string): number | null {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(value);
  if (!match || Number(match[2]) > 14 || Number(match[3]) > 59) return null;
  const magnitude = Number(match[2]) * 60 + Number(match[3]);
  return magnitude <= 14 * 60 ? magnitude * (match[1] === "-" ? -1 : 1) : null;
}
function offsetLabel(value: number) {
  const minutes = Math.abs(value);
  return `${value < 0 ? "-" : "+"}${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Resolve civil time by finding actual timezone offsets. Never let Date silently
 * normalize an invalid day, daylight-saving gap, or an ambiguous clock fold.
 */
export function resolveCalendarDateTime(
  date: string | null,
  time: string | null,
  zone: string | null,
  offset?: string | null,
): ResolvedCalendarTime {
  const day = dateParts(date);
  if (!day)
    return {
      error: "Use a complete valid date (YYYY-MM-DD), including the year.",
    };
  const clock =
    typeof time === "string" ? /^(\d{2}):(\d{2})$/.exec(time) : null;
  if (!clock || Number(clock[1]) > 23 || Number(clock[2]) > 59)
    return {
      error:
        "Choose an explicit time using HH:mm (24-hour); do not guess AM or PM.",
    };
  if (!isCalendarTimeZone(zone))
    return {
      error:
        "Choose an explicit IANA timezone, such as America/Chicago or UTC.",
    };
  const parts = [...day, Number(clock[1]), Number(clock[2])];
  const naive = utcFromParts(parts[0], parts[1], parts[2], parts[3], parts[4]);
  const formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const civil = (timestamp: number) => {
    const fields = Object.fromEntries(
      formatter.formatToParts(timestamp).map((part) => [part.type, part.value]),
    );
    return [
      Number(fields.year),
      Number(fields.month),
      Number(fields.day),
      Number(fields.hour),
      Number(fields.minute),
    ];
  };
  const offsets = new Set<number>();
  for (let delta = -48; delta <= 48; delta += 6) {
    const sample = naive + delta * 3600000;
    const local = civil(sample);
    offsets.add(
      (utcFromParts(local[0], local[1], local[2], local[3], local[4]) -
        sample) /
        60000,
    );
  }
  const candidates = [...offsets]
    .filter((minutes) => {
      const actual = civil(naive - minutes * 60000);
      return actual.every((value, index) => value === parts[index]);
    })
    .sort((a, b) => b - a);
  if (!candidates.length)
    return {
      error:
        "This local time does not exist because the clock changes. Choose another time.",
    };
  if (offset) {
    const selected = offsetMinutes(offset);
    if (selected === null || !candidates.includes(selected))
      return {
        error: "That UTC offset does not match this date, time and timezone.",
        offsetChoices: candidates.map(offsetLabel),
      };
    return { iso: new Date(naive - selected * 60000).toISOString() };
  }
  if (candidates.length > 1)
    return {
      error:
        "This local time occurs twice when the clock changes. Choose the intended UTC offset.",
      offsetChoices: candidates.map(offsetLabel),
    };
  return { iso: new Date(naive - candidates[0] * 60000).toISOString() };
}

/** Model issues remain visible for a human to resolve and acknowledge. A valid
 * event alone never authorizes a save; the UI and import endpoint require review.
 */
export function proposalToEvent(
  proposal: CalendarProposal,
  now = Date.now(),
): { event?: CalendarImportEvent; errors: string[] } {
  const errors: string[] = [];
  if (!text(proposal.title, 120, 3))
    errors.push("Use a title between 3 and 120 characters.");
  if (!text(proposal.description, 2000))
    errors.push("Keep details to 2,000 characters.");
  if (!text(proposal.location, 200))
    errors.push("Keep the location to 200 characters.");
  const start = resolveCalendarDateTime(
    proposal.startDate,
    proposal.startTime,
    proposal.timeZone,
    proposal.startOffset,
  );
  const end = resolveCalendarDateTime(
    proposal.endDate,
    proposal.endTime,
    proposal.timeZone,
    proposal.endOffset,
  );
  if (start.error)
    errors.push(
      `Start: ${start.error}${start.offsetChoices ? ` Options: ${start.offsetChoices.join(", ")}.` : ""}`,
    );
  if (end.error)
    errors.push(
      `End: ${end.error}${end.offsetChoices ? ` Options: ${end.offsetChoices.join(", ")}.` : ""}`,
    );
  if (start.iso && Date.parse(start.iso) <= now)
    errors.push(
      "Choose a start time in the future; past events are not supported by this calendar.",
    );
  if (start.iso && end.iso && Date.parse(end.iso) <= Date.parse(start.iso))
    errors.push("The event must end after it starts.");
  return errors.length
    ? { errors }
    : {
        errors,
        event: {
          title: proposal.title.trim(),
          description: proposal.description.trim(),
          location: proposal.location.trim(),
          startsAt: start.iso!,
          endsAt: end.iso!,
        },
      };
}

const utcTimestamp = (value: unknown) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(Date.parse(value)).toISOString().slice(0, 19) === value.slice(0, 19);
export function validateCalendarImportInput(
  value: unknown,
  now = Date.now(),
): string | null {
  if (
    !object(value) ||
    !keys(value, ["circleId", "confirmed", "events"]) ||
    !text(value.circleId, 128, 1) ||
    value.confirmed !== true ||
    !Array.isArray(value.events) ||
    !value.events.length ||
    value.events.length > CALENDAR_LIMITS.maxEvents
  )
    return "Explicitly confirm between one and twenty reviewed events for this Circle.";
  for (const event of value.events) {
    if (
      !object(event) ||
      !keys(event, [
        "title",
        "description",
        "location",
        "startsAt",
        "endsAt",
      ]) ||
      !text(event.title, 120, 3) ||
      !text(event.description, 2000) ||
      !text(event.location, 200) ||
      !utcTimestamp(event.startsAt) ||
      !utcTimestamp(event.endsAt)
    )
      return "Every reviewed event needs a valid title, bounded details/location and explicit UTC start/end.";
    if (
      Date.parse(String(event.startsAt)) <= now ||
      Date.parse(String(event.endsAt)) <= Date.parse(String(event.startsAt))
    )
      return "Every event must start in the future and end after it starts.";
  }
  if (
    calendarUtf8Bytes(
      JSON.stringify({ kind: "importCalendar", input: value }),
    ) > CALENDAR_LIMITS.maxImportRequestBytes
  )
    return "This reviewed import is too large. Select fewer events or shorten their details before confirming.";
  return null;
}
export function canonicalCalendarEvent(event: CalendarImportEvent): string {
  const normalized = (value: string) =>
    value.trim().replace(/\s+/g, " ").toLowerCase();
  return JSON.stringify([
    normalized(event.title),
    new Date(event.startsAt).toISOString(),
    new Date(event.endsAt).toISOString(),
    normalized(event.location),
  ]);
}
