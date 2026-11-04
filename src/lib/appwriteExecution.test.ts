import assert from "node:assert/strict";
import test from "node:test";
import {
  CalendarJobError,
  runCircleExecution,
  type CircleExecution,
} from "./appwriteExecution";
import { ThemeGenerationError } from "../features/theme-errors";

const requestId = "b5787232-3bba-456c-873b-f0d54e90bb63";
const body = {
  kind: "generateTheme",
  circleId: "circle-fixture",
  prompt: "Pink unicorns and volcanoes",
};
const completed = (data: unknown, status = 200): CircleExecution => ({
  $id: "execution-fixture",
  status: "completed",
  responseBody: JSON.stringify(status >= 400 ? data : { data }),
  responseStatusCode: status,
});
// Appwrite does not expose responseBody for an asynchronous execution, even
// when it has completed. These doubles deliberately match that SDK contract.
const asyncExecution: CircleExecution = {
  $id: "execution-fixture",
  status: "completed",
  responseBody: "",
  responseStatusCode: 200,
};
function fixture(
  result: () => Promise<CircleExecution> | CircleExecution,
  dispatch: () => Promise<CircleExecution> | CircleExecution = () =>
    asyncExecution,
) {
  const calls: { kind: string; async: boolean; requestId?: string }[] = [];
  let historyReads = 0;
  return {
    calls,
    get historyReads() {
      return historyReads;
    },
    service: {
      createExecution: async (input: { async: boolean; body: string }) => {
        const request = JSON.parse(input.body);
        calls.push({
          kind: request.kind,
          async: input.async,
          requestId: request.requestId,
        });
        if (request.kind === "prepareTheme") {
          assert.equal(input.async, false);
          assert.equal(request.wallpaperFormat, "jpeg");
          assert.equal(request.circleId, body.circleId);
          assert.equal(request.prompt, body.prompt);
          return completed({ requestId });
        }
        assert.equal(request.requestId, requestId);
        if (request.kind === "generateTheme") {
          assert.equal(input.async, true);
          assert.equal(request.wallpaperFormat, "jpeg");
          return dispatch();
        }
        assert.equal(request.kind, "themeResult");
        assert.equal(input.async, false);
        return result();
      },
      getExecution: async () => {
        historyReads++;
        return asyncExecution;
      },
    },
  };
}
const isPending = (cause: unknown) =>
  cause instanceof ThemeGenerationError && cause.code === "theme_pending";

test("ordinary Appwrite requests stay synchronous and parse their result", async () => {
  let creates = 0;
  const service = {
    createExecution: async (input: { async: boolean }) => {
      creates++;
      assert.equal(input.async, false);
      return completed({ value: 1 });
    },
    getExecution: async () => {
      throw new Error("must not poll synchronous requests");
    },
  };
  assert.deepEqual(
    await runCircleExecution(service, {
      functionId: "circle",
      body: { kind: "snapshot" },
    }),
    { value: 1 },
  );
  assert.equal(creates, 1);
});

test("completed async jobs with empty bodies retrieve the saved result synchronously", async () => {
  const theme = { wallpaperPath: "fixture.webp" };
  const h = fixture(() => completed({ status: "completed", theme }));
  assert.deepEqual(
    await runCircleExecution(h.service, {
      functionId: "circle",
      body,
      themeJobKey: "empty-async-body",
    }),
    theme,
  );
  assert.deepEqual(
    h.calls.map((call) => [call.kind, call.async]),
    [
      ["prepareTheme", false],
      ["generateTheme", true],
      ["themeResult", false],
    ],
  );
  assert.equal(h.historyReads, 0);
});

test("result reads retry temporary network, conflict and storage errors without dispatching another worker", async () => {
  let polls = 0,
    clock = 0;
  const h = fixture(() => {
    polls++;
    if (polls === 1) throw new Error("temporary network failure");
    if (polls === 2)
      return completed({ error: "Concurrent change.", code: "conflict" }, 409);
    if (polls === 3)
      return completed({ error: "Temporary storage failure." }, 503);
    return completed({ status: "completed", theme: { done: true } });
  });
  assert.deepEqual(
    await runCircleExecution(h.service, {
      functionId: "circle",
      body,
      themeJobKey: "transient-result-reads",
      now: () => clock,
      pause: async (ms) => {
        clock += ms;
      },
    }),
    { done: true },
  );
  assert.equal(polls, 4);
  assert.equal(
    h.calls.filter((call) => call.kind === "generateTheme").length,
    1,
  );
});

