import type { SourceAdapter } from "@media/contracts/social-platforms";
import { isSocialPlatform, normalizeSocialSource } from "../social/platforms";
import { socialSourceName } from "../social/source-name";
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray, isNull, isNotNull, max } from "drizzle-orm";

import {
  crawlerDefinition,
  crawlerVersion,
  crawlRun,
  crawlRunEvent,
  mediaInboxItem,
  mediaSourceSubscription,
  rawArticle,
  sourceAccessRequest,
  source,
} from "@/db/schema";
import type { CrawlRunLiveLog, CrawlRunSummary, SourceStatus, SourcesWorkspace, PlatformSourcesWorkspace } from "@media/contracts/sources";
import { recordAuditEvent } from "@/src/server/audit";
import { cancelActiveSourceRuns } from "@/src/server/crawl-jobs";
import { db } from "@/src/server/database";
import { assertPublicHttpsUrl } from "@/src/server/url-safety";
import { safeArticleLogUrl } from "@/src/server/web-crawler";
import { parseRecipe } from "@/src/server/crawler-recipe";
import type { BuildReport, CrawlerDebugContext } from "@/src/server/crawler-builder";

export async function getPlatformSourcesWorkspace(): Promise<PlatformSourcesWorkspace> {
  const rows = await db.select().from(source).orderBy(source.name);
  const versions = await db.select({ sourceId: crawlerDefinition.sourceId, version: crawlerVersion.version })
    .from(crawlerDefinition).innerJoin(crawlerVersion, eq(crawlerVersion.definitionId, crawlerDefinition.id))
    .where(eq(crawlerVersion.status, "active"));
  const builds = await db.select({ sourceId: crawlerDefinition.sourceId, version: crawlerVersion.version, status: crawlerVersion.status, config: crawlerVersion.config })
    .from(crawlerDefinition).innerJoin(crawlerVersion, eq(crawlerVersion.definitionId, crawlerDefinition.id)).orderBy(desc(crawlerVersion.version));
  const totals = await db.select({ sourceId: rawArticle.sourceId, value: count() }).from(rawArticle).groupBy(rawArticle.sourceId);
  const activeRuns = await db.select({ id: crawlRun.id, sourceId: crawlRun.sourceId, status: crawlRun.status, trigger: crawlRun.trigger, createdAt: crawlRun.createdAt, startedAt: crawlRun.startedAt }).from(crawlRun).where(inArray(crawlRun.status, ["queued", "running"]));
  const runs = await db.select({
    id: crawlRun.id, sourceId: crawlRun.sourceId, sourceName: source.name, status: crawlRun.status,
    trigger: crawlRun.trigger, discoveredCount: crawlRun.discoveredCount, insertedCount: crawlRun.insertedCount,
    duplicateCount: crawlRun.duplicateCount, quarantinedCount: crawlRun.quarantinedCount, failedCount: crawlRun.failedCount,
    errorCode: crawlRun.errorCode, createdAt: crawlRun.createdAt, startedAt: crawlRun.startedAt, finishedAt: crawlRun.finishedAt,
  }).from(crawlRun).innerJoin(source, eq(source.id, crawlRun.sourceId)).orderBy(desc(crawlRun.createdAt)).limit(30);
  return {
    sources: rows.map((row) => ({
      id: row.id, name: socialSourceName(row.name, row.url, row.adapterKey), url: row.url, adapterKey: row.adapterKey as SourceAdapter,
      status: row.status as SourceStatus, enabled: row.enabled, executionBlocked: false,
      scheduleMinutes: row.scheduleMinutes, lastErrorCode: row.lastErrorCode,
      visibleToMedia: row.visibleToMedia, mediaDeliveryEnabled: row.mediaDeliveryEnabled, archivedAt: row.archivedAt?.toISOString() ?? null,
      lastRunAt: row.lastRunAt?.toISOString() ?? null, lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
      articleCount: Number(totals.find((item) => item.sourceId === row.id)?.value ?? 0),
      crawlerVersion: versions.find((item) => item.sourceId === row.id)?.version ?? null,
      activeRunId: activeRuns.find((item) => item.sourceId === row.id)?.id ?? null,
      activeRun: (() => {
        const run = activeRuns.find(item => item.sourceId === row.id);
        return run ? { id: run.id, status: run.status as "queued" | "running", trigger: run.trigger as CrawlRunSummary["trigger"], createdAt: run.createdAt.toISOString(), startedAt: run.startedAt?.toISOString() ?? null } : null;
      })(),
      buildStatus: builds.find((item) => item.sourceId === row.id)?.status ?? null,
      buildMode: (builds.find((item) => item.sourceId === row.id)?.config.mode as "build" | "debug" | undefined) ?? null,
      buildReport: (builds.find((item) => item.sourceId === row.id)?.config.validation as PlatformSourcesWorkspace["sources"][number]["buildReport"]) ?? null,
    })),
    recentRuns: runs.map((row) => ({ ...row, status: row.status as CrawlRunSummary["status"], trigger: row.trigger as CrawlRunSummary["trigger"],
      createdAt: row.createdAt.toISOString(), startedAt: row.startedAt?.toISOString() ?? null, finishedAt: row.finishedAt?.toISOString() ?? null })),
  };
}

