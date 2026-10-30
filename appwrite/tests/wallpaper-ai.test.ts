import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { generateTheme, AIError } from "../function/ai";
import { presetThemes } from "../../src/features/themes";
const { label, accent, background, surface, ink, motif } = presetThemes[0];
const palette = { label, accent, background, surface, ink, motif };
const image = Buffer.alloc(24);
image.write("RIFF", 0);
image.writeUInt32LE(image.length - 8, 4);
image.write("WEBP", 8);
image.write("VP8 ", 12);
image.writeUInt32LE(4, 16);
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
}: {
  paletteValue?: unknown;
  imageValue?: unknown;
  imageStatus?: number;
  errorCode?: string;
  paletteStatus?: number;
  imageHeaders?: Record<string, string>;
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
  assert.equal(request.output_format, "webp");
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
test("invalid base64, WebP headers, declared length, and oversized image payloads fail before storage", async () => {
  const wrongLength = Buffer.from(image);
  wrongLength.writeUInt32LE(100, 4);
  for (const imageValue of [
    null,
    "not base64!",
    Buffer.from("<svg>unsafe</svg>").toString("base64"),
    wrongLength.toString("base64"),
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
    [403, "permission_denied", 503, "provider_configuration"],
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