test("timed-out requests resume their reservation instead of preparing or generating again", async () => {
  let polls = 0,
    clock = 0;
  const h = fixture(() =>
    completed(
      ++polls < 3
        ? { status: "pending" }
        : { status: "completed", theme: { done: true } },
    ),
  );
  const options = {
    functionId: "circle",
    body,
    themeJobKey: "resume-prepared-job",
    now: () => clock,
    pause: async (ms: number) => {
      clock += ms;
    },
    timeoutMs: 2_000,
  };
  await assert.rejects(runCircleExecution(h.service, options), isPending);
  assert.deepEqual(await runCircleExecution(h.service, options), {
    done: true,
  });
  assert.equal(h.calls.filter((c) => c.kind === "prepareTheme").length, 1);
  assert.equal(h.calls.filter((c) => c.kind === "generateTheme").length, 1);
  assert.ok(h.calls.every((c) => !c.requestId || c.requestId === requestId));
});

test("a hung saved-result read respects its deadline and keeps the job resumable", async () => {
  let hang = true;
  const h = fixture(() =>
    hang
      ? new Promise<CircleExecution>(() => {})
      : completed({ status: "completed", theme: { done: true } }),
  );
  const options = {
    functionId: "circle",
    body,
    themeJobKey: "hung-result-read",
    timeoutMs: 30,
    pause: async () => {},
  };
  await assert.rejects(runCircleExecution(h.service, options), isPending);
  hang = false;
  assert.deepEqual(await runCircleExecution(h.service, options), {
    done: true,
  });
  assert.equal(h.calls.filter((c) => c.kind === "prepareTheme").length, 1);
  assert.equal(h.calls.filter((c) => c.kind === "generateTheme").length, 1);
});

test("a lost dispatch response retries only saved-result reads until an explicit retry", async () => {
  let clock = 0,
    dispatches = 0;
  const h = fixture(
    () =>
      completed(
        dispatches === 1
          ? { status: "pending" }
          : { status: "completed", theme: { done: true } },
      ),
    () => {
      dispatches++;
      if (dispatches === 1) throw new Error("dispatch response lost");
      return asyncExecution;
    },
  );
  const options = {
    functionId: "circle",
    body,
    themeJobKey: "lost-dispatch-response",
    now: () => clock,
    pause: async (ms: number) => {
      clock += ms;
    },
    timeoutMs: 2_000,
  };
  await assert.rejects(runCircleExecution(h.service, options), isPending);
  assert.equal(dispatches, 1);
  assert.deepEqual(await runCircleExecution(h.service, options), {
    done: true,
  });
  assert.equal(dispatches, 2);
  assert.equal(h.calls.filter((c) => c.kind === "prepareTheme").length, 1);
  assert.ok(
    h.calls
      .filter((c) => c.kind === "generateTheme")
      .every((c) => c.requestId === requestId),
  );
});

test("concurrent requests for the same account and prompt share one job", async () => {
  const h = fixture(() =>
    completed({ status: "completed", theme: { done: true } }),
  );
  const options = {
    functionId: "circle",
    body,
    themeJobKey: "shared-prompt-job",
  };
  const results = await Promise.all([
    runCircleExecution(h.service, options),
    runCircleExecution(h.service, options),
  ]);
  assert.deepEqual(results, [{ done: true }, { done: true }]);
  assert.equal(h.calls.filter((c) => c.kind === "prepareTheme").length, 1);
  assert.equal(h.calls.filter((c) => c.kind === "generateTheme").length, 1);
});

test("old Function preflight errors explain the update before dispatching paid work", async () => {
  let creates = 0;
  await assert.rejects(
    runCircleExecution(
      {
        createExecution: async ({ async: isAsync }) => {
          creates++;
          assert.equal(isAsync, false);
          return completed(
            {
              error:
                "Invalid Circle request. Please check the fields and attachment format.",
            },
            400,
          );
        },
        getExecution: async () => asyncExecution,
      },
      { functionId: "circle", body, themeJobKey: "old-function-version" },
    ),
    /wallpaper server needs an update.*main.js.*180-second/,
  );
  assert.equal(creates, 1);
});

