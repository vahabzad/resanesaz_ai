import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import type { runSocialCrawler, validateSocialCrawler } from "../src/social/crawler";

test("social validation and ingestion bypass AI, keep platform scope, deduplicate and respect stop", async () => {
  process.env.DATABASE_DRIVER = "pglite";
  process.env.PGLITE_DATA_DIR = "unused-social-test";
  const client = new PGlite();
  globalThis.__mediaCommandPglite = client;
  const database = drizzle({ client, schema });
  await migrate(database, { migrationsFolder: "./db/migrations" });
  const { createPlatformSource, enqueueCrawlerBuild } = await import("../src/server/sources");
  const { runCrawlWorkerCycle, enqueueSourceRun, cancelActiveSourceRuns } = await import("../src/server/crawl-jobs");
  const { CrawlerOperationError } = await import("../src/social/engine/domain/operations/types/Operations.types");
  const noAi = async () => { throw new Error("AI must never be called for a platform source"); };
  let validations = 0, runs = 0;
  const fixtureArticle = { externalId: "123", url: "https://8.8.8.8/post", title: "خبر آزمون", content: "متن fixture فقط در آزمون", summary: null, contentHtml: null, imageUrl: null, categories: [], tags: [], author: null, publishedAt: "2026-11-03T00:00:00Z" };
  const adapters: { run: typeof runSocialCrawler; validate: typeof validateSocialCrawler } = {
    validate: async platform => {
      validations++;
      const report = { passed: true, checkedAt: new Date().toISOString(), discovered: 1, samples: [{ url: fixtureArticle.url, title: fixtureArticle.title, contentLength: 25, passed: true, errorCode: null }], attempts: 1 };
      return { config: { platform, runtime: "browser", adapterVersion: 1, contractVersion: "2", validation: report, sourceTitle: "عنوان واقعی کانال" }, report };
    },
    run: async () => { runs++; return { articles: [fixtureArticle], discovered: 1, failed: 0 }; },
  };
  try {
    await database.insert(schema.user).values({ id: "admin", name: "Admin", email: "admin@example.test" });
    await database.insert(schema.media).values(["one", "two", "disabled"].map(id => ({ id, name: id, slug: id, createdAt: new Date() })));
    const created = await createPlatformSource({ actorUserId: "admin", correlationId: "social-create", name: "کانال", adapterKey: "telegram", url: "https://telegram.me/example", scheduleMinutes: 15 }, async url => new URL(url));
    const [createdSource] = await database.select().from(schema.source).where(eq(schema.source.id, created.sourceId));
    assert.equal(createdSource.url, "https://t.me/example");
    assert.equal(createdSource.enabled, false);
    assert.equal((await runCrawlWorkerCycle(1, noAi, adapters)).results[0].status, "succeeded");
    assert.equal(validations, 1);
    assert.equal((await database.select().from(schema.source).where(eq(schema.source.id, created.sourceId)))[0].name, "کانال", "explicit administrator name is preserved");
    assert.equal((await database.select().from(schema.rawArticle)).length, 0, "validation samples must not enter Inbox");
    for (const id of ["one", "two", "disabled"]) await database.insert(schema.mediaSourceSubscription).values({ id: `sub-${id}`, mediaId: id, sourceId: created.sourceId, enabled: id !== "disabled" });
    const run = await enqueueSourceRun({ sourceId: created.sourceId, actorUserId: "admin", correlationId: "social-run", trigger: "manual" });
    assert.ok(run);
    assert.equal((await runCrawlWorkerCycle(1, noAi, adapters)).results[0].status, "succeeded");
    assert.equal(runs, 1);
    const articles = await database.select().from(schema.rawArticle);
    assert.equal(articles.length, 1);
    assert.equal(articles[0].sourceId, created.sourceId);
    assert.equal(articles[0].externalId, "123");
    assert.equal((await database.select().from(schema.sourceCategoryMapping)).length, 0, "social news must not wait for website category mapping");
    const { categoryMappingReady } = await import("../src/server/category-mappings");
    const [eligibility] = await database.select({ ready: categoryMappingReady }).from(schema.rawArticle).innerJoin(schema.source, eq(schema.source.id, schema.rawArticle.sourceId));
    assert.equal(eligibility.ready, true);
    assert.equal(articles[0].provenance.runtime, "browser");
    assert.deepEqual((await database.select().from(schema.mediaInboxItem)).map(row => row.mediaId).sort(), ["one", "two"]);
    fixtureArticle.title = "عنوان ویرایش‌شدهٔ همان پست";
    await enqueueSourceRun({ sourceId: created.sourceId, actorUserId: "admin", correlationId: "social-repeat", trigger: "manual" });
    await runCrawlWorkerCycle(1, noAi, adapters);
    assert.equal((await database.select().from(schema.rawArticle)).length, 1);
    assert.equal((await database.select().from(schema.mediaInboxItem)).length, 2);
    const debug = await enqueueCrawlerBuild({ sourceId: created.sourceId, actorUserId: "admin", correlationId: "social-debug", mode: "debug" });
    assert.equal(debug && "errorCode" in debug ? debug.errorCode : null, "DEBUG_WEB_ONLY");
    await enqueueSourceRun({ sourceId: created.sourceId, actorUserId: "admin", correlationId: "social-auth", trigger: "manual" });
    const authResult = await runCrawlWorkerCycle(1, noAi, { ...adapters, run: async () => { throw new CrawlerOperationError("private-cookie-details", "AUTH_REQUIRED"); } });
    assert.equal(authResult.results[0].errorCode, "AUTH_REQUIRED");
    assert.doesNotMatch(JSON.stringify(await database.select().from(schema.crawlRunEvent)), /private-cookie/);
    await enqueueSourceRun({ sourceId: created.sourceId, actorUserId: "admin", correlationId: "social-cancel", trigger: "manual" });
    const stopped = await runCrawlWorkerCycle(1, noAi, { ...adapters, run: async () => {
      await cancelActiveSourceRuns(created.sourceId);
      return { articles: [{ ...fixtureArticle, externalId: "late" }], discovered: 1, failed: 0 };
    } });
    assert.equal(stopped.results[0].errorCode, "USER_CANCELLED");
    assert.equal((await database.select().from(schema.rawArticle)).length, 1, "late extraction after stop must never persist");
    const generic = await createPlatformSource({ actorUserId: "admin", correlationId: "social-name", name: "t.me", adapterKey: "telegram", url: "https://t.me/another", scheduleMinutes: 15 }, async url => new URL(url));
    assert.equal((await database.select().from(schema.source).where(eq(schema.source.id, generic.sourceId)))[0].name, "@another");
    await runCrawlWorkerCycle(1, noAi, adapters);
    assert.equal((await database.select().from(schema.source).where(eq(schema.source.id, generic.sourceId)))[0].name, "عنوان واقعی کانال");
  } finally { await client.close(); }
});