export async function getPlatformCrawlRunLiveLog(runId: string): Promise<CrawlRunLiveLog | null> {
  const [run] = await db.select({ id: crawlRun.id, sourceName: source.name, status: crawlRun.status, errorCode: crawlRun.errorCode })
    .from(crawlRun).innerJoin(source, eq(source.id, crawlRun.sourceId)).where(eq(crawlRun.id, runId)).limit(1);
  return run ? readRunLog(run) : null;
}

export async function getSourcesWorkspace(mediaId: string): Promise<SourcesWorkspace> {
  const subscribedRows = await db.select({
    id: source.id, name: source.name, url: source.url, adapterKey: source.adapterKey,
    status: source.status, enabled: source.enabled, scheduleMinutes: source.scheduleMinutes,
    lastRunAt: source.lastRunAt, lastSuccessAt: source.lastSuccessAt, lastErrorCode: source.lastErrorCode,
  }).from(mediaSourceSubscription)
    .innerJoin(source, eq(source.id, mediaSourceSubscription.sourceId))
    .where(and(eq(mediaSourceSubscription.mediaId, mediaId), eq(mediaSourceSubscription.enabled, true), eq(source.mediaDeliveryEnabled, true), isNull(source.archivedAt)))
    .orderBy(source.name);

  const catalogRows = await db.select({ id: source.id, name: source.name, url: source.url, adapterKey: source.adapterKey })
    .from(source).where(and(eq(source.enabled, true), eq(source.visibleToMedia, true), eq(source.mediaDeliveryEnabled, true), isNull(source.archivedAt))).orderBy(source.name);
  const rawCategoryRows = await db.select({ sourceId: rawArticle.sourceId, categories: rawArticle.categories })
    .from(rawArticle).orderBy(desc(rawArticle.ingestedAt)).limit(2_000);
  const categoriesBySource = new Map<string, Set<string>>();
  for (const row of rawCategoryRows) {
    const categories = categoriesBySource.get(row.sourceId) ?? new Set<string>();
    for (const category of row.categories) if (category.trim()) categories.add(category.trim());
    categoriesBySource.set(row.sourceId, categories);
  }
  const subscribedIds = new Set(subscribedRows.map((item) => item.id));
  const articleCounts = await db.select({ sourceId: rawArticle.sourceId, value: count() })
    .from(mediaInboxItem).innerJoin(rawArticle, eq(rawArticle.id, mediaInboxItem.rawArticleId))
    .where(eq(mediaInboxItem.mediaId, mediaId)).groupBy(rawArticle.sourceId);
  const articleCountBySource = new Map(articleCounts.map((item) => [item.sourceId, Number(item.value)]));

  const runRows = await db.select({
    id: crawlRun.id, sourceId: crawlRun.sourceId, sourceName: source.name, status: crawlRun.status,
    trigger: crawlRun.trigger, discoveredCount: crawlRun.discoveredCount, insertedCount: crawlRun.insertedCount,
    duplicateCount: crawlRun.duplicateCount, quarantinedCount: crawlRun.quarantinedCount, failedCount: crawlRun.failedCount,
    errorCode: crawlRun.errorCode, createdAt: crawlRun.createdAt, startedAt: crawlRun.startedAt, finishedAt: crawlRun.finishedAt,
  }).from(crawlRun)
    .innerJoin(source, eq(source.id, crawlRun.sourceId))
    .innerJoin(mediaSourceSubscription, and(eq(mediaSourceSubscription.sourceId, source.id), eq(mediaSourceSubscription.mediaId, mediaId)))
    .where(and(eq(source.mediaDeliveryEnabled, true), isNull(source.archivedAt)))
    .orderBy(desc(crawlRun.createdAt)).limit(8);

  const sources = subscribedRows.map((row) => ({
    ...row, adapterKey: row.adapterKey as SourceAdapter, status: row.status as SourceStatus,
    executionBlocked: false, articleCount: articleCountBySource.get(row.id) ?? 0,
    lastRunAt: row.lastRunAt?.toISOString() ?? null, lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
  }));
  const recentRuns: CrawlRunSummary[] = runRows.map((row) => ({
    ...row, status: row.status as CrawlRunSummary["status"], trigger: row.trigger as CrawlRunSummary["trigger"],
    createdAt: row.createdAt.toISOString(), startedAt: row.startedAt?.toISOString() ?? null, finishedAt: row.finishedAt?.toISOString() ?? null,
  }));
  return {
    sources,
    availableSources: catalogRows.filter((item) => !subscribedIds.has(item.id)).map((item) => ({
      ...item,
      adapterKey: item.adapterKey as SourceAdapter,
      categories: [...(categoriesBySource.get(item.id) ?? new Set<string>())].sort((a, b) => a.localeCompare(b, "fa")),
    })),
    recentRuns,
    stats: {
      total: sources.length,
      healthy: sources.filter((item) => item.status === "active").length,
      failed: sources.filter((item) => item.status === "failed").length,
      articles: sources.reduce((total, item) => total + item.articleCount, 0),
    },
  };
}