test("saved provider failures retain their message and allowance metadata", async () => {
  const resetAt = "2026-11-01T12:00:00.000Z";
  let reads = 0;
  const h = fixture(() => {
    reads++;
    return completed({
      status: "failed",
      responseStatus: 429,
      error: "Daily wallpaper allowance reached.",
      code: "theme_daily_limit",
      retryAfterSeconds: 3600,
      resetAt,
    });
  });
  await assert.rejects(
    runCircleExecution(h.service, {
      functionId: "circle",
      body,
      themeJobKey: "saved-provider-failure",
    }),
    (cause: unknown) => {
      assert.ok(cause instanceof ThemeGenerationError);
      assert.equal(cause.code, "theme_daily_limit");
      assert.equal(cause.retryAfterSeconds, 3600);
      assert.equal(cause.resetAt, resetAt);
      assert.match(cause.message, /Daily wallpaper allowance/);
      return true;
    },
  );
  assert.equal(reads, 1);
});

test("expired, superseded and unauthorized saved-result reads stop without a new job", async () => {
  for (const status of [400, 401, 403, 404]) {
    let reads = 0;
    const h = fixture(() => {
      reads++;
      return completed(
        {
          error: status === 403 ? "Circle access changed." : "Job unavailable.",
          code: status === 400 ? "theme_request_unavailable" : "forbidden",
        },
        status,
      );
    });
    await assert.rejects(
      runCircleExecution(h.service, {
        functionId: "circle",
        body,
        themeJobKey: `unauthorized-job-${status}`,
      }),
      ThemeGenerationError,
    );
    assert.equal(reads, 1);
    assert.equal(h.calls.filter((c) => c.kind === "generateTheme").length, 1);
  }
});

test("workers stopped before their claim can redispatch the same reservation on explicit retry", async () => {
  for (const status of ["failed", "canceled", "completed"]) {
    let dispatches = 0;
    const stopped = {
      ...asyncExecution,
      status,
      responseStatusCode: status === "completed" ? 409 : 500,
    };
    const h = fixture(
      () =>
        completed(
          dispatches === 1
            ? { status: "pending" }
            : { status: "completed", theme: { recovered: true } },
        ),
      () => (++dispatches === 1 ? stopped : asyncExecution),
    );
    h.service.getExecution = async () => stopped;
    const options = {
      functionId: "circle",
      body,
      themeJobKey: `stopped-worker-${status}`,
    };
    await assert.rejects(
      runCircleExecution(h.service, options),
      /wallpaper job stopped.*180-second timeout.*same prompt/,
    );
    assert.deepEqual(await runCircleExecution(h.service, options), {
      recovered: true,
    });
    assert.equal(h.calls.filter((c) => c.kind === "prepareTheme").length, 1);
    assert.equal(h.calls.filter((c) => c.kind === "generateTheme").length, 2);
    assert.ok(
      h.calls
        .filter((c) => c.kind === "generateTheme")
        .every((c) => c.requestId === requestId),
    );
  }
});

test("a final saved-result read preserves provider errors committed after a pending read", async () => {
  let reads = 0;
  const resetAt = "2026-11-01T12:00:00.000Z";
  const terminal = { ...asyncExecution, responseStatusCode: 429 };
  const h = fixture(
    () =>
      completed(
        ++reads === 1
          ? { status: "pending" }
          : {
              status: "failed",
              responseStatus: 429,
              error: "OpenAI image generation is temporarily at capacity.",
              code: "provider_capacity",
              retryAfterSeconds: 45,
              resetAt,
            },
      ),
    () => terminal,
  );
  h.service.getExecution = async () => terminal;
  await assert.rejects(
    runCircleExecution(h.service, {
      functionId: "circle",
      body,
      themeJobKey: "provider-failure-commit-race",
    }),
    (cause: unknown) => {
      assert.ok(cause instanceof ThemeGenerationError);
      assert.equal(cause.code, "provider_capacity");
      assert.equal(cause.retryAfterSeconds, 45);
      assert.equal(cause.resetAt, resetAt);
      assert.match(cause.message, /OpenAI image generation.*capacity/);
      return true;
    },
  );
  assert.equal(reads, 2);
  assert.equal(h.calls.filter((c) => c.kind === "generateTheme").length, 1);
});

test("a completed preflight cannot dispatch paid work after the request deadline", async () => {
  let clock = 0,
    prepares = 0,
    dispatches = 0;
  const service = {
    createExecution: async (input: { async: boolean; body: string }) => {
      const request = JSON.parse(input.body);
      if (request.kind === "prepareTheme") {
        prepares++;
        clock = 10;
        return completed({ requestId });
      }
      assert.equal(request.requestId, requestId);
      if (request.kind === "generateTheme") {
        dispatches++;
        return asyncExecution;
      }
      return completed({ status: "completed", theme: { resumed: true } });
    },
    getExecution: async () => asyncExecution,
  };
  const options = {
    functionId: "circle",
    body,
    themeJobKey: "expired-before-dispatch",
    now: () => clock,
    timeoutMs: 5,
  };
  await assert.rejects(runCircleExecution(service, options), isPending);
  assert.equal(dispatches, 0);
  assert.deepEqual(await runCircleExecution(service, options), {
    resumed: true,
  });
  assert.equal(prepares, 1);
  assert.equal(dispatches, 1);
});

