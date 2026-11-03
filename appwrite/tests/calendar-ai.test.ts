import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { extractCalendar, finishCalendar } from "../function/calendar";
import { Repository, type Request } from "../function/repository";
import { execute, type Identity } from "../function/domain";
import { FakeDatabase } from "./fake-database";
import { record } from "../function/records";
import {
  calendarProposalSchema,
  eventProblem,
  type CalendarResult,
} from "../../src/features/calendar-ai";
import main, { type Context } from "../function/index";
const alice: Identity = {
  $id: "alice",
  name: "Alice",
  email: "a@example.test",
};
const bob: Identity = { $id: "bob", name: "Bob", email: "b@example.test" };
const input = {
  text: "Dinner on January 3, 2099 from 18:00 to 19:00 UTC",
  timezone: "UTC",
};
const event = {
  title: "Dinner",
  description: "Together",
  location: "Home",
  startsAt: "2099-01-03T18:00:00Z",
  endsAt: "2099-01-03T19:00:00Z",
  warnings: [],
};
async function setup() {
  const db = new FakeDatabase(),
    repo = new Repository(db.api, "circle");
  const call = (request: Request, who = alice) =>
    repo.mutate(who, request, async (s) => execute(s, who, request));
  const created = await call({
    kind: "action",
    action: {
      type: "createCircle",
      input: {
        name: "Plans",
        description: "",
        category: "Friends",
        discoverable: false,
      },
    },
  });
  const circleId = (created.data as { id: string }).id;
  const request: Extract<Request, { kind: "analyzeCalendar" }> = {
    kind: "analyzeCalendar",
    circleId,
    requestId: randomUUID(),
    input,
  };
  const finish = (proposal = { events: [event], warnings: [] }) =>
    repo.mutate(alice, request, async (s) =>
      finishCalendar(s, alice, circleId, request.requestId, proposal),
    );
  const save = {
    kind: "saveCalendar",
    circleId,
    requestId: request.requestId,
    confirmed: true,
    events: [{ ...event, reviewed: true }],
  } as const;
  return {
    db,
    repo,
    call,
    circleId,
    request,
    finish,
    save: { ...save, events: [...save.events] },
  };
}
test("analysis claims once and persists no source; result checks membership and ownership", async () => {
  const h = await setup();
  const first = await h.call(h.request);
  assert.equal((first.data as any).claimed, true);
  assert.equal(
    ((await h.call(h.request)).data as CalendarResult).status,
    "processing",
  );
  assert.ok(!JSON.stringify([...h.db.rows.values()]).includes(input.text));
  await assert.rejects(
    h.call({ ...h.request, input: { ...input, text: "different" } }),
    /different source/,
  );
  await assert.rejects(h.call(h.request, bob), /Join this Circle/);
  await h.finish();
  const result = await h.repo.read(alice, {
    kind: "calendarResult",
    circleId: h.circleId,
    requestId: h.request.requestId,
  });
  assert.equal((result.data as CalendarResult).proposal?.events.length, 1);
  assert.equal(
    (await h.repo.read(alice, { kind: "features" })).store.features.events
      .length,
    0,
  );
});
test("batch save is atomic, review gated, and exact retries return the same IDs", async () => {
  const h = await setup();
  await h.call(h.request);
  await h.finish();
  await assert.rejects(
    h.call({ ...h.save, confirmed: false } as any),
    /Invalid request/,
  );
  await assert.rejects(
    h.call({ ...h.save, events: [{ ...event, reviewed: false }] } as any),
    /Invalid request/,
  );
  await assert.rejects(
    h.call({
      ...h.save,
      events: [
        { ...event, reviewed: true },
        { ...event, title: "Invalid", startsAt: "", reviewed: true },
      ],
    }),
    /full start/,
  );
  assert.equal(
    (await h.repo.read(alice, { kind: "features" })).store.features.events
      .length,
    0,
  );
  const first = await h.call(h.save),
    again = await h.call(h.save);
  assert.deepEqual(first.data, again.data);
  assert.equal(
    (await h.repo.read(alice, { kind: "features" })).store.features.events
      .length,
    1,
  );
  await assert.rejects(
    h.call({
      ...h.save,
      events: [{ ...event, title: "Different", reviewed: true }],
    }),
    /already saved/,
  );
});
test("fresh import duplicate and duplicate proposals are skipped, including manually created matching events", async () => {
  const h = await setup();
  await h.call({
    kind: "featureAction",
    action: {
      type: "createEvent",
      input: {
        circleId: h.circleId,
        title: event.title,
        description: "manual",
        location: event.location,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
      },
    },
  });
  await h.call(h.request);
  await h.finish();
  const saved = await h.call({
    ...h.save,
    events: [...h.save.events, ...h.save.events],
  });
  assert.equal((saved.data as CalendarResult).skipped, 2);
  assert.equal(
    (await h.repo.read(alice, { kind: "features" })).store.features.events
      .length,
    1,
  );
});
test("membership revoked between extraction and saving blocks both result and save", async () => {
  const h = await setup();
  await h.call(h.request);
  await h.finish();
  const key = record("members", `${h.circleId}:${alice.$id}`, {}).id;
  h.db.rows.delete(`members/${key}`);
  await assert.rejects(h.call(h.save), /Join this Circle/);
  await assert.rejects(
    h.repo.read(alice, {
      kind: "calendarResult",
      circleId: h.circleId,
      requestId: h.request.requestId,
    }),
    /Join this Circle/,
  );
});
test("20 events remain below row and transaction limits; concurrent saves produce one batch", async () => {
  const h = await setup();
  await h.call(h.request);
  const events = Array.from({ length: 20 }, (_, i) => ({
    ...event,
    title: `Dinner ${i}`,
    description: "x".repeat(500),
  }));
  await h.finish({ events, warnings: [] });
  h.db.calls = [];
  const save = {
    ...h.save,
    events: events.map((e) => ({ ...e, reviewed: true as const })),
  };
  const results = await Promise.allSettled([h.call(save), h.call(save)]);
  assert.ok(results.some((r) => r.status === "fulfilled"));
  await h.call(save);
  assert.equal(
    (await h.repo.read(alice, { kind: "features" })).store.features.events
      .length,
    20,
  );
  for (const row of h.db.rows.values())
    assert.ok(Buffer.byteLength(row.data) < 32768);
  const byTx = new Map<string, number>();
  for (const c of h.db.calls.filter((c) =>
    ["createRow", "updateRow", "deleteRow"].includes(c.method),
  ))
    byTx.set(c.args.transactionId, (byTx.get(c.args.transactionId) || 0) + 1);
  assert.ok([...byTx.values()].every((n) => n <= 100));
});
test("provider pins Luna, disables storage, requests schema, and passes text as data", async () => {
  let calls = 0;
  const output = await extractCalendar(input, "fake", async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "gpt-6-luna");
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.equal(body.tools, undefined);
    return Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({ events: [event], warnings: [] }),
            },
          ],
        },
      ],
    });
  });
  assert.equal(calls, 1);
  assert.equal(output.events.length, 1);
});
test("image is decoded and validated before provider call; oversized or corrupt bytes never call provider", async () => {
  const bytes = await sharp({
    create: { width: 10, height: 10, channels: 3, background: "white" },
  })
    .jpeg()
    .toBuffer();
  let calls = 0;
  const transport: typeof fetch = async (_u, init) => {
    calls++;
    assert.match(String(init?.body), /data:image\/jpeg;base64/);
    return Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: '{"events":[],"warnings":["No event visible"]}',
            },
          ],
        },
      ],
    });
  };
  await extractCalendar(
    {
      ...input,
      attachment: {
        type: "image",
        name: "photo.jpg",
        base64: bytes.toString("base64"),
      },
    },
    "fake",
    transport,
  );
  for (const base64 of [
    Buffer.from("not image").toString("base64"),
    Buffer.alloc(200000).toString("base64"),
  ])
    await assert.rejects(
      extractCalendar(
        { ...input, attachment: { type: "image", name: "photo.jpg", base64 } },
        "fake",
        transport,
      ),
    );
  assert.equal(calls, 1);
});
test("provider failure, refusal, incomplete and malformed output never create proposals or fallback", async () => {
  for (const response of [
    new Response("secret", { status: 403 }),
    Response.json({ status: "incomplete" }),
    Response.json({ status: "completed", output: [] }),
    Response.json({
      status: "completed",
      output: [
        { type: "message", content: [{ type: "refusal", refusal: "no" }] },
      ],
    }),
  ]) {
    let calls = 0;
    await assert.rejects(
      extractCalendar(input, "fake", async () => {
        calls++;
        return response;
      }),
    );
    assert.equal(calls, 1);
  }
  assert.equal(
    calendarProposalSchema.safeParse({
      events: Array(21).fill(event),
      warnings: [],
    }).success,
    false,
  );
  assert.ok(eventProblem({ ...event, startsAt: "2099-02-30T18:00:00Z" }));
});
test("real handler with mocked provider saves only after explicit reviewed batch; failed analysis stays failed on retry", async () => {
  const h = await setup();
  Object.assign(process.env, {
    APPWRITE_FUNCTION_API_ENDPOINT: "https://test.invalid/v1",
    APPWRITE_FUNCTION_PROJECT_ID: "test",
    CIRCLE_DATABASE_ID: "circle",
    OPENAI_API_KEY: "mock-key",
  });
  let calls = 0;
  const deps = {
    db: h.db.api,
    verifyIdentity: async () => alice,
    extractCalendar: async () => {
      calls++;
      return { events: [event], warnings: [] };
    },
  };
  const call = (body: unknown) =>
    main(
      {
        req: {
          headers: { "x-appwrite-user-jwt": "mock", "x-appwrite-key": "mock" },
          bodyJson: body,
        },
        res: { json: (body, status = 200) => ({ body, status }) },
        error: () => {},
      } as Context,
      deps,
    ) as Promise<any>;
  assert.equal((await call(h.request)).body.data.status, "ready");
  await call(h.request);
  assert.equal(calls, 1);
  assert.equal(
    (await h.repo.read(alice, { kind: "features" })).store.features.events
      .length,
    0,
  );
  assert.equal((await call(h.save)).body.data.status, "saved");
  deps.extractCalendar = async () => {
    calls++;
    throw new Error("private provider payload");
  };
  const other = { ...h.request, requestId: randomUUID() };
  const failure = await call(other);
  assert.equal(failure.body.data.status, "failed");
  assert.ok(!JSON.stringify(failure).includes("private provider payload"));
  await call(other);
  assert.equal(calls, 2);
  delete process.env.OPENAI_API_KEY;
});
