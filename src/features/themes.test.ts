import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultTheme,
  presetThemes,
  themeFromPrompt,
  validateTheme,
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
  assert.equal(themeFromPrompt("a".repeat(700)).prompt.length, 300);
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
    { ...defaultTheme, prompt: "a".repeat(301) },
    { ...defaultTheme, css: "body{display:none}" },
    { ...defaultTheme, label: "" },
    { ...defaultTheme, id: "<script>" },
  ])
    assert.equal(validateTheme(value), false);
  assert.equal(validateTheme({ ...defaultTheme, source: "ai" }), true);
});

test("generating a preview never mutates the shared presets", () => {
  const before = JSON.stringify(presetThemes);
  const preview = themeFromPrompt("Pink unicorn stars");
  preview.label = "An unsaved draft";
  assert.equal(JSON.stringify(presetThemes), before);
});
