import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import main, { type Context, type Dependencies } from "../function/index";
import { Repository } from "../function/repository";
import { execute, type Identity } from "../function/domain";
import { record } from "../function/records";
import { FakeDatabase } from "./fake-database";
import type { Result } from "../../src/types";
import type {
  CalendarAnalysisResult,
  CalendarImportEvent,
} from "../../src/features/calendarAssistant";
import type { CalendarJobResult } from "../../src/features/calendarJobs";

process.env.APPWRITE_FUNCTION_API_ENDPOINT = "https://appwrite.example.test/v1";
process.env.APPWRITE_FUNCTION_PROJECT_ID = "test-project";
process.env.CIRCLE_DATABASE_ID = "circle";
process.env.OPENAI_API_KEY = "mock-calendar-key";
process.env.OPENAI_CALENDAR_MODEL = "must-not-select-an-alternate-model";
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
const eventRows = (db: FakeDatabase) =>
  [...db.rows.entries()].filter(([key]) => key.startsWith("events/"));
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
    kind: "analyzeCalendar" as const,
    circleId,
    requestId: randomUUID(),
    input: {
      circleId,
      message: "private-source-sentinel Lunch March 1 2090 noon to 1 Central",
      history: [],
      referenceDate: "2026-11-02",
      timeZone: "America/Chicago",
    },
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
        data?: CalendarJobResult & {
          model?: string;
          enabled?: boolean;
          reviewContractVersion?: number;
        };
        error?: string;
        code?: string;
      };
    };
  }
  const save = (requestId = request.requestId, events = [event]) => ({
    kind: "saveCalendar",
    circleId,
    requestId,
    confirmed: true,
    events: events.map((item) => ({ ...item, reviewed: true })),
  });
  return { db, repo, mutate, circleId, request, call, save, logs };
}

test("calendar capabilities are enabled on pinned Luna and identity/membership precedes key/provider access", async () => {
  const h = await setup();
  let calls = 0;
  const provider = async () => {
    calls++;
    return structuredClone(proposals);
  };
  assert.equal((await h.call(h.request, alice, provider, "")).status, 401);
  assert.equal((await h.call(h.request, outsider, provider)).status, 403);
  const result = await h.call({
    kind: "calendarCapabilities",
    circleId: h.circleId,
  });
  assert.equal(result.body.data?.model, "gpt-6-luna");
  assert.equal(result.body.data?.enabled, true);
  assert.equal(result.body.data?.reviewContractVersion, 2);
  assert.equal(calls, 0);
  assert.equal(eventRows(h.db).length, 0);
  assert.equal(
    (await h.call({ kind: "calendarAssistant", ...h.request.input })).status,
    400,
  );
  assert.equal(
    (
      await h.call({
        kind: "importCalendar",
        input: { circleId: h.circleId, confirmed: true, events: [event] },
      })
    ).status,
    400,
  );
});

test("durable analysis claim runs once, scopes source hashes and exposes only current-member proposals", async () => {
  const h = await setup();
  let calls = 0;
  const provider = async () => {
    calls++;
    return structuredClone(proposals);
  };
  const first = await h.call(h.request, alice, provider);
  assert.equal(first.body.data?.status, "ready");
  assert.deepEqual(first.body.data?.proposal, proposals);
  assert.equal(
    (await h.call(h.request, alice, provider)).body.data?.status,
    "ready",
  );
  assert.equal(calls, 1);
  assert.equal(
    (
      await h.call(
        {
          ...h.request,
          input: { ...h.request.input, message: "different source" },
        },
        alice,
        provider,
      )
    ).status,
    400,
  );
  assert.equal(
    (await h.call({ ...h.request, circleId: "different" }, alice, provider))
      .status,
    400,
  );
  assert.equal(
    (
      await h.call(
        {
          kind: "calendarResult",
          circleId: h.circleId,
          requestId: h.request.requestId,
        },
        bob,
      )
    ).status,
    404,
  );
  assert.equal(eventRows(h.db).length, 0);
  assert.doesNotMatch(
    JSON.stringify([...h.db.rows.values()]),
    /private-source-sentinel/,
  );
  const rows = [...h.db.rows.entries()].filter(([key]) =>
    key.startsWith("calendar_imports/"),
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0][1].$permissions, []);
});

test("concurrent retries of the same analysis share a durable claim and never invoke a second provider", async () => {
  const h = await setup();
  let release!: () => void,
    started!: () => void,
    calls = 0;
  const hold = new Promise<void>((resolve) => (release = resolve)),
    began = new Promise<void>((resolve) => (started = resolve));
  const first = h.call(h.request, alice, async () => {
    calls++;
    started();
    await hold;
    return structuredClone(proposals);
  });
  await began;
  const second = await h.call(h.request, alice, async () => {
    calls++;
    return structuredClone(proposals);
  });
  assert.equal(second.body.data?.status, "processing");
  assert.equal(calls, 1);
  release();
  assert.equal((await first).body.data?.status, "ready");
});

