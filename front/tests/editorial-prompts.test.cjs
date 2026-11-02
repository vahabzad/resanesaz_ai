/* eslint-disable @typescript-eslint/no-require-imports -- Standalone tests consume the compiled module. */
const assert = require("node:assert/strict");
const test = require("node:test");
const { editorialPromptPresets, editorialPromptError } = require("../.data/component-test-build/front/lib/editorial-prompt-presets.js");

test("all suggested styles provide distinct, complete news and social instructions within save limits", () => {
  assert.ok(editorialPromptPresets.length >= 6);
  assert.equal(new Set(editorialPromptPresets.map(preset => preset.id)).size, editorialPromptPresets.length);
  assert.equal(new Set(editorialPromptPresets.map(preset => preset.instructions)).size, editorialPromptPresets.length);
  for (const preset of editorialPromptPresets) {
    assert.ok(preset.title && preset.description);
    assert.equal(editorialPromptError(preset.instructions, preset.socialInstructions), "", preset.id);
  }
});

test("personal prompts cannot silently fall back to defaults when blank, short, or beyond save limits", () => {
  const valid = "پرامپت شخصی با قواعد روشن و دقیق برای بازنویسی خبر";
  assert.equal(editorialPromptError(valid, valid), "");
  for (const instructions of [undefined, "", " ".repeat(30), "x".repeat(19), "x".repeat(10001)]) assert.notEqual(editorialPromptError(instructions, valid), "");
  for (const social of [undefined, "", " ".repeat(30), "x".repeat(19), "x".repeat(5001)]) assert.notEqual(editorialPromptError(valid, social), "");
  assert.equal(editorialPromptError("x".repeat(20), "x".repeat(20)), "");
  assert.equal(editorialPromptError("x".repeat(10000), "x".repeat(5000)), "");
});