export async function getCrawlRunLiveLog(mediaId: string, runId: string): Promise<CrawlRunLiveLog | null> {
  const [run] = await db.select({ id: crawlRun.id, sourceName: source.name, status: crawlRun.status, errorCode: crawlRun.errorCode })
    .from(crawlRun).innerJoin(source, eq(source.id, crawlRun.sourceId))
    .innerJoin(mediaSourceSubscription, and(eq(mediaSourceSubscription.sourceId, source.id), eq(mediaSourceSubscription.mediaId, mediaId)))
    .where(and(eq(crawlRun.id, runId), eq(source.mediaDeliveryEnabled, true), isNull(source.archivedAt))).limit(1);
  if (!run) return null;
  return readRunLog(run);
}

async function readRunLog(run: { id: string; sourceName: string; status: string; errorCode: string | null }): Promise<CrawlRunLiveLog> {
  const events = await db.select({
    id: crawlRunEvent.id, sequence: crawlRunEvent.sequence, stage: crawlRunEvent.stage,
    status: crawlRunEvent.status, level: crawlRunEvent.level, message: crawlRunEvent.message, createdAt: crawlRunEvent.createdAt,
    articleUrl: crawlRunEvent.articleUrl, errorCode: crawlRunEvent.errorCode, durationMs: crawlRunEvent.durationMs,
  }).from(crawlRunEvent).where(eq(crawlRunEvent.runId, run.id)).orderBy(desc(crawlRunEvent.createdAt), desc(crawlRunEvent.id)).limit(1100);
  const [total] = await db.select({ value: count() }).from(crawlRunEvent).where(eq(crawlRunEvent.runId, run.id));
  return {
    runId: run.id, sourceName: run.sourceName, status: run.status as CrawlRunSummary["status"], errorCode: run.errorCode,
    events: events.reverse().map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
    eventCount: Number(total.value),
  };
}

