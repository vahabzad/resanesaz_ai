import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { and, count, desc, eq } from "drizzle-orm";
import {
  crawlerDefinition,
  crawlerVersion,
  crawlRun,
  rawArticle,
  source,
} from "@/db/schema";
import type { CrawlRunSummary, SourceStatus, SourcesWorkspace } from "@/lib/contracts/sources";
import { recordAuditEvent } from "@/lib/server/audit";
import { db } from "@/lib/server/database";
import { parseRssFeed } from "@/lib/server/rss-adapter";
import { assertPublicHttpsUrl, fetchPublicXml, UnsafeSourceUrlError } from "@/lib/server/url-safety";

type CreateSourceInput = {
  mediaId: string;
  actorUserId: string;
  name: string;
  url: string;
  scheduleMinutes: number;
  correlationId: string;
};

export async function getSourcesWorkspace(mediaId: string): Promise<SourcesWorkspace> {
  const sourceRows = await db
    .select({
      id: source.id,
      name: source.name,
      url: source.url,
      adapterKey: source.adapterKey,
      status: source.status,
      enabled: source.enabled,
      scheduleMinutes: source.scheduleMinutes,
      lastRunAt: source.lastRunAt,
      lastSuccessAt: source.lastSuccessAt,
      lastErrorCode: source.lastErrorCode,
    })
    .from(source)
    .where(eq(source.mediaId, mediaId))
    .orderBy(source.name);

  const articleCounts = await db
    .select({ sourceId: rawArticle.sourceId, value: count() })
    .from(rawArticle)
    .where(eq(rawArticle.mediaId, mediaId))
    .groupBy(rawArticle.sourceId);
  const articleCountBySource = new Map(articleCounts.map((item) => [item.sourceId, Number(item.value)]));

  const runRows = await db
    .select({
      id: crawlRun.id,
      sourceId: crawlRun.sourceId,
      sourceName: source.name,
      status: crawlRun.status,
      discoveredCount: crawlRun.discoveredCount,
      insertedCount: crawlRun.insertedCount,
      duplicateCount: crawlRun.duplicateCount,
      quarantinedCount: crawlRun.quarantinedCount,
      errorCode: crawlRun.errorCode,
      createdAt: crawlRun.createdAt,
      finishedAt: crawlRun.finishedAt,
    })
    .from(crawlRun)
    .innerJoin(source, and(eq(source.id, crawlRun.sourceId), eq(source.mediaId, crawlRun.mediaId)))
    .where(eq(crawlRun.mediaId, mediaId))
    .orderBy(desc(crawlRun.createdAt))
    .limit(8);

  const sources = sourceRows.map((row) => ({
    ...row,
    adapterKey: "rss" as const,
    status: row.status as SourceStatus,
    articleCount: articleCountBySource.get(row.id) ?? 0,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
  }));

  const recentRuns: CrawlRunSummary[] = runRows.map((row) => ({
    ...row,
    status: row.status as CrawlRunSummary["status"],
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  }));

  return {
    sources,
    recentRuns,
    stats: {
      total: sources.length,
      healthy: sources.filter((item) => item.status === "active").length,
      failed: sources.filter((item) => item.status === "failed").length,
      articles: sources.reduce((total, item) => total + item.articleCount, 0),
    },
  };
}

export async function createRssSource(input: CreateSourceInput) {
  const safeUrl = await assertPublicHttpsUrl(input.url);
  const sourceId = `source_${randomUUID()}`;
  const definitionId = `crawler_${randomUUID()}`;

  await db.transaction(async (transaction) => {
    await transaction.insert(source).values({
      id: sourceId,
      mediaId: input.mediaId,
      name: input.name,
      url: safeUrl.toString(),
      adapterKey: "rss",
      scheduleMinutes: input.scheduleMinutes,
      createdBy: input.actorUserId,
    });
    await transaction.insert(crawlerDefinition).values({
      id: definitionId,
      mediaId: input.mediaId,
      sourceId,
      adapterKey: "rss",
    });
    await transaction.insert(crawlerVersion).values({
      id: `crawler_version_${randomUUID()}`,
      mediaId: input.mediaId,
      definitionId,
      version: 1,
      status: "active",
      config: { feedUrl: safeUrl.toString(), contractVersion: "1" },
      createdBy: input.actorUserId,
    });
  });

  await recordAuditEvent({
    mediaId: input.mediaId,
    actorUserId: input.actorUserId,
    action: "source.created",
    targetType: "source",
    targetId: sourceId,
    correlationId: input.correlationId,
    metadata: { adapterKey: "rss" },
  });

  return sourceId;
}

