/** Execute the real Edge handler; Auth/DB/Storage/OpenAI HTTP is mocked. */
import test from "node:test";
import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
const source = stripTypeScriptTypes(
  await readFile(
    new URL("../functions/generate-circle-theme/index.ts", import.meta.url),
    "utf8",
  ),
).replace(/export\s*\{\s*\};?/, "");
const circle = "00000000-0000-0000-0000-000000000001";
const requestId = "00000000-0000-0000-0000-000000000099";
const palette = {
  label: "Pink adventure",
  accent: "#A43E78",
  background: "#FFF5FA",
  surface: "#FFFFFF",
  ink: "#493044",
  motif: "unicorn",
};
const webp = Buffer.from(
  "5249464610000000574542505650382000000000",
  "hex",
).toString("base64");
const json = (value, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
const req = (
  body = {
    circleId: circle,
    prompt: "Pink fashion dolls, tornadoes and volcanoes",
  },
  auth = true,
) =>
  new Request("https://project.test/functions/v1/generate-circle-theme", {
    method: "POST",
    headers: auth ? { Authorization: "Bearer user-token" } : {},
    body: JSON.stringify(body),
  });
function setup({
  role = "owner",
  key = true,
  reserveKind,
  reserveStatus = 200,
  paletteValue = palette,
  openAIStatus = 200,
  imageStatus = 200,
  imageValue = webp,
  providerCode,
  recordStatus = 200,
  recordMode,
  authStatus = 200,
  storageStatus = 200,
  env = {},
} = {}) {
  let handle;
  const calls = [];
  let committed = false;
  let recordAttempts = 0;
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/auth/v1/user")) return json({ id: circle }, authStatus);
    if (url.endsWith("/rpc/circle_role_for")) return json(role);
    if (url.endsWith("/rpc/reserve_theme_wallpaper_generation"))
      return reserveKind
        ? json(
            {
              message: "Limit reached",
              details: JSON.stringify({
                kind: reserveKind,
                retryAfter: reserveKind === "daily" ? 3600 : 32,
                resetAt: "2026-10-31T12:00:00Z",
                limit: 50,
              }),
            },
            400,
          )
        : reserveStatus === 200
          ? json(requestId)
          : json({ message: "Missing function" }, reserveStatus);
    if (url === "https://api.openai.com/v1/chat/completions")
      return openAIStatus === 200
        ? json({
            choices: [{ message: { content: JSON.stringify(paletteValue) } }],
          })
        : json({ error: { code: providerCode } }, openAIStatus);
    if (url === "https://api.openai.com/v1/images/generations")
      return imageStatus === 200
        ? json({ data: [{ b64_json: imageValue }] })
        : json({ error: { code: providerCode } }, imageStatus, {
            "Retry-After": "15",
          });
    if (url.includes("/storage/v1/object/circle-wallpapers"))
      return json({}, options.method === "POST" ? storageStatus : 200);
    if (url.endsWith("/rpc/complete_theme_generation")) {
      recordAttempts++;
      if (recordMode === "lost_response" || recordMode === "unknown") {
        committed = true;
        throw new TypeError("Connection closed after database commit");
      }
      if (recordMode === "retry" && recordAttempts === 1)
        throw new TypeError("Temporary gateway failure");
      if (recordMode === "gateway_after_commit") {
        committed = true;
        return json(null, 503);
      }
      committed = recordStatus === 200;
      return json(null, recordStatus);
    }
    if (url.endsWith("/rpc/is_theme_wallpaper_generation_complete"))
      return recordMode === "unknown" ? json(null, 503) : json(committed);
    if (url.endsWith("/rpc/fail_theme_wallpaper_generation")) return json(null);
    assert.fail(`Unexpected upstream ${url}`);
  };
  runInNewContext(source, {
    Request,
    Response,
    AbortSignal,
    Uint8Array,
    atob,
    crypto: webcrypto,
    fetch: fetcher,
    Deno: {
      env: {
        get: (name) =>
          ({
            SUPABASE_URL: "https://project.test",
            SUPABASE_SERVICE_ROLE_KEY: "server-key",
            OPENAI_API_KEY: key ? "openai-test-key" : undefined,
            ...env,
          })[name],
      },
      serve: (fn) => {
        handle = fn;
      },
    },
  });
  return { handle, calls };
}
const providerCalls = (calls) =>
  calls.filter((c) => c.url.includes("api.openai.com"));
const released = (calls) =>
  calls.some((c) => c.url.endsWith("/rpc/fail_theme_wallpaper_generation"));
