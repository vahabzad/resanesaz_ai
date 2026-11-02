import assert from "node:assert/strict";
import test from "node:test";
import { interpretCodexLoginStatus, publicCodexModel } from "../src/server/codex-status";

test("Codex login probe distinguishes authenticated credentials from verified inference", () => {
  const status = interpretCodexLoginStatus({ output: "Logged in using ChatGPT", exitCode: 0, failed: false });
  assert.equal(status.status, "authenticated");
  assert.equal(status.authenticationMode, "chatgpt");
  assert.equal(status.inferenceVerified, false);
  assert.equal(interpretCodexLoginStatus({ output: "Not logged in", exitCode: 1, failed: true }).status, "disconnected");
  assert.equal(interpretCodexLoginStatus({ output: "Logged in using ChatGPT", exitCode: null, failed: true }).status, "unknown");
});

test("Codex CLI output and credential fragments never enter the public status DTO", () => {
  const marker = "private-key-fragment-for-test";
  const status = interpretCodexLoginStatus({ output: `Logged in using an API key - ${marker}`, exitCode: 0, failed: false });
  assert.equal(status.authenticationMode, "api_key");
  assert.equal(JSON.stringify(status).includes(marker), false);
  const failure = interpretCodexLoginStatus({ output: `Error: ${marker}`, exitCode: 1, failed: true });
  assert.equal(failure.status, "unknown");
  assert.equal(JSON.stringify(failure).includes(marker), false);
});

test("Model status accepts only bounded model identifiers, never config objects or CLI output", () => {
  assert.equal(publicCodexModel("test-model.v1"), "test-model.v1");
  for (const value of [null, { model: "test-model", apiKey: "private-marker" }, "Logged in using ChatGPT", "model\nprivate-marker", "x".repeat(129)]) {
    assert.equal(publicCodexModel(value), null);
  }
});
