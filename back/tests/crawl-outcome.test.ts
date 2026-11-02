import assert from "node:assert/strict";
import test from "node:test";
import { crawlOutcome } from "../src/crawl-outcome";

test("a web run without any extracted news cannot be reported as successful", () => {
  assert.deepEqual(crawlOutcome({ web: true, discovered: 10, extracted: 0, failed: 10 }), { status: "failed", sourceStatus: "failed", errorCode: "ALL_EXTRACTIONS_FAILED" });
  assert.equal(crawlOutcome({ web: true, discovered: 0, extracted: 0, failed: 0 }).errorCode, "NO_ARTICLE_LINKS");
  assert.equal(crawlOutcome({ web: false, discovered: 0, extracted: 0, failed: 0 }).status, "succeeded");
});

test("partial extraction flags the run and degrades the source without discarding valid news", () => {
  assert.deepEqual(crawlOutcome({ web: true, discovered: 188, extracted: 112, failed: 76 }), { status: "succeeded", sourceStatus: "degraded", errorCode: "PARTIAL_EXTRACTION" });
  assert.deepEqual(crawlOutcome({ web: true, discovered: 112, extracted: 112, failed: 0 }), { status: "succeeded", sourceStatus: "active", errorCode: null });
});