test("theme generation rejects missing auth without contacting upstreams", async () => {
  const { handle, calls } = setup();
  assert.equal((await handle(req(undefined, false))).status, 401);
  assert.equal(calls.length, 0);
});
test("invalid expired auth cannot call role lookup, quota, or OpenAI", async () => {
  const { handle, calls } = setup({ authStatus: 401 });
  assert.equal((await handle(req())).status, 401);
  assert.equal(calls.length, 1);
});
test("members and outsiders cannot generate themes or incur AI requests", async () => {
  for (const role of ["member", "moderator", null]) {
    const { handle, calls } = setup({ role });
    assert.equal((await handle(req())).status, 403);
    assert.equal(calls.length, 2);
  }
});
test("missing server key reports configuration without fake AI output", async () => {
  const { handle, calls } = setup({ key: false });
  const response = await handle(req());
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /server-side/);
  assert.equal(providerCalls(calls).length, 0);
});
test("burst, daily, and active-generation limits return distinct actionable errors before provider calls", async () => {
  for (const [kind, code] of [
    ["burst", "theme_burst_limit"],
    ["daily", "theme_daily_limit"],
    ["in_progress", "theme_in_progress"],
  ]) {
    const { handle, calls } = setup({ reserveKind: kind });
    const response = await handle(req());
    const body = await response.json();
    assert.equal(response.status, 429);
    assert.equal(body.code, code);
    assert.equal(
      response.headers.get("Retry-After"),
      String(body.retryAfterSeconds),
    );
    assert.equal(providerCalls(calls).length, 0);
    if (kind === "daily") {
      assert.match(body.error, /24 hours/);
      assert.doesNotMatch(body.error, /minute|seconds/);
      assert.equal(body.resetAt, "2026-10-31T12:00:00Z");
    }
  }
});
test("missing wallpaper migration reports setup rather than a misleading quota error", async () => {
  const { handle, calls } = setup({ reserveStatus: 404 });
  const response = await handle(req());
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /migration/);
  assert.equal(providerCalls(calls).length, 0);
});
test("1,000 character prompts are accepted but oversized prompts are rejected before quota or OpenAI", async () => {
  const valid = setup();
  assert.equal(
    (await valid.handle(req({ circleId: circle, prompt: "x".repeat(1000) })))
      .status,
    200,
  );
  const invalid = setup();
  assert.equal(
    (await invalid.handle(req({ circleId: circle, prompt: "x".repeat(1001) })))
      .status,
    400,
  );
  assert.equal(invalid.calls.length, 0);
});
test("both AI calls receive only explicit visual inspiration and fixed instructions; image includes every requested subject", async () => {
  const { handle, calls } = setup();
  assert.equal((await handle(req())).status, 200);
  const requests = providerCalls(calls);
  assert.equal(requests.length, 2);
  const paletteBody = JSON.parse(requests[0].options.body);
  assert.equal(
    paletteBody.messages[1].content,
    "Pink fashion dolls, tornadoes and volcanoes",
  );
  const imageBody = JSON.parse(requests[1].options.body);
  assert.equal(imageBody.model, "gpt-image-1");
  assert.equal(imageBody.output_format, "webp");
  assert.equal(imageBody.size, "1536x1024");
  assert.match(imageBody.prompt, /ALL requested subjects/);
  assert.match(imageBody.prompt, /Pink fashion dolls, tornadoes and volcanoes/);
  for (const call of requests) {
    assert.ok(!call.options.body.includes(circle));
    assert.equal(call.options.headers.Authorization, "Bearer openai-test-key");
  }
  const reserve = JSON.parse(
    calls.find((c) => c.url.includes("reserve_theme")).options.body,
  );
  assert.equal(reserve.p_user, circle);
  assert.equal(reserve.p_daily_limit, 50);
  assert.equal(reserve.p_burst_limit, 3);
});
test("invalid motifs, CSS, dark or unreadable colors, and extra AI keys fail closed and release reservation", async () => {
  for (const bad of [
    { ...palette, motif: "html" },
    { ...palette, accent: "url(https://bad.test)" },
    { ...palette, ink: "#FFFFFF" },
    { ...palette, background: "#111111", ink: "#FFFFFF" },
    { ...palette, script: "bad" },
  ]) {
    const { handle, calls } = setup({ paletteValue: bad });
    assert.equal((await handle(req())).status, 502);
    assert.equal(providerCalls(calls).length, 1);
    assert.ok(!calls.some((c) => c.url.includes("complete_theme")));
    assert.ok(released(calls));
  }
});
test("successful real image is stored privately and recorded as a server-issued proposal before preview", async () => {
  const { handle, calls } = setup();
  const response = await handle(req());
  assert.equal(response.status, 200);
  const { theme } = await response.json();
  assert.equal(theme.source, "ai");
  assert.match(theme.id, /^[0-9a-f-]{36}$/);
  assert.equal(theme.wallpaperPath, `${circle}/${requestId}.webp`);
  assert.equal(Object.keys(theme).length, 10);
  const uploaded = calls.find(
    (c) => c.url.includes("/storage/") && c.options.method === "POST",
  );
  assert.ok(uploaded.options.body instanceof Uint8Array);
  assert.equal(uploaded.options.headers["Content-Type"], "image/webp");
  assert.equal(uploaded.options.headers.Authorization, "Bearer server-key");
  const recorded = calls.find((c) => c.url.includes("complete_theme"));
  assert.equal(recorded.options.headers.Authorization, "Bearer server-key");
  assert.deepEqual(JSON.parse(recorded.options.body), {
    p_request: requestId,
    p_theme: theme,
  });
  assert.ok(calls.indexOf(recorded) > calls.indexOf(uploaded));
  assert.ok(!released(calls));
  assert.ok(
    !calls.some((c) => c.url.includes("save_circle_theme")),
    "generation does not auto-save",
  );
  assert.ok(!JSON.stringify(theme).includes("server-key"));
});
test("invalid image payloads are not uploaded and do not consume daily allowance", async () => {
  for (const imageValue of [
    "not base64!",
    Buffer.from("<svg>not a WebP</svg>").toString("base64"),
    null,
  ]) {
    const { handle, calls } = setup({ imageValue });
    assert.equal((await handle(req())).status, 502);
    assert.ok(released(calls));
    assert.ok(!calls.some((c) => c.url.includes("/storage/")));
  }
});
test("provider image failure releases reservation; OpenAI billing and capacity errors remain distinct", async () => {
  for (const [imageStatus, providerCode, expectedStatus, code] of [
    [429, "insufficient_quota", 503, "provider_billing"],
    [429, "rate_limit_exceeded", 429, "provider_rate_limit"],
    [403, "permission_denied", 503, "provider_configuration"],
    [400, "content_policy_violation", 400, "provider_prompt"],
    [503, undefined, 502, "provider_unavailable"],
  ]) {
    const { handle, calls } = setup({ imageStatus, providerCode });
    const response = await handle(req());
    assert.equal(response.status, expectedStatus);
    assert.equal((await response.json()).code, code);
    assert.ok(released(calls));
  }
});
test("storage limits are reported separately and permissions revoked after upload trigger orphan cleanup", async () => {
  const storage = setup({ storageStatus: 507 });
  const response = await storage.handle(req());
  assert.equal(response.status, 507);
  assert.equal((await response.json()).code, "storage_limit");
  assert.ok(released(storage.calls));
  const revoked = setup({ recordStatus: 403 });
  assert.equal((await revoked.handle(req())).status, 403);
  assert.ok(
    revoked.calls.some(
      (c) =>
        c.url.endsWith("/storage/v1/object/circle-wallpapers") &&
        c.options.method === "DELETE",
    ),
  );
  assert.ok(released(revoked.calls));
});
test("server limits are bounded and never accepted from the client prompt body", async () => {
  const bad = setup({ env: { THEME_DAILY_LIMIT: "999999" } });
  assert.equal((await bad.handle(req())).status, 502);
  assert.equal(providerCalls(bad.calls).length, 0);
  const configured = setup({
    env: { THEME_DAILY_LIMIT: "75", THEME_BURST_LIMIT: "5" },
  });
  assert.equal(
    (
      await configured.handle(
        req({
          circleId: circle,
          prompt: "A tropical garden",
          dailyLimit: 999999,
        }),
      )
    ).status,
    200,
  );
  const reserve = JSON.parse(
    configured.calls.find((c) => c.url.includes("reserve_theme")).options.body,
  );
  assert.equal(reserve.p_daily_limit, 75);
  assert.equal(reserve.p_burst_limit, 5);
});

