import assert from "node:assert/strict";
import test from "node:test";
import { ThemeGenerationError } from "./theme-errors";

test("daily quota errors preserve the actual reset and do not promise a minute", () => {
  const resetAt = "2026-11-01T12:00:00.000Z";
  const error = new ThemeGenerationError(429, {
    error: "Your daily wallpaper allowance is used. Try again tomorrow.",
    code: "theme_daily_limit",
    retryAfterSeconds: 43_200,
    resetAt,
  });
  assert.ok(
    error.message.startsWith(
      "Your daily wallpaper allowance is used. Try again tomorrow.",
    ),
  );
  assert.match(error.message, /You can generate again after/);
  assert.equal(error.code, "theme_daily_limit");
  assert.equal(error.resetAt, resetAt);
  assert.equal(error.retryAfterSeconds, 43_200);
  assert.match(
    new ThemeGenerationError(429, { code: "theme_daily_limit" }).message,
    /daily/,
  );
  assert.doesNotMatch(
    new ThemeGenerationError(429, { code: "theme_daily_limit" }).message,
    /minute/,
  );
});

test("burst throttling can use Retry-After without claiming a daily quota", () => {
  const error = new ThemeGenerationError(429, {}, "42");
  assert.equal(error.retryAfterSeconds, 42);
  assert.match(error.message, /42 seconds/);
  assert.doesNotMatch(error.message, /daily/);
  const detail = new ThemeGenerationError(429, { code: "theme_in_progress" });
  assert.match(detail.message, /already being generated/);
});

test("configuration and upstream errors stay distinct from allowance errors", () => {
  assert.match(new ThemeGenerationError(401, null).message, /sign-in expired/);
  assert.match(new ThemeGenerationError(404, {}).message, /not deployed/);
  const provider = new ThemeGenerationError(429, {
    code: "provider_rate_limit",
    error:
      "OpenAI is temporarily limiting requests. Your Circle allowance was not used.",
    retryAfterSeconds: -1,
    resetAt: "not-a-date",
  });
  assert.equal(provider.retryAfterSeconds, undefined);
  assert.equal(provider.resetAt, undefined);
  assert.match(provider.message, /allowance was not used/);
});
