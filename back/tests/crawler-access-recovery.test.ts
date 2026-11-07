import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";

test("successful rebuild/debug recovers failed reviewed requests and startup repairs historical transitions safely", async () => {
  process.env.DATABASE_DRIVER = "pglite";
  process.env.PGLITE_DATA_DIR = "unused-crawler-recovery-test";
  const client = new PGlite(); globalThis.__mediaCommandPglite = client;
  const database = drizzle({ client, schema });
  await migrate(database, { migrationsFolder: "./db/migrations" });
  const { runCrawlWorkerCycle } = await import("../src/server/crawl-jobs");
  const { enqueueCrawlerBuild } = await import("../src/server/sources");
  const { CrawlerBuildError } = await import("../src/server/crawler-builder");
  const { recoverValidatedSourceAccess } = await import("../src/server/crawler-access-recovery");
  const { mediaOverview } = await import("../src/server/media-overview");
  const recipe = { contractVersion: "2" as const, linkSelector: "a[href]", pathPrefixes: ["/news/"], titleSelectors: ["h1"], bodySelectors: [".body"], removeSelectors: [] };
  const report = { passed: true, checkedAt: new Date().toISOString(), discovered: 1, attempts: 1, samples: [{ url: "https://source.test/news/1", passed: true, title: "Test", contentLength: 100, errorCode: null }] };
  const builder = async () => ({ config: { contractVersion: "2", listingUrl: "https://source.test/", articleUrls: report.samples.map(sample => sample.url), recipe, validation: report }, report });
  const status = async (id: string) => (await database.select().from(schema.sourceAccessRequest).where(eq(schema.sourceAccessRequest.id, id)))[0].status;
  try {
    await database.insert(schema.user).values({ id: "reviewer", name: "Reviewer", email: "reviewer@test.example" });
    const mediaIds = ["owner", "foreign", "queued", "pending", "withdrawn", "rejected", "unreviewed", "unapproved", "disabled", "extension"];
    await database.insert(schema.media).values(mediaIds.map(id => ({ id, name: id, slug: id, createdAt: new Date(), metadata: JSON.stringify({ setupPreferences: { setupCompleted: true } }) })));
    await database.insert(schema.mediaCreationRequest).values(mediaIds.map(mediaId => ({ mediaId, status: mediaId === "unapproved" ? "pending" as const : "approved" as const })));
    for (const mode of ["build", "debug"] as const) {
      const sourceId = `source-${mode}`;
      await database.insert(schema.source).values({ id: sourceId, name: mode, url: `https://${mode}.test/`, adapterKey: "web", enabled: false, status: "building" });
      await database.insert(schema.crawlerDefinition).values({ id: `def-${mode}`, sourceId, adapterKey: "web" });
      await database.insert(schema.crawlerVersion).values({ id: `version-${mode}`, definitionId: `def-${mode}`, version: 1, status: "draft", config: {} });
      await database.insert(schema.crawlRun).values({ id: `run-${mode}`, sourceId, crawlerVersionId: `version-${mode}`, trigger: "build", correlationId: mode, requestedBy: "reviewer" });
      const categories = (await database.select().from(schema.platformCategory)).slice(0, 2).map(item => item.id);
      await database.insert(schema.sourceAccessRequest).values(mediaIds.map(mediaId => ({ id: `${mode}-${mediaId}`, mediaId, sourceId, sourceType: "website", name: mode, url: `https://${mode}.test/`, status: ["pending", "withdrawn", "rejected"].includes(mediaId) ? mediaId : "crawler_queued", kind: mediaId === "extension" ? "category_extension" : "source_access", categoryMode: "selected", categoryIds: [categories[0]], reviewedBy: mediaId === "unreviewed" ? null : "reviewer", reviewedAt: mediaId === "unreviewed" ? null : new Date() })));
      await database.insert(schema.mediaSourceSubscription).values([{ id: `disabled-${mode}`, mediaId: "disabled", sourceId, enabled: false }, { id: `existing-${mode}`, mediaId: "foreign", sourceId, categoryMode: "selected", categoryIds: [categories[1]] }]);
      await runCrawlWorkerCycle(1, async () => { throw new CrawlerBuildError("CRAWLER_VALIDATION_FAILED", { ...report, passed: false }); });
      assert.equal(await status(`${mode}-owner`), "crawler_failed");
      assert.equal(await recoverValidatedSourceAccess(), 0, "a failed validation cannot grant access");
      await database.update(schema.sourceAccessRequest).set({ status: "crawler_queued" }).where(eq(schema.sourceAccessRequest.id, `${mode}-queued`));
      await database.insert(schema.rawArticle).values({ id: `article-${mode}`, sourceId, crawlRunId: `run-${mode}`, title: "Existing ingested article", canonicalUrl: `https://${mode}.test/news/old`, contentHash: mode });
      await enqueueCrawlerBuild({ sourceId, mode, actorUserId: "reviewer", correlationId: `retry-${mode}` });
      // Retrying from the catalog does not move the access request back to queued.
      assert.equal(await status(`${mode}-owner`), "crawler_failed");
      await runCrawlWorkerCycle(1, builder);
      assert.equal(await status(`${mode}-owner`), "access_granted");
      assert.equal(await status(`${mode}-foreign`), "access_granted");
      assert.equal(await status(`${mode}-queued`), "access_granted", "initial queued requests still complete");
      for (const untouched of ["pending", "withdrawn", "rejected"]) assert.equal(await status(`${mode}-${untouched}`), untouched);
      for (const untouched of ["unreviewed", "unapproved", "disabled", "extension"]) assert.equal(await status(`${mode}-${untouched}`), "crawler_failed");
      const subscriptions = (await database.select().from(schema.mediaSourceSubscription)).filter(row => row.sourceId === sourceId);
      assert.deepEqual(subscriptions.find(row => row.mediaId === "owner")?.categoryIds, [categories[0]]);
      assert.deepEqual(subscriptions.find(row => row.mediaId === "foreign")?.categoryIds, [categories[1]], "a later grant keeps its scope");
      assert.equal(subscriptions.find(row => row.mediaId === "disabled")?.enabled, false);
      assert.equal(subscriptions.length, 4);
      const overview = await mediaOverview("owner");
      const card = overview.sources.find(row => row.id === `${mode}-owner`)!;
      assert.equal(card.status, "access_granted"); assert.equal(card.accessGranted, true);
      assert.equal((await database.select().from(schema.rawArticle)).filter(row => row.sourceId === sourceId).length, 1, "validation samples are not ingested");
      const items = (await database.select().from(schema.mediaInboxItem)).filter(row => row.rawArticleId === `article-${mode}`);
      assert.deepEqual(items.map(row => row.mediaId).sort(), ["foreign", "owner", "queued"]);
      // Reproduce the already-deployed bug with a successful active but paused crawler.
      await database.update(schema.sourceAccessRequest).set({ status: "crawler_failed" }).where(eq(schema.sourceAccessRequest.id, `${mode}-owner`));
      await database.update(schema.source).set({ enabled: false, status: "paused" }).where(eq(schema.source.id, sourceId));
      await database.update(schema.source).set({ archivedAt: new Date() }).where(eq(schema.source.id, sourceId));
      assert.equal(await recoverValidatedSourceAccess(), 0, "archived sources cannot be recovered");
      await database.update(schema.source).set({ archivedAt: null, mediaDeliveryEnabled: false }).where(eq(schema.source.id, sourceId));
      assert.equal(await recoverValidatedSourceAccess(), 0, "delivery restrictions are preserved");
      await database.update(schema.source).set({ mediaDeliveryEnabled: true }).where(eq(schema.source.id, sourceId));
      assert.equal(await recoverValidatedSourceAccess(), 1);
      assert.equal(await recoverValidatedSourceAccess(), 0, "recovery is idempotent");
      assert.equal(await status(`${mode}-owner`), "access_granted");
      const [paused] = await database.select().from(schema.source).where(eq(schema.source.id, sourceId));
      assert.equal(paused.status, "paused"); assert.equal(paused.enabled, false);
      assert.equal((await database.select().from(schema.mediaInboxItem)).filter(row => row.rawArticleId === `article-${mode}`).length, 3);
      const audit = (await database.select().from(schema.auditEvent)).filter(row => row.targetId === `${mode}-owner` && row.action === "source_access_request.access_granted_after_crawler");
      assert.equal(audit.length, 2); assert.equal(audit[0].metadata.previousStatus, "crawler_failed");
    }
  } finally { await client.close(); globalThis.__mediaCommandPglite = undefined; }
});
