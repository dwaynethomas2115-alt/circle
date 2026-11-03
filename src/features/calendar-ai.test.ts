import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarInputSchema,
  decodeCalendarText,
  eventProblem,
  eventFingerprint,
} from "./calendar-ai";
const event = {
  title: "Lunch",
  description: "",
  location: "Home",
  startsAt: "2099-01-01T12:00:00Z",
  endsAt: "2099-01-01T13:00:00Z",
  warnings: [],
};
test("text and UTF-8 file boundaries reject bytes not characters, unsupported files and binary", () => {
  assert.ok(
    calendarInputSchema.safeParse({ text: "a".repeat(4000), timezone: "UTC" })
      .success,
  );
  for (const input of [
    { text: "a".repeat(4001), timezone: "UTC" },
    { text: "", timezone: "UTC" },
    { text: "Hello", timezone: "made-up" },
  ])
    assert.equal(calendarInputSchema.safeParse(input).success, false);
  assert.equal(
    decodeCalendarText(new Uint8Array(12000).fill(65), "file.csv").length,
    12000,
  );
  for (const [bytes, name] of [
    [new Uint8Array(12001), "file.txt"],
    [new Uint8Array([255]), "file.txt"],
    [new Uint8Array([65]), "file.pdf"],
    [new Uint8Array([0]), "file.txt"],
  ] as const)
    assert.throws(() => decodeCalendarText(bytes, name));
  assert.equal(
    calendarInputSchema.safeParse({
      text: "",
      timezone: "UTC",
      attachment: { type: "text", name: "file.txt", content: "é".repeat(6001) },
    }).success,
    false,
  );
});
test("future timed events require offset, valid dates, and positive duration; equivalent offsets deduplicate", () => {
  assert.equal(eventProblem(event), null);
  for (const startsAt of [
    "2099-01-01",
    "2099-01-01T12:00:00",
    "2099-02-30T12:00:00Z",
    "2000-01-01T12:00:00Z",
    "2099-01-01T14:00:00Z",
  ])
    assert.ok(eventProblem({ ...event, startsAt }));
  assert.equal(
    eventFingerprint(event),
    eventFingerprint({
      ...event,
      title: " LUNCH ",
      startsAt: "2099-01-01T13:00:00+01:00",
      endsAt: "2099-01-01T14:00:00+01:00",
    }),
  );
});
