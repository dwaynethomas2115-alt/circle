import test from "node:test";
import assert from "node:assert/strict";
import main, { type Context, type Dependencies } from "../function/index";
import { Repository } from "../function/repository";
import { execute, type Identity } from "../function/domain";
import { record } from "../function/records";
import { FakeDatabase } from "./fake-database";
import type { Result } from "../../src/types";
import type {
  CalendarAnalysisResult,
  CalendarImportEvent,
  CalendarImportResult,
} from "../../src/features/calendarAssistant";

process.env.APPWRITE_FUNCTION_API_ENDPOINT = "https://appwrite.example.test/v1";
process.env.APPWRITE_FUNCTION_PROJECT_ID = "test-project";
process.env.CIRCLE_DATABASE_ID = "circle";

const alice = {
  $id: "calendar-alice",
  name: "Alice",
  email: "alice@example.test",
};
const bob = { $id: "calendar-bob", name: "Bob", email: "bob@example.test" };
const outsider = {
  $id: "calendar-outsider",
  name: "Outsider",
  email: "outsider@example.test",
};
const event: CalendarImportEvent = {
  title: "Sunday lunch",
  description: "Bring a dish",
  location: "Community room",
  startsAt: "2090-03-01T18:00:00.000Z",
  endsAt: "2090-03-01T19:00:00.000Z",
};
const proposals: CalendarAnalysisResult = {
  reply: "Review the proposed event before adding it.",
  questions: [],
  proposals: [
    {
      id: "p1",
      title: event.title,
      description: event.description,
      location: event.location,
      startDate: "2090-03-01",
      startTime: "12:00",
      endDate: "2090-03-01",
      endTime: "13:00",
      timeZone: "America/Chicago",
      startOffset: null,
      endOffset: null,
      issues: [],
    },
  ],
};

async function setup() {
  const db = new FakeDatabase(),
    repo = new Repository(db.api, "circle");
  const mutate = (actor: Identity, request: unknown) =>
    repo.mutate(
      actor,
      request as Parameters<Repository["mutate"]>[1],
      async (store) => execute(store, actor, request),
    );
  const create = await mutate(alice, {
    kind: "action",
    action: {
      type: "createCircle",
      input: {
        name: "Private calendar",
        description: "",
        category: "Friends",
        discoverable: false,
        approvalRequired: false,
      },
    },
  });
  const circleId = (create.data as Result).id!;
  const invited = await mutate(alice, {
    kind: "action",
    action: { type: "createInvitation", circleId },
  });
  await mutate(bob, {
    kind: "action",
    action: { type: "redeemInvitation", code: (invited.data as Result).code! },
  });
  const request = {
    kind: "calendarAssistant",
    circleId,
    message: "Lunch March 1 2090 noon to 1 Central",
    history: [],
    referenceDate: "2026-11-02",
    timeZone: "America/Chicago",
  };
  const logs: string[] = [];
  async function call(
    body: unknown,
    actor = alice,
    analyze?: Dependencies["analyzeCalendar"],
    token = "fake-jwt",
  ) {
    const context: Context = {
      req: {
        bodyJson: body,
        headers: {
          "x-appwrite-user-jwt": token,
          "x-appwrite-key": "fake-function-key",
        },
      },
      res: { json: (body, status = 200) => ({ body, status }) },
      error: (message) => logs.push(message),
    };
    return (await main(context, {
      db: db.api,
      verifyIdentity: async () => actor,
      analyzeCalendar: analyze ?? (async () => structuredClone(proposals)),
    })) as {
      status: number;
      body: {
        data?: CalendarAnalysisResult & CalendarImportResult;
        error?: string;
        code?: string;
      };
    };
  }
  return { db, repo, mutate, circleId, request, call, logs };
}
const importRequest = (circleId: string, events = [event]) => ({
  kind: "importCalendar",
  input: { circleId, confirmed: true, events },
});
const eventRows = (db: FakeDatabase) =>
  [...db.rows.entries()].filter(([key]) => key.startsWith("events/"));