test("membership revoked while inference runs prevents completion, result reads and saves", async () => {
  const h = await setup();
  const result = await h.call(h.request, bob, async () => {
    await h.mutate(alice, {
      kind: "action",
      action: { type: "removeMember", circleId: h.circleId, userId: bob.$id },
    });
    return structuredClone(proposals);
  });
  assert.equal(result.status, 403);
  assert.equal(
    (
      await h.call(
        {
          kind: "calendarResult",
          circleId: h.circleId,
          requestId: h.request.requestId,
        },
        bob,
      )
    ).status,
    403,
  );
  assert.equal((await h.call(h.save(), bob)).status, 403);
  assert.equal(eventRows(h.db).length, 0);
});

test("malformed sources and provider outputs cannot save events or automatically repeat failed inference", async () => {
  const h = await setup();
  let calls = 0;
  const provider = async () => {
    calls++;
    return structuredClone(proposals);
  };
  for (const source of [
    { kind: "text", name: "calendar.pdf", text: "bad" },
    { kind: "text", name: "calendar.txt", text: "x".repeat(12001) },
    {
      kind: "image",
      name: "calendar.jpg",
      dataUrl: "https://private.example/photo",
    },
  ])
    assert.equal(
      (
        await h.call(
          { ...h.request, input: { ...h.request.input, source } },
          alice,
          provider,
        )
      ).status,
      400,
    );
  assert.equal(calls, 0);
  assert.equal(
    (
      await h.call({
        ...h.request,
        input: {
          ...h.request.input,
          source: { kind: "image", name: "x.jpg", dataUrl: "A".repeat(240001) },
        },
      })
    ).status,
    413,
  );
  assert.equal(
    (await h.call({ kind: "snapshot", unrelated: "x".repeat(24001) })).status,
    413,
  );
  const invalid = async () => {
    calls++;
    return { ...proposals, writeCalendar: true } as CalendarAnalysisResult;
  };
  const failed = await h.call(h.request, alice, invalid);
  assert.equal(failed.body.data?.status, "failed");
  assert.equal(
    (await h.call(h.request, alice, invalid)).body.data?.status,
    "failed",
  );
  assert.equal(calls, 1);
  assert.equal(eventRows(h.db).length, 0);
});

test("a ready claim, per-event review, final confirmation and complete future dates are required atomically", async () => {
  const h = await setup();
  assert.equal((await h.call(h.save())).status, 404);
  await h.call(h.request);
  for (const request of [
    { ...h.save(), confirmed: false },
    { ...h.save(), events: [{ ...event, reviewed: false }] },
    { ...h.save(), events: [] },
    h.save(
      undefined,
      Array.from({ length: 21 }, () => event),
    ),
    h.save(undefined, [
      event,
      { ...event, startsAt: "2090-02-30T18:00:00.000Z" },
    ]),
    h.save(undefined, [
      event,
      { ...event, startsAt: "2000-01-01T18:00:00.000Z" },
    ]),
  ]) {
    assert.equal((await h.call(request)).status, 400);
    assert.equal(eventRows(h.db).length, 0);
  }
  assert.equal((await h.call(h.save(), outsider)).status, 403);
});

test("saved receipts survive exact retries; changed retries fail; cross-actor matching events deduplicate", async () => {
  const h = await setup();
  await h.call(h.request);
  const request = h.save(undefined, [
    event,
    { ...event, title: " SUNDAY   LUNCH ", description: "Different notes" },
  ]);
  const first = await h.call(request),
    again = await h.call(request);
  assert.deepEqual(first.body.data, again.body.data);
  assert.equal(first.body.data?.receipt?.created, 1);
  assert.equal(first.body.data?.receipt?.skipped, 1);
  assert.equal(
    (await h.call(h.save(undefined, [{ ...event, title: "Changed" }]))).status,
    400,
  );
  const b = { ...h.request, requestId: randomUUID() };
  await h.call(b, bob);
  const retry = await h.call(h.save(b.requestId), bob);
  assert.equal(retry.body.data?.receipt?.created, 0);
  assert.equal(retry.body.data?.receipt?.skipped, 1);
  assert.equal(eventRows(h.db).length, 1);
});