function runErrorCode(error: unknown) {
  if (error instanceof UnsafeSourceUrlError) return "UNSAFE_SOURCE_URL";
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "UPSTREAM_TIMEOUT";
  if (error instanceof Error && /^(UPSTREAM_\d{3}|RESPONSE_TOO_LARGE|REDIRECT_LIMIT|EMPTY_RESPONSE)$/.test(error.message)) return error.message;
  return "ADAPTER_FAILED";
}

export async function executeRssSource(input: {
  mediaId: string;
  sourceId: string;
  actorUserId: string;
  correlationId: string;
}) {
  const [configuration] = await db
    .select({
      sourceId: source.id,
      url: source.url,
      enabled: source.enabled,
      versionId: crawlerVersion.id,
    })
    .from(source)
    .innerJoin(crawlerDefinition, and(eq(crawlerDefinition.sourceId, source.id), eq(crawlerDefinition.mediaId, source.mediaId)))
    .innerJoin(crawlerVersion, and(eq(crawlerVersion.definitionId, crawlerDefinition.id), eq(crawlerVersion.mediaId, source.mediaId), eq(crawlerVersion.status, "active")))
    .where(and(eq(source.id, input.sourceId), eq(source.mediaId, input.mediaId)))
    .limit(1);

  if (!configuration || !configuration.enabled) return null;

  const runId = `crawl_run_${randomUUID()}`;
  const startedAt = new Date();
  await db.insert(crawlRun).values({
    id: runId,
    mediaId: input.mediaId,
    sourceId: input.sourceId,
    crawlerVersionId: configuration.versionId,
    status: "running",
    trigger: "manual",
    correlationId: input.correlationId,
    requestedBy: input.actorUserId,
    startedAt,
  });

  try {
    const { body, finalUrl } = await fetchPublicXml(configuration.url);
    const items = parseRssFeed(body);
    let insertedCount = 0;
    let duplicateCount = 0;
    let quarantinedCount = 0;

    for (const item of items) {
      let status = "new";
      let quarantineReason: string | null = null;
      try {
        await assertPublicHttpsUrl(item.canonicalUrl);
      } catch {
        status = "quarantined";
        quarantineReason = "UNSAFE_ARTICLE_URL";
        quarantinedCount += 1;
      }

      const contentHash = createHash("sha256").update(`${item.canonicalUrl}\n${item.title}`).digest("hex");
      const inserted = await db.insert(rawArticle).values({
        id: `raw_${randomUUID()}`,
        mediaId: input.mediaId,
        sourceId: input.sourceId,
        crawlRunId: runId,
        externalId: item.externalId,
        canonicalUrl: item.canonicalUrl,
        title: item.title,
        summary: item.summary,
        publishedAt: item.publishedAt,
        contentHash,
        status,
        quarantineReason,
        provenance: { adapterKey: "rss", feedUrl: finalUrl, contractVersion: "1" },
      }).onConflictDoNothing().returning();
      if (inserted.length) insertedCount += 1;
      else duplicateCount += 1;
    }

    const finishedAt = new Date();
    await db.update(crawlRun).set({
      status: "succeeded",
      discoveredCount: items.length,
      insertedCount,
      duplicateCount,
      quarantinedCount,
      finishedAt,
    }).where(and(eq(crawlRun.id, runId), eq(crawlRun.mediaId, input.mediaId)));
    await db.update(source).set({
      status: "active",
      lastRunAt: finishedAt,
      lastSuccessAt: finishedAt,
      lastErrorCode: null,
      updatedAt: finishedAt,
    }).where(and(eq(source.id, input.sourceId), eq(source.mediaId, input.mediaId)));

    await recordAuditEvent({
      mediaId: input.mediaId,
      actorUserId: input.actorUserId,
      action: "source.crawl.succeeded",
      targetType: "crawl_run",
      targetId: runId,
      correlationId: input.correlationId,
      metadata: { sourceId: input.sourceId, discoveredCount: items.length, insertedCount, duplicateCount, quarantinedCount },
    });

    return { runId, discoveredCount: items.length, insertedCount, duplicateCount, quarantinedCount };
  } catch (error) {
    const errorCode = runErrorCode(error);
    const finishedAt = new Date();
    await db.update(crawlRun).set({ status: "failed", errorCode, finishedAt }).where(and(eq(crawlRun.id, runId), eq(crawlRun.mediaId, input.mediaId)));
    await db.update(source).set({ status: "failed", lastRunAt: finishedAt, lastErrorCode: errorCode, updatedAt: finishedAt }).where(and(eq(source.id, input.sourceId), eq(source.mediaId, input.mediaId)));
    await recordAuditEvent({
      mediaId: input.mediaId,
      actorUserId: input.actorUserId,
      action: "source.crawl.failed",
      targetType: "crawl_run",
      targetId: runId,
      correlationId: input.correlationId,
      metadata: { sourceId: input.sourceId, errorCode },
    });
    throw new Error(errorCode);
  }
}