export async function createPlatformSource(input: {
  actorUserId: string; name: string; url: string; scheduleMinutes: number; correlationId: string; adapterKey: SourceAdapter; sourceAccessRequestId?: string;
}, validateUrl = assertPublicHttpsUrl) {
  const sourceUrl = isSocialPlatform(input.adapterKey) ? normalizeSocialSource(input.adapterKey, input.url) : input.url;
  const safeUrl = await validateUrl(sourceUrl);
  const sourceId = `source_${randomUUID()}`;
  const definitionId = `crawler_${randomUUID()}`;
  const versionId = `crawler_version_${randomUUID()}`;
  const runId = `crawl_run_${randomUUID()}`;
  await db.transaction(async (transaction) => {
    await transaction.insert(source).values({ id: sourceId, name: socialSourceName(input.name, safeUrl.toString(), input.adapterKey), url: safeUrl.toString(), adapterKey: input.adapterKey, scheduleMinutes: input.scheduleMinutes, createdBy: input.actorUserId, enabled: false, status: "building" });
    await transaction.insert(crawlerDefinition).values({ id: definitionId, sourceId, adapterKey: input.adapterKey });
    await transaction.insert(crawlerVersion).values({
      id: versionId, definitionId, version: 1, status: "draft",
      config: isSocialPlatform(input.adapterKey)
        ? { platform: input.adapterKey, runtime: "browser", adapterVersion: 1, contractVersion: "2" }
        : input.adapterKey === "rss"
        ? { feedUrl: safeUrl.toString(), contractVersion: "2" }
        : { listingUrl: safeUrl.toString(), contractVersion: "2" },
      createdBy: input.actorUserId,
    });
    await transaction.insert(crawlRun).values({ id: runId, sourceId, crawlerVersionId: versionId, trigger: "build", correlationId: input.correlationId, requestedBy: input.actorUserId });
    if (input.sourceAccessRequestId) {
      const [accessRequest] = await transaction.update(sourceAccessRequest).set({ sourceId, status: "crawler_queued", reviewedBy: input.actorUserId, reviewedAt: new Date() })
        .where(and(eq(sourceAccessRequest.id, input.sourceAccessRequestId), inArray(sourceAccessRequest.status, ["pending", "crawler_failed"]))).returning();
      if (!accessRequest) throw new Error("SOURCE_ACCESS_REQUEST_NOT_PENDING");
      await recordAuditEvent({ mediaId: accessRequest.mediaId, actorUserId: input.actorUserId, action: "source_access_request.crawler_queued", targetType: "source_access_request", targetId: accessRequest.id, correlationId: input.correlationId, metadata: { sourceId } }, transaction);
    }
  });
  await recordAuditEvent({ mediaId: null, actorUserId: input.actorUserId, action: "platform.source.created", targetType: "source", targetId: sourceId, correlationId: input.correlationId, metadata: { adapterKey: input.adapterKey } });
  return { sourceId, runId };
}

