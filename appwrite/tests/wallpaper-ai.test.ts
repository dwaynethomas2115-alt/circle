import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { generateTheme, AIError } from "../function/ai";
import { presetThemes } from "../../src/features/themes";
const { label, accent, background, surface, ink, motif } = presetThemes[0];
const palette = { label, accent, background, surface, ink, motif };
const image = readFileSync(
  new NodeURL("../../assets/photos/avatar-alex.jpg", import.meta.url),
);
const encoded = image.toString("base64");
const json = (
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
function harness({
  paletteValue = palette,
  imageValue = encoded,
  imageStatus = 200,
  errorCode,
  paletteStatus = 200,
  imageHeaders = {},
  failure,
}: {
  paletteValue?: unknown;
  imageValue?: unknown;
  imageStatus?: number;
  errorCode?: string;
  paletteStatus?: number;
  imageHeaders?: Record<string, string>;
  failure?: { stage: "palette" | "image"; response: Response };
} = {}) {
  const calls: {
    url: string;
    body: Record<string, any>;
    options: RequestInit;
  }[] = [];
  const transport: typeof fetch = async (target, options = {}) => {
    const url = String(target),
      body = JSON.parse(String(options.body));
    calls.push({ url, body, options });
    if (
      failure &&
      url.endsWith(
        failure.stage === "palette"
          ? "/chat/completions"
          : "/images/generations",
      )
    )
      return failure.response;
    if (url.endsWith("/chat/completions"))
      return paletteStatus === 200
        ? json({
            choices: [{ message: { content: JSON.stringify(paletteValue) } }],
          })
        : json({ error: { code: errorCode } }, paletteStatus);
    assert.equal(url, "https://api.openai.com/v1/images/generations");
    return imageStatus === 200
      ? json({ data: [{ b64_json: imageValue }] }, 200, imageHeaders)
      : json({ error: { code: errorCode } }, imageStatus, imageHeaders);
  };
  return { calls, transport };
}
test("AI wallpaper combines every requested interest and sends only explicit visual text plus fixed instructions", async () => {
  const h = harness();
  const prompt =
    "Anastasia likes pink and Barbies, and Daelin likes tornadoes and volcanoes";
  const result = await generateTheme(prompt, "server-only-key", h.transport);
  assert.equal(result.theme.source, "ai");
  assert.equal(result.theme.prompt, prompt);
  assert.equal(
    result.theme.wallpaperPath,
    undefined,
    "storage path is added only by authorized server orchestration",
  );
  assert.deepEqual(result.image, image);
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls[0].body.messages[1], {
    role: "user",
    content: prompt,
  });
  assert.equal(h.calls[0].body.messages.length, 2);
  const request = h.calls[1].body;
  assert.equal(request.model, "gpt-image-1");
  assert.equal(request.size, "1536x1024");
  assert.equal(request.output_format, "jpeg");
  assert.equal(request.output_compression, 85);
  assert.equal(request.quality, "medium");
  assert.equal(request.n, 1);
  assert.match(
    request.prompt,
    /ALL requested interests and ALL requested subjects/,
  );
  assert.ok(request.prompt.endsWith(prompt));
  for (const call of h.calls) {
    assert.equal(
      (call.options.headers as Record<string, string>).Authorization,
      "Bearer server-only-key",
    );
    assert.ok(!JSON.stringify(call.body).includes("userId"));
    assert.ok(!JSON.stringify(call.body).includes("circleId"));
  }
});
test("invalid or unreadable palette cannot start an image request", async () => {
  for (const paletteValue of [
    { ...palette, ink: "#FFFFFF" },
    { ...palette, accent: "url(https://evil.test)" },
    { ...palette, motif: "script" },
    { ...palette, extra: "untrusted" },
    null,
  ]) {
    const h = harness({ paletteValue });
    await assert.rejects(
      generateTheme("A colorful garden", "key", h.transport),
      (error: unknown) =>
        error instanceof AIError &&
        error.status === 502 &&
        error.code === "provider_palette",
    );
    assert.equal(h.calls.length, 1);
  }
});
test("invalid base64, JPEG markers, truncated images, and oversized payloads fail before storage", async () => {
  const wrongEnd = Buffer.from(image);
  wrongEnd[wrongEnd.length - 1] = 0;
  const wrongPrefix = Buffer.from(image);
  wrongPrefix[0] = 0;
  for (const imageValue of [
    null,
    "not base64!",
    Buffer.from("<svg>unsafe</svg>").toString("base64"),
    wrongEnd.toString("base64"),
    wrongPrefix.toString("base64"),
    image.subarray(0, 19).toString("base64"),
    Buffer.from("RIFF0123WEBPVP8 image bytes").toString("base64"),
    Buffer.alloc(10_485_761).toString("base64"),
  ]) {
    const h = harness({ imageValue });
    await assert.rejects(
      generateTheme("A colorful garden", "key", h.transport),
      (error: unknown) =>
        error instanceof AIError && error.code === "provider_image",
    );
  }
  const oversized = harness({ imageHeaders: { "Content-Length": "16000001" } });
  await assert.rejects(
    generateTheme("A colorful garden", "key", oversized.transport),
    /too large/,
  );
});
test("OpenAI API billing, capacity, key/model access, and prompt failures have distinct codes", async () => {
  for (const [imageStatus, errorCode, status, code] of [
    [429, "insufficient_quota", 503, "provider_billing"],
    [429, "rate_limit_exceeded", 429, "provider_rate_limit"],
    [403, "permission_denied", 503, "provider_access"],
    [400, "content_policy_violation", 400, "provider_prompt"],
    [503, undefined, 502, "provider_unavailable"],
  ] as const) {
    const h = harness({
      imageStatus,
      errorCode,
      imageHeaders: { "Retry-After": "17" },
    });
    await assert.rejects(
      generateTheme("A colorful garden", "key", h.transport),
      (error: unknown) => {
        assert.ok(error instanceof AIError);
        assert.equal(error.status, status);
        assert.equal(error.code, code);
        if (code === "provider_rate_limit")
          assert.equal(error.retryAfterSeconds, 17);
        if (code === "provider_billing")
          assert.match(error.message, /separate from Circle/);
        return true;
      },
    );
  }
});
test("authentication, model access, and request errors identify the actual OpenAI stage without blaming the prompt", async () => {
  for (const stage of ["palette", "image"] as const) {
    for (const [httpStatus, providerCode, expectedCode] of [
      [401, "invalid_api_key", "provider_authentication"],
      [403, "permission_denied", "provider_access"],
      [404, "model_not_found", "provider_model"],
      [400, "model_not_found", "provider_model"],
      [400, "unsupported_parameter", "provider_request"],
      [422, "invalid_request_error", "provider_request"],
    ] as const) {
      const h = harness({
        failure: {
          stage,
          response: json(
            {
              error: {
                code: providerCode,
                type: "invalid_request_error",
                param: "response_format",
                message: "Raw provider details must not reach the user.",
              },
            },
            httpStatus,
            { "x-request-id": `req_${stage}-fixture` },
          ),
        },
      });
      await assert.rejects(
        generateTheme("A colorful garden", "test-server-key", h.transport),
        (error: unknown) => {
          assert.ok(error instanceof AIError);
          assert.equal(error.status, 503);
          assert.equal(error.code, expectedCode);
          assert.notEqual(error.code, "provider_prompt");
          assert.match(
            error.message,
            stage === "palette" ? /wallpaper color/i : /wallpaper image/i,
          );
          assert.equal(error.diagnostics?.stage, stage);
          assert.equal(error.diagnostics?.httpStatus, httpStatus);
          assert.equal(error.diagnostics?.requestId, `req_${stage}-fixture`);
          assert.doesNotMatch(error.message, /Raw provider details/);
          return true;
        },
      );
      assert.equal(h.calls.length, stage === "palette" ? 1 : 2);
    }
  }
});
test("only explicit moderation failures ask for a different prompt, while billing and rate limits remain distinct at either stage", async () => {
  for (const stage of ["palette", "image"] as const) {
    for (const [httpStatus, providerCode, expectedStatus, expectedCode] of [
      [400, "content_policy_violation", 400, "provider_prompt"],
      [400, "moderation_blocked", 400, "provider_prompt"],
      [400, "invalid_prompt", 400, "provider_prompt"],
      [429, "insufficient_quota", 503, "provider_billing"],
      [400, "billing_hard_limit_reached", 503, "provider_billing"],
      [429, "rate_limit_exceeded", 429, "provider_rate_limit"],
    ] as const) {
      const h = harness({
        failure: {
          stage,
          response: json({ error: { code: providerCode } }, httpStatus, {
            "Retry-After": "17",
          }),
        },
      });
      await assert.rejects(
        generateTheme("A colorful garden", "test-server-key", h.transport),
        (error: unknown) => {
          assert.ok(error instanceof AIError);
          assert.equal(error.status, expectedStatus);
          assert.equal(error.code, expectedCode);
          assert.equal(error.diagnostics?.stage, stage);
          if (expectedCode === "provider_rate_limit")
            assert.equal(error.retryAfterSeconds, 17);
          return true;
        },
      );
      assert.equal(h.calls.length, stage === "palette" ? 1 : 2);
    }
  }
});
test("billing reported through error.type remains billing even when error.code is absent or unknown", async () => {
  for (const stage of ["palette", "image"] as const) {
    for (const detail of [
      { type: "insufficient_quota" },
      { code: null, type: "insufficient_quota" },
      { code: "unknown-provider-code", type: "insufficient_quota" },
    ]) {
      const h = harness({
        failure: {
          stage,
          response: json({ error: detail }, 429, { "Retry-After": "17" }),
        },
      });
      await assert.rejects(
        generateTheme("A colorful garden", "test-server-key", h.transport),
        (error: unknown) => {
          assert.ok(error instanceof AIError);
          assert.equal(error.code, "provider_billing");
          assert.equal(error.status, 503);
          assert.equal(error.retryAfterSeconds, undefined);
          assert.equal(error.diagnostics?.stage, stage);
          assert.equal(error.diagnostics?.providerCode, "insufficient_quota");
          assert.match(error.message, /separate from Circle/);
          assert.doesNotMatch(JSON.stringify(error), /unknown-provider-code/);
          return true;
        },
      );
      assert.equal(h.calls.length, stage === "palette" ? 1 : 2);
    }
  }
});
test("provider diagnostics allow safe request references but never echo raw messages, arbitrary codes, parameters, or secrets", async () => {
  const privateText = "sk-test-never-log-this-private-prompt";
  for (const stage of ["palette", "image"] as const) {
    for (const response of [
      json(
        {
          error: {
            code: privateText,
            type: privateText,
            param: privateText,
            message: privateText,
          },
        },
        400,
        { "x-request-id": privateText },
      ),
      new Response(`<html>${privateText}</html>`, {
        status: 401,
        headers: {
          "Content-Type": "text/html",
          "x-request-id": `req_bad ${privateText}`,
        },
      }),
    ]) {
      const h = harness({ failure: { stage, response } });
      await assert.rejects(
        generateTheme("A colorful garden", privateText, h.transport),
        (error: unknown) => {
          assert.ok(error instanceof AIError);
          assert.equal(error.diagnostics?.stage, stage);
          assert.equal(error.diagnostics?.providerCode, undefined);
          assert.equal(error.diagnostics?.requestId, undefined);
          assert.ok(!JSON.stringify(error).includes(privateText));
          assert.ok(!error.message.includes(privateText));
          return true;
        },
      );
    }
  }
});
test("configured text and image models are preserved and failures never start a fallback model or automatic paid retry", async () => {
  const priorText = process.env.OPENAI_THEME_MODEL,
    priorImage = process.env.OPENAI_THEME_IMAGE_MODEL;
  try {
    process.env.OPENAI_THEME_MODEL = "configured-palette-model";
    process.env.OPENAI_THEME_IMAGE_MODEL = "configured-image-model";
    for (const stage of ["palette", "image"] as const) {
      const h = harness({
        failure: {
          stage,
          response: json({ error: { code: "model_not_found" } }, 404),
        },
      });
      await assert.rejects(
        generateTheme("A colorful garden", "test-server-key", h.transport),
        (error: unknown) =>
          error instanceof AIError && error.code === "provider_model",
      );
      assert.equal(h.calls.length, stage === "palette" ? 1 : 2);
      assert.equal(h.calls[0].body.model, "configured-palette-model");
      if (stage === "image")
        assert.equal(h.calls[1].body.model, "configured-image-model");
    }
  } finally {
    if (priorText === undefined) delete process.env.OPENAI_THEME_MODEL;
    else process.env.OPENAI_THEME_MODEL = priorText;
    if (priorImage === undefined) delete process.env.OPENAI_THEME_IMAGE_MODEL;
    else process.env.OPENAI_THEME_IMAGE_MODEL = priorImage;
  }
});
test("prompt and server image quality validation happen before provider calls", async () => {
  const h = harness();
  for (const prompt of ["  ", "ab", "x".repeat(1001)])
    await assert.rejects(
      generateTheme(prompt, "key", h.transport),
      (error: unknown) => error instanceof AIError && error.status === 400,
    );
  await assert.rejects(
    generateTheme("A colorful garden", "", h.transport),
    (error: unknown) =>
      error instanceof AIError && error.code === "provider_configuration",
  );
  assert.equal(h.calls.length, 0);
  const quality = process.env.OPENAI_THEME_IMAGE_QUALITY;
  try {
    process.env.OPENAI_THEME_IMAGE_QUALITY = "invalid";
    await assert.rejects(
      generateTheme("A colorful garden", "key", h.transport),
      (error: unknown) =>
        error instanceof AIError && error.code === "provider_configuration",
    );
    assert.equal(h.calls.length, 0);
  } finally {
    if (quality === undefined) delete process.env.OPENAI_THEME_IMAGE_QUALITY;
    else process.env.OPENAI_THEME_IMAGE_QUALITY = quality;
  }
});
test("a 1,000 character description is preserved and network failures return safe provider errors", async () => {
  const h = harness();
  const prompt = "x".repeat(1000);
  const result = await generateTheme(prompt, "key", h.transport);
  assert.equal(result.theme.prompt, prompt);
  await assert.rejects(
    generateTheme("A colorful garden", "key", async () => {
      throw new Error("Internal request details should not leak");
    }),
    (error: unknown) =>
      error instanceof AIError &&
      error.code === "provider_unavailable" &&
      !error.message.includes("Internal request"),
  );
});
test("network failures report the interrupted stage without inventing an HTTP status or retrying generation", async () => {
  for (const stage of ["palette", "image"] as const) {
    const h = harness();
    let calls = 0;
    const transport: typeof fetch = async (target, options) => {
      calls++;
      if (
        String(target).endsWith(
          stage === "palette" ? "/chat/completions" : "/images/generations",
        )
      )
        throw new Error("Sensitive transport details must not escape");
      return h.transport(target, options);
    };
    await assert.rejects(
      generateTheme("A colorful garden", "test-server-key", transport),
      (error: unknown) => {
        assert.ok(error instanceof AIError);
        assert.equal(error.code, "provider_unavailable");
        assert.equal(error.diagnostics?.stage, stage);
        assert.equal(error.diagnostics?.httpStatus, undefined);
        assert.doesNotMatch(
          JSON.stringify(error),
          /Sensitive transport details/,
        );
        return true;
      },
    );
    assert.equal(calls, stage === "palette" ? 1 : 2);
  }
});