test("calendar analysis checks identity and membership before model/provider and creates no events", async () => {
  const h = await setup();
  delete process.env.OPENAI_CALENDAR_MODEL;
  let calls = 0;
  const provider = async () => {
    calls++;
    return structuredClone(proposals);
  };
  const beforeRows = h.db.rows.size;
  const noJwt = await h.call(h.request, alice, provider, "");
  assert.equal(noJwt.status, 401);
  const denied = await h.call(h.request, outsider, provider);
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, "calendar_membership_required");
  const disabled = await h.call(h.request, alice, provider);
  assert.equal(disabled.status, 503);
  assert.equal(disabled.body.code, "calendar_ai_disabled");
  assert.equal(calls, 0);
  assert.equal(h.db.rows.size, beforeRows);
  process.env.OPENAI_CALENDAR_MODEL = "mock-calendar-model";
  const ready = await h.call(h.request, alice, provider);
  assert.equal(ready.status, 200);
  assert.deepEqual(ready.body.data, proposals);
  assert.equal(calls, 1);
  assert.equal(eventRows(h.db).length, 0);
  assert.equal(
    h.db.rows.size,
    beforeRows,
    "analysis persists no source/chat/proposal rows",
  );
  delete process.env.OPENAI_CALENDAR_MODEL;
});

test("membership revoked during provider work suppresses every late proposal", async () => {
  const h = await setup();
  process.env.OPENAI_CALENDAR_MODEL = "mock-calendar-model";
  const result = await h.call(h.request, bob, async () => {
    await h.mutate(alice, {
      kind: "action",
      action: { type: "removeMember", circleId: h.circleId, userId: bob.$id },
    });
    return structuredClone(proposals);
  });
  assert.equal(result.status, 403);
  assert.equal(result.body.data, undefined);
  assert.equal(eventRows(h.db).length, 0);
  delete process.env.OPENAI_CALENDAR_MODEL;
});

test("analysis supports only its bounded input route; unsupported documents and malformed output never write", async () => {
  const h = await setup();
  process.env.OPENAI_CALENDAR_MODEL = "mock-calendar-model";
  let calls = 0;
  const provider = async () => {
    calls++;
    return structuredClone(proposals);
  };
  for (const source of [
    { kind: "text", name: "calendar.pdf", text: "not a supported file" },
    { kind: "text", name: "calendar.txt", text: "x".repeat(12001) },
    {
      kind: "image",
      name: "calendar.jpg",
      dataUrl: "https://private.example/photo?token=never-fetch",
    },
  ]) {
    const rejected = await h.call({ ...h.request, source }, alice, provider);
    assert.equal(rejected.status, 400);
  }
  assert.equal(calls, 0);
  const huge = await h.call(
    {
      ...h.request,
      source: { kind: "image", name: "x.jpg", dataUrl: "A".repeat(240001) },
    },
    alice,
    provider,
  );
  assert.equal(huge.status, 413);
  const general = await h.call({
    kind: "snapshot",
    unrelated: "x".repeat(24001),
  });
  assert.equal(general.status, 413, "the normal request limit remains 24k");
  const malformed = await h.call(
    h.request,
    alice,
    async () =>
      ({
        ...proposals,
        writeCalendar: true,
      }) as unknown as CalendarAnalysisResult,
  );
  assert.equal(malformed.status, 502);
  assert.equal(malformed.body.data, undefined);
  assert.equal(eventRows(h.db).length, 0);
  delete process.env.OPENAI_CALENDAR_MODEL;
});

test("explicit confirmation and complete valid future events are required atomically", async () => {
  const h = await setup();
  for (const input of [
    { circleId: h.circleId, confirmed: false, events: [event] },
    { circleId: h.circleId, events: [event] },
    { circleId: h.circleId, confirmed: true, events: [] },
    {
      circleId: h.circleId,
      confirmed: true,
      events: Array.from({ length: 21 }, () => event),
    },
    {
      circleId: h.circleId,
      confirmed: true,
      events: [event, { ...event, startsAt: "2090-02-30T18:00:00.000Z" }],
    },
    {
      circleId: h.circleId,
      confirmed: true,
      events: [event, { ...event, startsAt: "2000-01-01T18:00:00.000Z" }],
    },
  ]) {
    const result = await h.call({ kind: "importCalendar", input });
    assert.equal(result.status, 400);
    assert.equal(eventRows(h.db).length, 0);
  }
  const foreign = await h.call(importRequest(h.circleId), outsider);
  assert.equal(foreign.status, 403);
  assert.equal(eventRows(h.db).length, 0);
});

