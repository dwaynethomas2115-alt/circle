import assert from "node:assert/strict";
import test from "node:test";
import { runCircleExecution, type CircleExecution } from "./appwriteExecution";
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
