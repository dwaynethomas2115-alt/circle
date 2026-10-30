import assert from "node:assert/strict";
import test from "node:test";
import { runCircleExecution, type CircleExecution } from "./appwriteExecution";
import { ThemeGenerationError } from "../features/theme-errors";

const completed = (data: unknown, status = 200): CircleExecution => ({
  $id: "execution-fixture",
  status: "completed",
  responseBody: JSON.stringify(status >= 400 ? data : { data }),
  responseStatusCode: status,
});
const waiting: CircleExecution = {
  $id: "execution-fixture",
  status: "processing",
  responseBody: "",
  responseStatusCode: 0,
};

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

test("AI generation creates one async execution and retries only its status reads", async () => {
  let creates = 0,
    polls = 0,
    clock = 0;
  const service = {
    createExecution: async (input: { async: boolean }) => {
      creates++;
      assert.equal(input.async, true);
      return waiting;
    },
    getExecution: async ({ executionId }: { executionId: string }) => {
      assert.equal(executionId, waiting.$id);
      polls++;
      if (polls === 1) throw new Error("temporary network failure");
      return polls === 2 ? waiting : completed({ wallpaperPath: "fixture" });
    },
  };
  const result = await runCircleExecution(service, {
    functionId: "circle",
    body: { kind: "generateTheme" },
    themeJobKey: "async-retry-fixture",
    now: () => clock,
    pause: async (ms) => {
      clock += ms;
    },
  });
  assert.deepEqual(result, { wallpaperPath: "fixture" });
  assert.equal(creates, 1);
  assert.equal(polls, 3);
});

test("a timed-out prompt resumes the same job instead of starting a paid generation again", async () => {
  let creates = 0,
    polls = 0,
    clock = 0;
  const service = {
    createExecution: async () => {
      creates++;
      return waiting;
    },
    getExecution: async () => {
      polls++;
      return polls === 1 ? waiting : completed({ done: true });
    },
  };
  const options = {
    functionId: "circle",
    body: { kind: "generateTheme" },
    themeJobKey: "resume-fixture",
    now: () => clock,
    pause: async (ms: number) => {
      clock += ms;
    },
    timeoutMs: 2_000,
  };
  await assert.rejects(
    runCircleExecution(service, options),
    (error: unknown) =>
      error instanceof ThemeGenerationError && error.code === "theme_pending",
  );
  assert.deepEqual(await runCircleExecution(service, options), { done: true });
  assert.equal(creates, 1);
  assert.equal(polls, 2);
});

test("a hung status request respects the overall deadline and keeps the job resumable", async () => {
  let creates = 0;
  const service = {
    createExecution: async () => {
      creates++;
      return waiting;
    },
    getExecution: async (): Promise<CircleExecution> => new Promise(() => {}),
  };
  await assert.rejects(
    runCircleExecution(service, {
      functionId: "circle",
      body: { kind: "generateTheme" },
      themeJobKey: "hung-status-fixture",
      timeoutMs: 30,
      pause: async () => {},
    }),
    (error: unknown) =>
      error instanceof ThemeGenerationError && error.code === "theme_pending",
  );
  assert.deepEqual(
    await runCircleExecution(
      { ...service, getExecution: async () => completed({ done: true }) },
      {
        functionId: "circle",
        body: {},
        themeJobKey: "hung-status-fixture",
        pause: async () => {},
      },
    ),
    { done: true },
  );
  assert.equal(creates, 1);
});

test("Appwrite execution responses preserve wallpaper allowance metadata", async () => {
  const resetAt = "2026-11-01T12:00:00.000Z";
  const service = {
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
    getExecution: async () => waiting,
  };
  await assert.rejects(
    runCircleExecution(service, { functionId: "circle", body: {} }),
    (error: unknown) => {
      assert.ok(error instanceof ThemeGenerationError);
      assert.equal(error.code, "theme_daily_limit");
      assert.equal(error.retryAfterSeconds, 3600);
      assert.equal(error.resetAt, resetAt);
      assert.match(error.message, /Daily wallpaper allowance/);
      return true;
    },
  );
});

test("failed and malformed executions do not become successful empty snapshots", async () => {
  for (const execution of [
    { ...waiting, status: "failed" },
    { ...completed(null), responseBody: "[]" },
    { ...completed(null), responseBody: "{}" },
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
