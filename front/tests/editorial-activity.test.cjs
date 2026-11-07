/* eslint-disable @typescript-eslint/no-require-imports -- The standalone test build emits CommonJS. */
const assert = require("node:assert/strict");
const test = require("node:test");
const { editorActivityState, editorialTime } = require("../.data/component-test-build/front/lib/editorial-activity.js");

test("editor activity distinguishes automatic off, actual queued/running work, paused and waiting for eligible news", () => {
  const editor = { paused: false, archived: false, autoEnabled: false, autoErrorCode: null };
  assert.equal(editorActivityState(editor).label, "خودکار خاموش");
  assert.equal(editorActivityState(editor, { running: 1 }).label, "در حال تحریر");
  assert.equal(editorActivityState(editor, { queued: 2 }).label, "کار در صف دارد");
  editor.paused = true;
  assert.equal(editorActivityState(editor).label, "متوقف");
  editor.paused = false; editor.autoEnabled = true;
  assert.equal(editorActivityState(editor).label, "منتظر خبر منطبق");
  editor.autoErrorCode = "ACCESS_REVOKED";
  assert.equal(editorActivityState(editor).tone, "failed");
  assert.match(editorActivityState(editor).help, /مجوز/);
  assert.equal(editorialTime(null), "هنوز ثبت نشده");
});

test("content review is distinguished from technical failures without hiding active work", () => {
  const editor = { paused: false, archived: false, autoEnabled: true, autoErrorCode: null };
  assert.equal(editorActivityState(editor, { reviewRequired: 3 }).tone, "review_required");
  assert.match(editorActivityState(editor, { reviewRequired: 3 }).help, /بررسی انسانی/);
  assert.equal(editorActivityState(editor, { failed: 1, reviewRequired: 3 }).tone, "failed");
  assert.equal(editorActivityState(editor, { running: 1, reviewRequired: 3 }).tone, "running");
  assert.equal(editorActivityState({ ...editor, paused: true }, { failed: 1 }).tone, "stopped");
});
