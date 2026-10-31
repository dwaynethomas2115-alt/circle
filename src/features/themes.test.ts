import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultTheme,
  presetThemes,
  themeFromPrompt,
  validateTheme,
  THEME_PROMPT_MAX_LENGTH,
  wallpaperCircleId,
  wallpaperUrlMatchesPath,
  validateGeneratedWallpaper,
} from "./themes";

test("every bundled theme has an accessible, typed palette", () => {
  assert.equal(presetThemes.length, 5);
  assert.equal(new Set(presetThemes.map((theme) => theme.id)).size, 5);
  for (const theme of presetThemes) {
    assert.equal(validateTheme(theme), true, theme.id);
    assert.equal(theme.source, "preset");
  }
});

test("local prompts choose curated presets without claiming AI generation", () => {
  for (const [prompt, expected] of [
    ["Pink unicorns for Anastasia", "unicorn"],
    ["A classy Vegas trip with emerald and gold", "vegas"],
    ["Our beach house by the ocean", "coast"],
    ["A minimal slate and linen theme", "minimal"],
    ["A peaceful family garden", "garden"],
  ]) {
    const theme = themeFromPrompt(prompt);
    assert.equal(theme.id, expected);
    assert.equal(theme.source, "preset");
    assert.equal(theme.prompt, prompt);
  }
  assert.equal(
    themeFromPrompt("a".repeat(1_500)).prompt.length,
    THEME_PROMPT_MAX_LENGTH,
  );
});

test("theme validation rejects unsafe data and unreadable palettes", () => {
  for (const value of [
    null,
    [],
    { ...defaultTheme, accent: "url(javascript:alert(1))" },
    { ...defaultTheme, accent: "#FFFFFF" },
    { ...defaultTheme, ink: defaultTheme.surface },
    { ...defaultTheme, background: "#101010" },
    { ...defaultTheme, surface: "#333333" },
    { ...defaultTheme, motif: "arbitrary-html" },
    { ...defaultTheme, source: "browser-script" },
    { ...defaultTheme, prompt: "a".repeat(THEME_PROMPT_MAX_LENGTH + 1) },
    { ...defaultTheme, css: "body{display:none}" },
    { ...defaultTheme, label: "" },
    { ...defaultTheme, id: "<script>" },
  ])
    assert.equal(validateTheme(value), false);
  assert.equal(validateTheme({ ...defaultTheme, source: "ai" }), true);
});

test("wallpapers accept only private generated storage paths", () => {
  const circle = "11111111-1111-4111-8111-111111111111";
  const request = "22222222-2222-4222-8222-222222222222";
  const wallpaperPath = `${circle}/${request}.webp`;
  assert.equal(wallpaperCircleId(wallpaperPath), circle);
  assert.equal(
    validateTheme({ ...defaultTheme, source: "ai", wallpaperPath }),
    true,
  );
  assert.equal(validateTheme({ ...defaultTheme, wallpaperPath }), false);
  for (const path of [
    `https://example.test/${wallpaperPath}`,
    `//example.test/${wallpaperPath}`,
    `../${wallpaperPath}`,
    `${wallpaperPath}?token=secret`,
    `${wallpaperPath}\n`,
    `${wallpaperPath}\r\n`,
    `${circle}/../../private.webp`,
    `${circle}/${request}.svg`,
    "javascript:alert(1)",
    "data:image/webp;base64,aA==",
    undefined,
    null,
  ]) {
    assert.equal(wallpaperCircleId(path), undefined);
    assert.equal(
      validateTheme({ ...defaultTheme, source: "ai", wallpaperPath: path }),
      false,
    );
  }
  assert.equal(
    validateTheme({
      ...defaultTheme,
      source: "ai",
      wallpaperPath,
      wallpaperUrl: "https://example.test/private",
    }),
    false,
  );
});

test("Appwrite Circle IDs keep their exact identity in private wallpaper paths", () => {
  const circle = "circle-Anastasia_01";
  const wallpaperPath = `${circle}/22222222-2222-4222-8222-222222222222.webp`;
  assert.equal(wallpaperCircleId(wallpaperPath), circle);
  assert.equal(
    validateGeneratedWallpaper(
      { ...defaultTheme, source: "ai", wallpaperPath },
      circle,
    ),
    true,
  );
  assert.equal(
    validateGeneratedWallpaper(
      { ...defaultTheme, source: "ai", wallpaperPath },
      circle.toLowerCase(),
    ),
    false,
  );
  for (const id of ["a".repeat(129), "a/b", "a.b", "a b", "a%2fb", ""]) {
    assert.equal(
      wallpaperCircleId(`${id}/22222222-2222-4222-8222-222222222222.webp`),
      undefined,
    );
  }
});

