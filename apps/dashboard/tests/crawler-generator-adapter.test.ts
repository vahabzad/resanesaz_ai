import assert from "node:assert/strict";
import test from "node:test";
import { CrawlerGeneratorError, crawlerGeneratorSiteId, finalNdjsonEvent } from "../lib/crawler-generator-contract";

test("matches CrawlerGenerator site slugs", () => {
  assert.equal(crawlerGeneratorSiteId("https://www.farsnews.ir/showcase"), "farsnews-ir");
  assert.equal(crawlerGeneratorSiteId("https://BBC.com/news"), "bbc-com");
});

test("reads the final CrawlerGenerator NDJSON event", () => {
  const event = finalNdjsonEvent([
    JSON.stringify({ type: "log", entry: { stage: "site.run" } }),
    JSON.stringify({ type: "run_result", discovered: 4, extracted: 4, failed: 0, status: "completed" }),
  ].join("\n"), "run_result");
  assert.equal(event.discovered, 4);
});

test("turns CrawlerGenerator failure events into bounded adapter errors", () => {
  assert.throws(
    () => finalNdjsonEvent(JSON.stringify({ type: "failure", message: "failed" }), "run_result"),
    (error) => error instanceof CrawlerGeneratorError && error.code === "CRAWLER_REMOTE_FAILED",
  );
});
