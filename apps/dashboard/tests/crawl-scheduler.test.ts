import assert from "node:assert/strict";
import test from "node:test";
import { isSourceDue } from "../lib/crawl-schedule";

test("sources without a previous run are due", () => {
  assert.equal(isSourceDue(null, 15, new Date("2026-09-28T10:00:00Z")), true);
});

test("scheduler respects the configured interval boundary", () => {
  const now = new Date("2026-09-28T10:15:00Z");
  assert.equal(isSourceDue(new Date("2026-09-28T10:00:01Z"), 15, now), false);
  assert.equal(isSourceDue(new Date("2026-09-28T10:00:00Z"), 15, now), true);
});