test("shared-bucket JPEG wallpapers preserve exact Circle identity and legacy WebP paths", () => {
  const circle = "circle-Anastasia_01";
  const id = "ABCDEF12-3456-4789-ABCD-1234567890AB";
  for (const extension of ["jpg", "JPG", "webp", "WEBP"]) {
    const wallpaperPath = `${circle}/${id}.${extension}`;
    assert.equal(wallpaperCircleId(wallpaperPath), circle);
    assert.equal(
      validateGeneratedWallpaper(
        { ...defaultTheme, source: "ai", wallpaperPath },
        circle,
      ),
      true,
    );
    assert.equal(
      validateGeneratedWallpaper(
        { ...defaultTheme, source: "ai", wallpaperPath },
        circle.toLowerCase(),
      ),
      false,
    );
    for (const invalid of [
      `${wallpaperPath}\n`,
      `${wallpaperPath}\r\n`,
      `${wallpaperPath}?token=private`,
      `${wallpaperPath}/view`,
      `${circle}/${id}.jpeg`,
      `${circle}/${id}.jpg.webp`,
      `${circle}/wp_${id.replace(/-/g, "")}.jpg`,
      `https://example.test/${wallpaperPath}`,
    ]) {
      assert.equal(wallpaperCircleId(invalid), undefined);
    }
  }
});

test("signed wallpaper URLs bind to the exact project, endpoint, format and file namespace", () => {
  const endpoint = "https://fra.cloud.appwrite.io/v1";
  const project = "circle-project";
  const circle = "circle-Anastasia_01";
  const id = "abcdef12-3456-4789-abcd-1234567890ab";
  const jpg = `${circle}/${id}.jpg`;
  const legacy = `${circle}/${id}.webp`;
  const shared = `${endpoint}/storage/buckets/circle-media/files/wp_${id.replace(/-/g, "")}/view?project=${project}&token=private-token`;
  const old = `${endpoint}/storage/buckets/circle-wallpapers/files/${id}/view?project=${project}&token=private-token`;
  const matches = (value: unknown, path: unknown = jpg) =>
    wallpaperUrlMatchesPath(value, path, endpoint, project);
  assert.equal(matches(shared), true);
  assert.equal(matches(old, legacy), true);
  assert.equal(matches(shared, `${circle}/${id.toUpperCase()}.JPG`), true);
  assert.equal(matches(old, `${circle}/${id.toUpperCase()}.WEBP`), true);
  assert.equal(
    wallpaperUrlMatchesPath(shared, jpg, endpoint + "/", project),
    true,
  );
  assert.equal(matches(old), false);
  assert.equal(matches(shared, legacy), false);
  for (const invalid of [
    shared.replace("https:", "http:"),
    shared.replace("fra.cloud.appwrite.io", "evil.example.test"),
    shared.replace("/v1/", "/unrelated/"),
    shared.replace("/v1/", "/extra/v1/"),
    shared.replace("circle-media", "another-bucket"),
    shared.replace(`wp_${id.replace(/-/g, "")}`, id),
    shared.replace(id.replace(/-/g, ""), "11111111111141118111111111111111"),
    shared.replace("/view?", "/download?"),
    shared.replace(`project=${project}`, "project=another-project"),
    shared.replace(`project=${project}&`, ""),
    shared.replace("&token=private-token", ""),
    shared.replace("token=private-token", "token="),
    `${shared}&project=${project}`,
    `${shared}&token=another-token`,
    `${shared}&unexpected=true`,
    `${shared}#fragment`,
    `${shared}#`,
    ` ${shared}`,
    `${shared}\n`,
    shared.replace("https://", "https://someone:password@"),
    shared.replace("/wp_", "/%77p_"),
    null,
    undefined,
  ])
    assert.equal(matches(invalid), false, String(invalid));
  assert.equal(wallpaperUrlMatchesPath(shared, jpg, undefined, project), false);
  assert.equal(
    wallpaperUrlMatchesPath(shared, jpg, endpoint, undefined),
    false,
  );
  assert.equal(
    wallpaperUrlMatchesPath(shared, jpg, "not-an-endpoint", project),
    false,
  );
  assert.equal(
    wallpaperUrlMatchesPath(shared, jpg, endpoint + "?wrong=1", project),
    false,
  );
  assert.equal(matches(shared, `${jpg}\n`), false);
  assert.equal(
    matches(old.replace(id, "11111111-1111-4111-8111-111111111111"), legacy),
    false,
  );
});

test("wallpaper prompts keep combined interests beyond the previous 300 character cap", () => {
  const prompt = `${"Anastasia likes pink and Barbies; Daelin likes tornadoes and volcanoes. ".repeat(8)}`;
  assert.ok(prompt.length > 300 && prompt.length < THEME_PROMPT_MAX_LENGTH);
  assert.equal(validateTheme({ ...defaultTheme, source: "ai", prompt }), true);
});

test("new generations require actual art scoped to the requested Circle", () => {
  const circle = "11111111-1111-4111-8111-111111111111";
  const wallpaperPath = `${circle}/22222222-2222-4222-8222-222222222222.webp`;
  assert.equal(
    validateGeneratedWallpaper(
      { ...defaultTheme, source: "ai", wallpaperPath },
      circle,
    ),
    true,
  );
  assert.equal(
    validateGeneratedWallpaper({ ...defaultTheme, source: "ai" }, circle),
    false,
  );
  assert.equal(
    validateGeneratedWallpaper(
      { ...defaultTheme, source: "ai", wallpaperPath },
      "33333333-3333-4333-8333-333333333333",
    ),
    false,
  );
});

test("generating a preview never mutates the shared presets", () => {
  const before = JSON.stringify(presetThemes);
  const preview = themeFromPrompt("Pink unicorn stars");
  preview.label = "An unsaved draft";
  assert.equal(JSON.stringify(presetThemes), before);
});
