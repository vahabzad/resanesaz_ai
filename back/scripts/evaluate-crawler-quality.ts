// Read-only live evaluation: generates and validates a recipe, without opening
// the product database, activating a version or inserting news/Inbox records.
import { config } from "dotenv";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
config({ path: ".env.local", quiet: true });
const { buildCrawler, CrawlerBuildError } = await import("../src/server/crawler-builder");
if (process.argv[2] === "--runtime") {
  const artifact = JSON.parse(await readFile(resolve(process.argv[3]), "utf8"));
  const { parseRecipe } = await import("../src/server/crawler-recipe");
  const { runWebCrawler } = await import("../src/server/web-crawler");
  const errors: Array<{ url: unknown; code: unknown; diagnostics: unknown }> = [];
  const result = await runWebCrawler(artifact.config.listingUrl, AbortSignal.timeout(600000), async event => {
    if (event.stage === "extraction-diagnostics" || (event.stage === "article" && event.status === "warning")) errors.push({ url: event.articleUrl, code: event.errorCode, diagnostics: event.stage === "extraction-diagnostics" ? event.message : undefined });
  }, parseRecipe(artifact.config.recipe), artifact.config.articleUrls);
  const runtimePath = resolve(".data/crawler-analysis", `runtime-evaluation-${Date.now()}.json`);
  const summary = { discovered: result.discovered, extracted: result.articles.length, failed: result.failed, errors };
  await writeFile(runtimePath, JSON.stringify(summary, null, 2));
  console.info(JSON.stringify({ ...summary, path: runtimePath }));
  process.exitCode = result.failed ? 1 : 0;
} else {
const url = process.argv[2];
if (!url) throw new Error("Pass a public HTTPS source URL.");
const path = resolve(".data/crawler-analysis", `evaluation-${Date.now()}.json`);
try {
  let debug;
  if (process.argv[3] === "--repair") {
    const baseline = JSON.parse(await readFile(resolve(process.argv[4]), "utf8"));
    const runtime = JSON.parse(await readFile(resolve(process.argv[5]), "utf8"));
    const { parseRecipe } = await import("../src/server/crawler-recipe");
    debug = { previousVersionId: "read-only-evaluation", recipe: parseRecipe(baseline.config.recipe), knownArticleUrls: baseline.config.articleUrls, failures: runtime.errors.map((error: { url: string; code: string }) => ({ url: error.url, errorCode: error.code, durationMs: null })) };
  }
  const result = await buildCrawler(url, "web", new AbortController().signal, async event => {
    if (["build-generation", "build-repair"].includes(String(event.stage))) console.info(event.stage, event.message);
  }, undefined, debug);
  await mkdir(resolve(".data/crawler-analysis"), { recursive: true });
  await writeFile(path, JSON.stringify(result, null, 2));
  console.info(JSON.stringify({ passed: result.report.passed, attempts: result.report.attempts, samples: result.report.samples.length, sampling: result.report.sampling, path }));
} catch (error) {
  if (!(error instanceof CrawlerBuildError)) throw error;
  await mkdir(resolve(".data/crawler-analysis"), { recursive: true });
  await writeFile(path, JSON.stringify({ code: error.code, report: error.report }, null, 2));
  console.info(JSON.stringify({ passed: false, code: error.code, terminationReason: error.report?.terminationReason, failures: error.report?.samples.filter(sample => !sample.passed).map(sample => ({ url: sample.url, code: sample.errorCode, issues: sample.diagnostics?.issues })), path }));
  process.exitCode = 1;
}

}