test("ordinary execution responses preserve wallpaper allowance metadata", async () => {
  const resetAt = "2026-11-01T12:00:00.000Z";
  await assert.rejects(
    runCircleExecution(
      {
        createExecution: async () =>
          completed(
            {
              error: "Daily wallpaper allowance reached.",
              code: "theme_daily_limit",
              retryAfterSeconds: 3600,
              resetAt,
            },
            429,
          ),
        getExecution: async () => asyncExecution,
      },
      { functionId: "circle", body: {} },
    ),
    (cause: unknown) => {
      assert.ok(cause instanceof ThemeGenerationError);
      assert.equal(cause.code, "theme_daily_limit");
      assert.equal(cause.retryAfterSeconds, 3600);
      assert.equal(cause.resetAt, resetAt);
      return true;
    },
  );
});

test("failed and malformed synchronous executions do not become empty successful snapshots", async () => {
  for (const execution of [
    { ...asyncExecution, status: "failed" },
    { ...completed(null), responseBody: "[]" },
    { ...completed(null), responseBody: "{}" },
    asyncExecution,
  ]) {
    await assert.rejects(
      runCircleExecution(
        {
          createExecution: async () => execution,
          getExecution: async () => execution,
        },
        { functionId: "circle", body: {} },
      ),
      /Function/,
    );
  }
});

const calendarBody = {
  kind: "analyzeCalendar",
  circleId: "calendar-fixture",
  requestId,
  input: {
    circleId: "calendar-fixture",
    message: "Picnic on May 11, 2040 at 18:00 until 19:00, America/Chicago",
    history: [],
    referenceDate: "2040-05-01",
    timeZone: "America/Chicago",
  },
};
const calendarProposal = {
  reply: "Review this picnic before saving.",
  questions: [],
  proposals: [
    {
      id: "picnic",
      title: "Circle picnic",
      description: "Bring lunch.",
      location: "Town park",
      startDate: "2040-05-11",
      startTime: "18:00",
      endDate: "2040-05-11",
      endTime: "19:00",
      timeZone: "America/Chicago",
      startOffset: null,
      endOffset: null,
      issues: [],
    },
  ],
};
const calendarEnvelope = (extra: Record<string, unknown> = {}) => ({
  circleId: calendarBody.circleId,
  requestId,
  status: "ready",
  proposal: calendarProposal,
  ...extra,
});
function calendarFixture(
  options: {
    capabilities?: () => CircleExecution | Promise<CircleExecution>;
    dispatch?: () => CircleExecution | Promise<CircleExecution>;
    result?: () => CircleExecution | Promise<CircleExecution>;
  } = {},
) {
  const calls: {
    kind: string;
    async: boolean;
    requestId?: string;
    circleId?: string;
  }[] = [];
  const service = {
    createExecution: async (input: { body: string; async: boolean }) => {
      const request = JSON.parse(input.body);
      calls.push({
        kind: request.kind,
        async: input.async,
        requestId: request.requestId,
        circleId: request.circleId,
      });
      if (request.kind === "calendarCapabilities") {
        assert.equal(input.async, false);
        return options.capabilities
          ? options.capabilities()
          : completed({ model: "gpt-6-luna", enabled: true, version: 2 });
      }
      assert.equal(request.circleId, calendarBody.circleId);
      assert.equal(request.requestId, requestId);
      if (request.kind === "analyzeCalendar") {
        assert.equal(input.async, true);
        assert.deepEqual(request.input, calendarBody.input);
        return options.dispatch ? options.dispatch() : asyncExecution;
      }
      assert.equal(request.kind, "calendarResult");
      assert.equal(input.async, false);
      return options.result ? options.result() : completed(calendarEnvelope());
    },
    getExecution: async () => {
      throw new Error("async execution history/body is not a calendar result");
    },
  };
  return { calls, service };
}
const calendarError = (code: CalendarJobError["code"]) => (cause: unknown) =>
  cause instanceof CalendarJobError && cause.code === code;