test("deduplication includes normal events beyond the recent 100-event projection", async () => {
  const h = await setup();
  for (let i = 0; i < 120; i++) {
    const value = {
      ...event,
      id: `manual-${i}`,
      circleId: h.circleId,
      authorId: alice.$id,
      title: i ? `Other existing event ${i}` : event.title,
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
  assert.equal(
    (await h.repo.read(alice, { kind: "features" })).store.features.events
      .length,
    100,
  );
  await h.call(h.request);
  const saved = await h.call(h.save());
  assert.equal(saved.body.data?.receipt?.skipped, 1);
  assert.equal(eventRows(h.db).length, 120);
});

test("concurrent actor saves serialize under Circle guards and retry without duplicates", async () => {
  const h = await setup();
  const b = { ...h.request, requestId: randomUUID() };
  await h.call(h.request);
  await h.call(b, bob);
  const [one, two] = await Promise.all([
    h.call(h.save()),
    h.call(h.save(b.requestId), bob),
  ]);
  assert.equal(
    [one, two].filter((r) => r.body.data?.receipt?.created === 1).length,
    1,
  );
  assert.ok([one.status, two.status].every((s) => s === 200 || s === 409));
  await h.call(h.save(b.requestId), bob);
  assert.equal(eventRows(h.db).length, 1);
});

test("completion retries a database409 without replaying the provider", async () => {
  const h = await setup();
  let calls = 0;
  const result = await h.call(h.request, alice, async () => {
    calls++;
    h.db.conflictNext = true;
    return structuredClone(proposals);
  });
  assert.equal(result.body.data?.status, "ready");
  assert.equal(calls, 1);
  assert.ok(h.db.calls.filter((c) => c.method === "rollback").length >= 1);
});

test("uncertain completion commits are read back rather than generating again", async () => {
  const h = await setup();
  let calls = 0,
    armed = false;
  const update = h.db.updateTransaction.bind(h.db);
  h.db.updateTransaction = async (args) => {
    const result = await update(args);
    if (armed && args.commit) {
      armed = false;
      throw Object.assign(new Error("Commit response lost"), { code: 503 });
    }
    return result;
  };
  const ready = await h.call(h.request, alice, async () => {
    calls++;
    armed = true;
    return structuredClone(proposals);
  });
  assert.equal(ready.body.data?.status, "ready");
  await h.call(h.request, alice, async () => {
    calls++;
    return proposals;
  });
  assert.equal(calls, 1);
});

test("exhausted database completion conflicts retain a non-replayable processing claim", async () => {
  const h = await setup();
  let calls = 0,
    reject = 0;
  const update = h.db.updateTransaction.bind(h.db);
  h.db.updateTransaction = async (args) => {
    if (args.commit && reject > 0) {
      reject--;
      throw Object.assign(new Error("Conflict"), { code: 409 });
    }
    return update(args);
  };
  const failed = await h.call(h.request, alice, async () => {
    calls++;
    reject = 3;
    return structuredClone(proposals);
  });
  assert.equal(failed.status, 409);
  const retry = await h.call(h.request, alice, async () => {
    calls++;
    return proposals;
  });
  assert.equal(retry.body.data?.status, "processing");
  assert.equal(calls, 1);
});

test("terminal provider failures are sanitized, persisted and not retried automatically", async () => {
  const h = await setup();
  let calls = 0;
  const provider = async () => {
    calls++;
    throw new Error("private-provider-payload-secret");
  };
  const first = await h.call(h.request, alice, provider);
  assert.equal(first.body.data?.status, "failed");
  assert.doesNotMatch(JSON.stringify(first), /private-provider-payload/);
  await h.call(h.request, alice, provider);
  assert.equal(calls, 1);
  await h.call({ ...h.request, requestId: randomUUID() }, alice, provider);
  assert.equal(calls, 2);
  assert.deepEqual(h.logs, []);
});

test("twenty reviewed events plus the durable receipt stay within row and transaction bounds", async () => {
  const h = await setup();
  const events = Array.from({ length: 20 }, (_, index) => ({
    ...event,
    title: `Lunch ${index}`,
    description: "x".repeat(500),
  }));
  const batch: CalendarAnalysisResult = {
    reply: "Review all twenty events.",
    questions: [],
    proposals: events.map((value, index) => ({
      ...proposals.proposals[0],
      id: `p${index}`,
      title: value.title,
      description: value.description,
    })),
  };
  assert.equal(
    (await h.call(h.request, alice, async () => batch)).body.data?.status,
    "ready",
  );
  h.db.calls = [];
  const saved = await h.call(h.save(undefined, events));
  assert.equal(saved.body.data?.receipt?.created, 20);
  assert.equal(eventRows(h.db).length, 20);
  for (const row of h.db.rows.values())
    assert.ok(Buffer.byteLength(row.data) <= 32768);
  const operations = new Map<string, number>();
  for (const call of h.db.calls.filter((entry) =>
    ["createRow", "updateRow", "deleteRow"].includes(entry.method),
  ))
    operations.set(
      call.args.transactionId,
      (operations.get(call.args.transactionId) || 0) + 1,
    );
  assert.ok([...operations.values()].every((count) => count <= 100));
});

test("expired proposal records return terminal status without a new provider call; saved receipts remain idempotent", async () => {
  const h = await setup();
  let calls = 0;
  const provider = async () => {
    calls++;
    return structuredClone(proposals);
  };
  await h.call(h.request, alice, provider);
  const row = [...h.db.rows.entries()].find(([key]) =>
    key.startsWith("calendar_imports/"),
  )!;
  const job = JSON.parse(row[1].data);
  job.createdAt = Date.now() - 86400001;
  row[1].data = JSON.stringify(job);
  const expired = await h.call({
    kind: "calendarResult",
    circleId: h.circleId,
    requestId: h.request.requestId,
  });
  assert.equal(expired.body.data?.status, "failed");
  assert.equal(expired.body.data?.proposal, undefined);
  assert.equal((await h.call(h.save())).status, 400);
  assert.equal(
    (await h.call(h.request, alice, provider)).body.data?.status,
    "failed",
  );
  assert.equal(calls, 1);
});