test("a committed proposal survives a lost completion response or gateway error without cleanup or duplicate generation", async () => {
  for (const recordMode of ["lost_response", "gateway_after_commit"]) {
    const { handle, calls } = setup({ recordMode });
    const response = await handle(req());
    assert.equal(response.status, 200);
    assert.equal(
      (await response.json()).theme.wallpaperPath,
      `${circle}/${requestId}.webp`,
    );
    assert.equal(providerCalls(calls).length, 2);
    assert.ok(
      calls.some((c) =>
        c.url.endsWith("/rpc/is_theme_wallpaper_generation_complete"),
      ),
    );
    assert.equal(
      calls.filter((c) => c.url.endsWith("/rpc/complete_theme_generation"))
        .length,
      1,
    );
    assert.ok(!calls.some((c) => c.options.method === "DELETE"));
    assert.ok(!released(calls));
  }
});
test("an uncommitted transport failure retries idempotent completion once without a second OpenAI call", async () => {
  const { handle, calls } = setup({ recordMode: "retry" });
  assert.equal((await handle(req())).status, 200);
  const records = calls.filter((c) =>
    c.url.endsWith("/rpc/complete_theme_generation"),
  );
  assert.equal(records.length, 2);
  assert.equal(records[0].options.body, records[1].options.body);
  assert.equal(providerCalls(calls).length, 2);
  assert.ok(!calls.some((c) => c.options.method === "DELETE"));
  assert.ok(!released(calls));
});
test("unknown completion status preserves the private image and avoids falsely promising a refunded allowance", async () => {
  const { handle, calls } = setup({ recordMode: "unknown" });
  const response = await handle(req());
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.code, "theme_completion_unconfirmed");
  assert.match(body.error, /may already count/);
  assert.doesNotMatch(body.error, /won’t use your daily allowance/);
  assert.ok(!calls.some((c) => c.options.method === "DELETE"));
  assert.ok(!released(calls));
  assert.equal(
    calls.filter((c) => c.url.endsWith("/rpc/complete_theme_generation"))
      .length,
    2,
  );
});