test("calendar requires the enabled pinned model and matching review contract before async dispatch", async () => {
  for (const capabilities of [
    completed({ error: "Invalid Circle request." }, 400),
    completed({ model: "another-model", enabled: true, version: 2 }),
    completed({ model: "gpt-6-luna", enabled: false, version: 2 }),
    completed({ model: "gpt-6-luna", enabled: true }),
  ]) {
    const h = calendarFixture({ capabilities: () => capabilities });
    await assert.rejects(
      runCircleExecution(h.service, {
        functionId: "circle",
        body: calendarBody,
      }),
      calendarError("calendar_backend_update"),
    );
    assert.deepEqual(
      h.calls.map((call) => call.kind),
      ["calendarCapabilities"],
    );
  }
});

test("calendar ignores asynchronous bodies and returns only the matching durable result", async () => {
  const h = calendarFixture({
    dispatch: () => ({
      ...asyncExecution,
      responseBody: JSON.stringify({
        data: calendarEnvelope({ circleId: "wrong-circle" }),
      }),
    }),
  });
  const value = await runCircleExecution(h.service, {
    functionId: "circle",
    body: calendarBody,
  });
  assert.deepEqual(value, calendarEnvelope());
  assert.deepEqual(
    h.calls.map((call) => [call.kind, call.async]),
    [
      ["calendarCapabilities", false],
      ["analyzeCalendar", true],
      ["calendarResult", false],
    ],
  );
});

test("lost calendar dispatch replies poll the same durable request without another worker dispatch", async () => {
  let polls = 0,
    clock = 0;
  const h = calendarFixture({
    dispatch: () => {
      throw new TypeError("Dispatch response lost after queueing");
    },
    result: () =>
      completed(
        calendarEnvelope(
          ++polls === 1 ? { status: "processing", proposal: undefined } : {},
        ),
      ),
  });
  assert.deepEqual(
    await runCircleExecution(h.service, {
      functionId: "circle",
      body: calendarBody,
      now: () => clock,
      pause: async (ms) => {
        clock += ms;
      },
    }),
    calendarEnvelope(),
  );
  assert.equal(
    h.calls.filter((call) => call.kind === "analyzeCalendar").length,
    1,
  );
  assert.ok(
    h.calls.every((call) => !call.requestId || call.requestId === requestId),
  );
});

test("calendar retries only temporary result reads, including a worker not yet claimed", async () => {
  let polls = 0,
    clock = 0;
  const statuses = [404, 408, 409, 429, 503];
  const h = calendarFixture({
    result: () => {
      const status = statuses[polls++];
      if (status)
        return completed({ error: "Temporary calendar read." }, status);
      if (polls === statuses.length + 1)
        throw new TypeError("Network interrupted");
      return completed(calendarEnvelope());
    },
  });
  assert.deepEqual(
    await runCircleExecution(h.service, {
      functionId: "circle",
      body: calendarBody,
      now: () => clock,
      pause: async (ms) => {
        clock += ms;
      },
    }),
    calendarEnvelope(),
  );
  assert.equal(polls, 7);
  assert.equal(
    h.calls.filter((call) => call.kind === "analyzeCalendar").length,
    1,
  );
});

test("calendar timeout is resumable with the exact request ID and never invents a new paid claim", async () => {
  let clock = 0,
    polls = 0;
  const claims = new Set<string>();
  const h = calendarFixture({
    dispatch: () => {
      claims.add(requestId);
      return asyncExecution;
    },
    result: () =>
      completed(
        calendarEnvelope(
          ++polls <= 2 ? { status: "processing", proposal: undefined } : {},
        ),
      ),
  });
  const options = {
    functionId: "circle",
    body: calendarBody,
    now: () => clock,
    pause: async (ms: number) => {
      clock += ms;
    },
    timeoutMs: 2000,
  };
  await assert.rejects(
    runCircleExecution(h.service, options),
    calendarError("calendar_pending"),
  );
  assert.deepEqual(
    await runCircleExecution(h.service, options),
    calendarEnvelope(),
  );
  assert.equal(claims.size, 1);
  assert.equal(
    h.calls.filter((call) => call.kind === "analyzeCalendar").length,
    2,
    "explicit retry may redispatch the same claim only",
  );
  assert.ok(
    h.calls.every((call) => !call.requestId || call.requestId === requestId),
  );
});