export async function enqueueCrawlerBuild(input: { sourceId: string; actorUserId: string; correlationId: string; mode?: "build" | "debug"; sourceAccessRequestId?: string }) {
  return db.transaction(async (transaction) => {
    const [existing] = await transaction.select().from(source).where(and(eq(source.id, input.sourceId), isNull(source.archivedAt))).for("update");
    if (!existing) return null;
    const [open] = await transaction.select({ id: crawlRun.id }).from(crawlRun).where(and(eq(crawlRun.sourceId, input.sourceId), inArray(crawlRun.status, ["queued", "running"])));
    if (open) {
      if (input.sourceAccessRequestId) {
        const [accessRequest] = await transaction.update(sourceAccessRequest).set({ sourceId: input.sourceId, status: "crawler_queued", reviewedBy: input.actorUserId, reviewedAt: new Date() })
          .where(and(eq(sourceAccessRequest.id, input.sourceAccessRequestId), inArray(sourceAccessRequest.status, ["pending", "crawler_failed"]))).returning();
        if (!accessRequest) throw new Error("SOURCE_ACCESS_REQUEST_NOT_PENDING");
        await recordAuditEvent({ mediaId: accessRequest.mediaId, actorUserId: input.actorUserId, action: "source_access_request.crawler_queued", targetType: "source_access_request", targetId: accessRequest.id, correlationId: input.correlationId, metadata: { sourceId: input.sourceId, existingRunId: open.id } }, transaction);
      }
      return { sourceId: input.sourceId, runId: open.id, accepted: false };
    }
    const [definition] = await transaction.select().from(crawlerDefinition).where(eq(crawlerDefinition.sourceId, input.sourceId));
    if (!definition) return null;
    const mode = input.mode ?? "build";
    if (mode === "debug" && existing.adapterKey !== "web") return { sourceId: input.sourceId, runId: null, accepted: false, errorCode: "DEBUG_WEB_ONLY" };
    const [latest] = await transaction.select({ version: max(crawlerVersion.version) }).from(crawlerVersion).where(eq(crawlerVersion.definitionId, definition.id));
    let debugContext: CrawlerDebugContext | undefined;
    let hasActiveVersion = false;
    {
      const versions = await transaction.select().from(crawlerVersion).where(eq(crawlerVersion.definitionId, definition.id)).orderBy(desc(crawlerVersion.version));
      hasActiveVersion = versions.some(version => version.status === "active");
      const previous = versions.find((version) => version.status === "active") ?? versions[0];
      const errors = await transaction.select({ url: crawlRunEvent.articleUrl, errorCode: crawlRunEvent.errorCode, durationMs: max(crawlRunEvent.durationMs) }).from(crawlRunEvent).innerJoin(crawlRun, eq(crawlRun.id, crawlRunEvent.runId)).where(and(eq(crawlRun.sourceId, input.sourceId), previous ? eq(crawlRun.crawlerVersionId, previous.id) : undefined, isNotNull(crawlRunEvent.articleUrl), isNotNull(crawlRunEvent.errorCode), inArray(crawlRunEvent.level, ["warn", "error"]))).groupBy(crawlRunEvent.articleUrl, crawlRunEvent.errorCode).orderBy(desc(max(crawlRunEvent.createdAt))).limit(30);
      let recipe: CrawlerDebugContext["recipe"] = null;
      try { if (previous?.config.recipe) recipe = parseRecipe(previous.config.recipe); } catch { /* Legacy recipes can be rebuilt from page evidence. */ }
      const seenFailures = new Set<string>();
      const knownArticleUrls = [...new Set(versions.slice(0, 10).flatMap(version => {
        const report = version.config.validation as Partial<BuildReport> | undefined;
        return Array.isArray(report?.samples) ? report.samples.flatMap(sample => {
          if (!sample.passed || typeof sample.url !== "string") return [];
          try { const url = new URL(sample.url); return url.origin === new URL(existing.url).origin && !url.username && !url.password ? [safeArticleLogUrl(url.toString())] : []; } catch { return []; }
        }) : [];
      }))].slice(0, 500);
      debugContext = { operation: mode, previousVersionId: previous?.id ?? null, recipe, knownArticleUrls, failures: [...(existing.lastErrorCode && /^[A-Z0-9_]{1,80}$/.test(existing.lastErrorCode) ? [{ url: null, errorCode: existing.lastErrorCode, durationMs: null }] : []), ...errors.filter((error) => error.errorCode && /^[A-Z0-9_]{1,80}$/.test(error.errorCode)).map((error) => {
        let url: string | null = null;
        try { if (error.url) url = safeArticleLogUrl(error.url); } catch { /* Invalid historical addresses are not sent to the model. */ }
        return { url, errorCode: error.errorCode!, durationMs: error.durationMs === null ? null : Number(error.durationMs) };
      })].filter((failure) => {
        const key = `${failure.url}:${failure.errorCode}`;
        if (seenFailures.has(key)) return false;
        seenFailures.add(key);
        return true;
      }).slice(0, 30) };
    }
    const versionId = `crawler_version_${randomUUID()}`;
    const runId = `crawl_run_${randomUUID()}`;
    await transaction.insert(crawlerVersion).values({ id: versionId, definitionId: definition.id, version: (latest.version ?? 0) + 1, status: "draft", config: { contractVersion: "2", mode, ...(debugContext ? { debugContext } : {}) }, createdBy: input.actorUserId });
    await transaction.insert(crawlRun).values({ id: runId, sourceId: input.sourceId, crawlerVersionId: versionId, trigger: mode, correlationId: input.correlationId, requestedBy: input.actorUserId });
    if (mode === "build" && !hasActiveVersion) await transaction.update(source).set({ enabled: false, status: "building", lastErrorCode: null, updatedAt: new Date() }).where(eq(source.id, input.sourceId));
    if (input.sourceAccessRequestId) {
      const [accessRequest] = await transaction.update(sourceAccessRequest).set({ sourceId: input.sourceId, status: "crawler_queued", reviewedBy: input.actorUserId, reviewedAt: new Date() })
        .where(and(eq(sourceAccessRequest.id, input.sourceAccessRequestId), inArray(sourceAccessRequest.status, ["pending", "crawler_failed"]))).returning();
      if (!accessRequest) throw new Error("SOURCE_ACCESS_REQUEST_NOT_PENDING");
      await recordAuditEvent({ mediaId: accessRequest.mediaId, actorUserId: input.actorUserId, action: "source_access_request.crawler_queued", targetType: "source_access_request", targetId: accessRequest.id, correlationId: input.correlationId, metadata: { sourceId: input.sourceId, runId } }, transaction);
    }
    await recordAuditEvent({ mediaId: null, actorUserId: input.actorUserId, action: `platform.crawler.${mode}.queued`, targetType: "source", targetId: input.sourceId, correlationId: input.correlationId }, transaction);
    return { sourceId: input.sourceId, runId, accepted: true };
  });
}