test("imports deduplicate within batch and across actors/manual retries without duplicating post-response-lost writes", async () => {
  const h = await setup();
  const first = await h.call(
    importRequest(h.circleId, [
      event,
      { ...event, title: "  SUNDAY   LUNCH ", description: "Different notes" },
    ]),
  );
  assert.equal(first.status, 200);
  assert.equal(first.body.data?.created, 1);
  assert.equal(first.body.data?.skipped, 1);
  const knownId = first.body.data?.eventIds?.[0];
  const retry = await h.call(importRequest(h.circleId), bob);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.data?.created, 0);
  assert.equal(retry.body.data?.skipped, 1);
  assert.equal(eventRows(h.db).length, 1);
  const saved = JSON.parse(eventRows(h.db)[0][1].data);
  assert.equal(saved.id, knownId);
  assert.equal(saved.authorId, alice.$id);
  assert.equal(saved.circleId, h.circleId);
});

test("normal events outside the recent 100-event projection are still checked for duplicate imports", async () => {
  const h = await setup();
  for (let i = 0; i < 120; i++) {
    const value = {
      ...event,
      id: `manual-${i}`,
      circleId: h.circleId,
      authorId: alice.$id,
      title: i === 0 ? event.title : `Other existing event ${i}`,
      createdAt: new Date(Date.UTC(2020, 0, 1, 0, 0, i)).toISOString(),
    };
    const entity = record(
      "events",
      value.id,
      value,
      h.circleId,
      alice.$id,
      "",
      value.createdAt,
    );
    h.db.rows.set(`events/${entity.id}`, {
      $id: entity.id,
      $permissions: [],
      ...entity.data,
    });
  }
  const projection = await h.repo.read(alice, { kind: "features" });
  assert.equal(
    (projection.data as { events: { id: string }[] }).events.length,
    100,
  );
  assert.ok(
    !(projection.data as { events: { id: string }[] }).events.some(
      (e) => e.id === "manual-0",
    ),
  );
  const result = await h.call(importRequest(h.circleId));
  assert.equal(result.body.data?.created, 0);
  assert.equal(result.body.data?.skipped, 1);
  assert.equal(eventRows(h.db).length, 120);
});

test("concurrent imports serialize under Circle guards, and a retry creates no duplicate", async () => {
  const h = await setup();
  const attempts = await Promise.all([
    h.call(importRequest(h.circleId), alice),
    h.call(importRequest(h.circleId), bob),
  ]);
  assert.equal(
    attempts.filter((r) => r.status === 200 && r.body.data?.created === 1)
      .length,
    1,
  );
  assert.ok(attempts.every((r) => r.status === 200 || r.status === 409));
  const again = await h.call(importRequest(h.circleId), bob);
  assert.equal(again.status, 200);
  assert.equal(again.body.data?.created, 0);
  assert.equal(eventRows(h.db).length, 1);
});

test("overlapping analysis for one actor is rejected before another provider call and released after completion", async () => {
  const h = await setup();
  process.env.OPENAI_CALENDAR_MODEL = "mock-calendar-model";
  let release!: () => void, started!: () => void;
  const hold = new Promise<void>((resolve) => (release = resolve)),
    began = new Promise<void>((resolve) => (started = resolve));
  let calls = 0;
  const first = h.call(h.request, alice, async () => {
    calls++;
    started();
    await hold;
    return structuredClone(proposals);
  });
  await began;
  const overlapping = await h.call(h.request, alice, async () => {
    calls++;
    return structuredClone(proposals);
  });
  assert.equal(overlapping.status, 429);
  assert.equal(calls, 1);
  release();
  assert.equal((await first).status, 200);
  assert.equal((await h.call(h.request)).status, 200);
  delete process.env.OPENAI_CALENDAR_MODEL;
});