test("terminal calendar failure is explicit and cannot automatically start another paid request", async () => {
  const h = calendarFixture({
    result: () =>
      completed(
        calendarEnvelope({
          status: "failed",
          proposal: undefined,
          error:
            "The source was unreadable. Start a new analysis to try again.",
        }),
      ),
  });
  await assert.rejects(
    runCircleExecution(h.service, { functionId: "circle", body: calendarBody }),
    calendarError("calendar_terminal"),
  );
  assert.equal(h.calls.length, 3);
});

test("calendar authentication failures stop preflight or result polling immediately", async () => {
  for (const status of [401, 403]) {
    const preflight = calendarFixture({
      capabilities: () =>
        completed({ error: "Membership unavailable." }, status),
    });
    await assert.rejects(
      runCircleExecution(preflight.service, {
        functionId: "circle",
        body: calendarBody,
      }),
    );
    assert.equal(preflight.calls.length, 1);
    const result = calendarFixture({
      result: () => completed({ error: "Membership revoked." }, status),
    });
    await assert.rejects(
      runCircleExecution(result.service, {
        functionId: "circle",
        body: calendarBody,
      }),
    );
    assert.equal(result.calls.length, 3);
  }
});

test("hung calendar preflight, dispatch and result reads all have a real deadline", async () => {
  for (const step of ["capabilities", "dispatch", "result"] as const) {
    const h = calendarFixture({
      [step]: () => new Promise<CircleExecution>(() => {}),
    });
    const started = Date.now();
    await assert.rejects(
      runCircleExecution(h.service, {
        functionId: "circle",
        body: calendarBody,
        timeoutMs: 25,
        pause: async () => {},
      }),
      calendarError("calendar_pending"),
    );
    assert.ok(Date.now() - started < 1000);
  }
});

test("calendar rejects stale Circle/request results and malformed or incomplete proposals", async () => {
  for (const value of [
    calendarEnvelope({ circleId: "another-circle" }),
    calendarEnvelope({ requestId: "78233398-7c82-4a92-b96e-586e708e837d" }),
    calendarEnvelope({
      proposal: { ...calendarProposal, secret: "not-an-event-field" },
    }),
    calendarEnvelope({ proposal: undefined }),
    calendarEnvelope({ status: "unexpected" }),
    calendarEnvelope({ status: "saved", receipt: { ok: false } }),
  ]) {
    const h = calendarFixture({ result: () => completed(value) });
    await assert.rejects(
      runCircleExecution(h.service, {
        functionId: "circle",
        body: calendarBody,
      }),
      calendarError("calendar_backend_update"),
    );
    assert.equal(h.calls.length, 3);
  }
});

test("calendar saved receipts resolve unchanged without exposing an async execution body", async () => {
  const saved = calendarEnvelope({
    status: "saved",
    proposal: undefined,
    receipt: { ok: true, created: 1, skipped: 0, eventIds: ["event-fixture"] },
  });
  const h = calendarFixture({ result: () => completed(saved) });
  assert.deepEqual(
    await runCircleExecution(h.service, {
      functionId: "circle",
      body: calendarBody,
    }),
    JSON.parse(JSON.stringify(saved)),
  );
});

test("calendar requests from separate account services never share source or result state", async () => {
  const first = calendarFixture({
    result: () =>
      completed(
        calendarEnvelope({
          proposal: { ...calendarProposal, reply: "Account A's local source" },
        }),
      ),
  });
  const second = calendarFixture({
    result: () =>
      completed(
        calendarEnvelope({
          proposal: { ...calendarProposal, reply: "Account B's local source" },
        }),
      ),
  });
  const [a, b] = await Promise.all(
    [first, second].map((h) =>
      runCircleExecution<{ proposal: { reply: string } }>(h.service, {
        functionId: "circle",
        body: calendarBody,
      }),
    ),
  );
  assert.equal(a.proposal.reply, "Account A's local source");
  assert.equal(b.proposal.reply, "Account B's local source");
  assert.equal(first.calls.length, 3);
  assert.equal(second.calls.length, 3);
});

test("malformed calendar request IDs and mismatched input Circles fail before dispatch", async () => {
  for (const body of [
    { ...calendarBody, requestId: undefined },
    { ...calendarBody, requestId: "not-a-uuid" },
    {
      ...calendarBody,
      input: { ...calendarBody.input, circleId: "another-circle" },
    },
  ]) {
    const h = calendarFixture();
    await assert.rejects(
      runCircleExecution(h.service, { functionId: "circle", body }),
      calendarError("calendar_backend_update"),
    );
    assert.equal(h.calls.length, 0);
  }
});