export async function subscribeSource(input: { mediaId: string; sourceId: string; actorUserId: string; correlationId: string }) {
  const [existingSource] = await db.select({ id: source.id }).from(source).where(and(eq(source.id, input.sourceId), eq(source.enabled, true), eq(source.visibleToMedia, true), eq(source.mediaDeliveryEnabled, true), isNull(source.archivedAt))).limit(1);
  if (!existingSource) return null;
  await db.insert(mediaSourceSubscription).values({ id: `subscription_${randomUUID()}`, mediaId: input.mediaId, sourceId: input.sourceId, createdBy: input.actorUserId }).onConflictDoNothing();
  const articles = await db.select({ id: rawArticle.id, status: rawArticle.status }).from(rawArticle).where(eq(rawArticle.sourceId, input.sourceId));
  if (articles.length) await db.insert(mediaInboxItem).values(articles.map((item) => ({ id: `inbox_${randomUUID()}`, mediaId: input.mediaId, rawArticleId: item.id, status: item.status }))).onConflictDoNothing();
  await recordAuditEvent({ mediaId: input.mediaId, actorUserId: input.actorUserId, action: "source.subscribed", targetType: "source", targetId: input.sourceId, correlationId: input.correlationId });
  return { sourceId: input.sourceId };
}

export async function unsubscribeSource(input: { mediaId: string; sourceId: string; actorUserId: string; correlationId: string }) {
  const inboxRows = await db.select({ id: mediaInboxItem.id }).from(mediaInboxItem)
    .innerJoin(rawArticle, eq(rawArticle.id, mediaInboxItem.rawArticleId))
    .where(and(eq(mediaInboxItem.mediaId, input.mediaId), eq(rawArticle.sourceId, input.sourceId)));
  if (inboxRows.length) await db.delete(mediaInboxItem).where(inArray(mediaInboxItem.id, inboxRows.map((item) => item.id)));
  const deleted = await db.delete(mediaSourceSubscription).where(and(eq(mediaSourceSubscription.mediaId, input.mediaId), eq(mediaSourceSubscription.sourceId, input.sourceId))).returning();
  if (!deleted.length) return null;
  await recordAuditEvent({ mediaId: input.mediaId, actorUserId: input.actorUserId, action: "source.unsubscribed", targetType: "source", targetId: input.sourceId, correlationId: input.correlationId });
  return { sourceId: input.sourceId };
}

export async function pausePlatformSource(input: { sourceId: string; actorUserId: string; correlationId: string }) {
  const cancelledRuns = await cancelActiveSourceRuns(input.sourceId);
  const [updated] = await db.update(source).set({ enabled: false, status: "paused", updatedAt: new Date() }).where(and(eq(source.id, input.sourceId), isNull(source.archivedAt))).returning();
  if (!updated) return null;
  await recordAuditEvent({ mediaId: null, actorUserId: input.actorUserId, action: "platform.source.paused", targetType: "source", targetId: input.sourceId, correlationId: input.correlationId, metadata: { cancelledRuns } });
  return { sourceId: input.sourceId, cancelledRuns };
}

