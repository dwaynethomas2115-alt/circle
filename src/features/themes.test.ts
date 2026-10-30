import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultTheme,
  presetThemes,
  themeFromPrompt,
  validateTheme,
  THEME_PROMPT_MAX_LENGTH,
  wallpaperCircleId,
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