export async function resumePlatformSource(input: { sourceId: string; actorUserId: string; correlationId: string }) {
  const versions = await db.select({ status: crawlerVersion.status, config: crawlerVersion.config }).from(crawlerVersion).innerJoin(crawlerDefinition, eq(crawlerDefinition.id, crawlerVersion.definitionId)).where(eq(crawlerDefinition.sourceId, input.sourceId)).orderBy(desc(crawlerVersion.version));
  if (!versions.some(version => version.status === "active")) return null;
  const [updated] = await db.update(source).set({ enabled: true, status: "active", lastErrorCode: null, updatedAt: new Date() }).where(and(eq(source.id, input.sourceId), isNull(source.archivedAt))).returning();
  if (!updated) return null;
  await recordAuditEvent({ mediaId: null, actorUserId: input.actorUserId, action: "platform.source.resumed", targetType: "source", targetId: input.sourceId, correlationId: input.correlationId });
  return { sourceId: input.sourceId };
}

export async function updatePlatformSourceSchedule(input: { sourceId: string; scheduleMinutes: number; actorUserId: string; correlationId: string }) {
  return db.transaction(async (transaction) => {
    const [updated] = await transaction.update(source).set({ scheduleMinutes: input.scheduleMinutes, updatedAt: new Date() })
      .where(and(eq(source.id, input.sourceId), isNull(source.archivedAt))).returning();
    if (!updated) return null;
    await recordAuditEvent({ mediaId: null, actorUserId: input.actorUserId, action: "platform.source.schedule.updated", targetType: "source", targetId: input.sourceId, correlationId: input.correlationId, metadata: { scheduleMinutes: input.scheduleMinutes } }, transaction);
    return { sourceId: updated.id, scheduleMinutes: updated.scheduleMinutes };
  });
}

export async function updatePlatformSourceVisibility(input: { sourceId: string; mode: "public" | "catalog_hidden" | "media_disabled"; actorUserId: string; correlationId: string }) {
  return db.transaction(async (transaction) => {
    const [updated] = await transaction.update(source).set({ visibleToMedia: input.mode === "public", mediaDeliveryEnabled: input.mode !== "media_disabled", updatedAt: new Date() })
      .where(and(eq(source.id, input.sourceId), isNull(source.archivedAt))).returning();
    if (!updated) return null;
    await recordAuditEvent({ actorUserId: input.actorUserId, action: "platform.source.visibility.updated", targetType: "source", targetId: input.sourceId, correlationId: input.correlationId, metadata: { mode: input.mode } }, transaction);
    return { sourceId: updated.id, visibleToMedia: updated.visibleToMedia, mediaDeliveryEnabled: updated.mediaDeliveryEnabled };
  });
}

export async function archivePlatformSource(input: { sourceId: string; actorUserId: string; correlationId: string }) {
  return db.transaction(async (transaction) => {
    const now = new Date();
    const [updated] = await transaction.update(source).set({ enabled: false, status: "paused", archivedAt: now, updatedAt: now })
      .where(and(eq(source.id, input.sourceId), isNull(source.archivedAt))).returning();
    if (!updated) return null;
    const cancelled = await transaction.update(crawlRun).set({ status: "failed", errorCode: "USER_CANCELLED", finishedAt: now })
      .where(and(eq(crawlRun.sourceId, input.sourceId), inArray(crawlRun.status, ["queued", "running"]))).returning();
    await recordAuditEvent({ actorUserId: input.actorUserId, action: "platform.source.archived", targetType: "source", targetId: input.sourceId, correlationId: input.correlationId, metadata: { cancelledRuns: cancelled.length } }, transaction);
    return { sourceId: updated.id, cancelledRuns: cancelled.length };
  });
}

export async function restorePlatformSource(input: { sourceId: string; actorUserId: string; correlationId: string }) {
  return db.transaction(async (transaction) => {
    const [updated] = await transaction.update(source).set({ archivedAt: null, enabled: false, status: "paused", updatedAt: new Date() })
      .where(and(eq(source.id, input.sourceId), isNotNull(source.archivedAt))).returning();
    if (!updated) return null;
    await recordAuditEvent({ actorUserId: input.actorUserId, action: "platform.source.restored", targetType: "source", targetId: input.sourceId, correlationId: input.correlationId }, transaction);
    return { sourceId: updated.id };
  });
}
