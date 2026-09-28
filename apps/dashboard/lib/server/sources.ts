import "server-only";

import { randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import {
  crawlerDefinition,
  crawlerVersion,
  crawlRun,
  crawlRunEvent,
  rawArticle,
  source,
} from "@/db/schema";
import type { CrawlRunLiveLog, CrawlRunSummary, SourceStatus, SourcesWorkspace } from "@/lib/contracts/sources";
import { recordAuditEvent } from "@/lib/server/audit";
import { cancelActiveSourceRuns } from "@/lib/server/crawl-jobs";
import { crawlerGeneratorExecutionEnabled } from "@/lib/server/crawler-execution-policy";
import { db } from "@/lib/server/database";
import { assertPublicHttpsUrl } from "@/lib/server/url-safety";

type CreateSourceInput = {
  mediaId: string;
  actorUserId: string;
  name: string;
  url: string;
  scheduleMinutes: number;
  correlationId: string;
  adapterKey: "crawler-generator" | "rss";
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
      trigger: crawlRun.trigger,
      discoveredCount: crawlRun.discoveredCount,
      insertedCount: crawlRun.insertedCount,
      duplicateCount: crawlRun.duplicateCount,
      quarantinedCount: crawlRun.quarantinedCount,
      errorCode: crawlRun.errorCode,
      createdAt: crawlRun.createdAt,
      startedAt: crawlRun.startedAt,
      finishedAt: crawlRun.finishedAt,
    })
    .from(crawlRun)
    .innerJoin(source, and(eq(source.id, crawlRun.sourceId), eq(source.mediaId, crawlRun.mediaId)))
    .where(eq(crawlRun.mediaId, mediaId))
    .orderBy(desc(crawlRun.createdAt))
    .limit(8);

  const sources = sourceRows.map((row) => ({
    ...row,
    adapterKey: row.adapterKey as "crawler-generator" | "rss",
    status: row.status as SourceStatus,
    executionBlocked: row.adapterKey === "crawler-generator" && !crawlerGeneratorExecutionEnabled(),
    articleCount: articleCountBySource.get(row.id) ?? 0,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
  }));

  const recentRuns: CrawlRunSummary[] = runRows.map((row) => ({
    ...row,
    status: row.status as CrawlRunSummary["status"],
    trigger: row.trigger as CrawlRunSummary["trigger"],
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
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

export async function getCrawlRunLiveLog(mediaId: string, runId: string): Promise<CrawlRunLiveLog | null> {
  const [run] = await db.select({
    id: crawlRun.id,
    sourceName: source.name,
    status: crawlRun.status,
    errorCode: crawlRun.errorCode,
  }).from(crawlRun)
    .innerJoin(source, and(eq(source.id, crawlRun.sourceId), eq(source.mediaId, crawlRun.mediaId)))
    .where(and(eq(crawlRun.id, runId), eq(crawlRun.mediaId, mediaId)))
    .limit(1);
  if (!run) return null;
  const events = await db.select({
    id: crawlRunEvent.id,
    sequence: crawlRunEvent.sequence,
    stage: crawlRunEvent.stage,
    status: crawlRunEvent.status,
    level: crawlRunEvent.level,
    message: crawlRunEvent.message,
    createdAt: crawlRunEvent.createdAt,
  }).from(crawlRunEvent)
    .where(and(eq(crawlRunEvent.runId, runId), eq(crawlRunEvent.mediaId, mediaId)))
    .orderBy(desc(crawlRunEvent.sequence))
    .limit(100);
  return {
    runId: run.id,
    sourceName: run.sourceName,
    status: run.status as CrawlRunSummary["status"],
    errorCode: run.errorCode,
    events: events.reverse().map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
  };
}

export async function getSourceExecutionPolicy(mediaId: string, sourceId: string) {
  const [row] = await db
    .select({ adapterKey: source.adapterKey, enabled: source.enabled })
    .from(source)
    .where(and(eq(source.id, sourceId), eq(source.mediaId, mediaId)))
    .limit(1);
  if (!row?.enabled) return null;
  return {
    blocked: row.adapterKey === "crawler-generator" && !crawlerGeneratorExecutionEnabled(),
  };
}

export async function createSource(input: CreateSourceInput) {
  const safeUrl = await assertPublicHttpsUrl(input.url);
  const sourceId = `source_${randomUUID()}`;
  const definitionId = `crawler_${randomUUID()}`;

  await db.transaction(async (transaction) => {
    await transaction.insert(source).values({
      id: sourceId,
      mediaId: input.mediaId,
      name: input.name,
      url: safeUrl.toString(),
      adapterKey: input.adapterKey,
      scheduleMinutes: input.scheduleMinutes,
      createdBy: input.actorUserId,
    });
    await transaction.insert(crawlerDefinition).values({
      id: definitionId,
      mediaId: input.mediaId,
      sourceId,
      adapterKey: input.adapterKey,
    });
    await transaction.insert(crawlerVersion).values({
      id: `crawler_version_${randomUUID()}`,
      mediaId: input.mediaId,
      definitionId,
      version: 1,
      status: "active",
      config: input.adapterKey === "rss"
        ? { feedUrl: safeUrl.toString(), contractVersion: "1" }
        : { listingUrl: safeUrl.toString(), contractVersion: "1", generatorContract: "CrawlerGenerator/api-v1" },
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
    metadata: { adapterKey: input.adapterKey },
  });

  return sourceId;
}

type SourceMutationInput = {
  mediaId: string;
  sourceId: string;
  actorUserId: string;
  correlationId: string;
};

export async function pauseSource(input: SourceMutationInput) {
  const cancelledRuns = await cancelActiveSourceRuns(input.mediaId, input.sourceId);
  const [updated] = await db.update(source)
    .set({ enabled: false, status: "paused", lastErrorCode: cancelledRuns ? "USER_CANCELLED" : null, updatedAt: new Date() })
    .where(and(eq(source.id, input.sourceId), eq(source.mediaId, input.mediaId)))
    .returning();
  if (!updated) return null;
  await recordAuditEvent({
    mediaId: input.mediaId,
    actorUserId: input.actorUserId,
    action: "source.paused",
    targetType: "source",
    targetId: input.sourceId,
    correlationId: input.correlationId,
    metadata: { cancelledRuns },
  });
  return { sourceId: input.sourceId, cancelledRuns };
}

export async function resumeSource(input: SourceMutationInput) {
  const [updated] = await db.update(source)
    .set({ enabled: true, status: "active", lastErrorCode: null, updatedAt: new Date() })
    .where(and(eq(source.id, input.sourceId), eq(source.mediaId, input.mediaId), eq(source.enabled, false)))
    .returning();
  if (!updated) return null;
  await recordAuditEvent({
    mediaId: input.mediaId,
    actorUserId: input.actorUserId,
    action: "source.resumed",
    targetType: "source",
    targetId: input.sourceId,
    correlationId: input.correlationId,
  });
  return { sourceId: input.sourceId };
}

export async function deleteSource(input: SourceMutationInput) {
  await cancelActiveSourceRuns(input.mediaId, input.sourceId);
  const deleted = await db.transaction(async (transaction) => {
    const [existing] = await transaction.select({ id: source.id })
      .from(source)
      .where(and(eq(source.id, input.sourceId), eq(source.mediaId, input.mediaId)))
      .limit(1);
    if (!existing) return false;
    const definitions = await transaction.select({ id: crawlerDefinition.id })
      .from(crawlerDefinition)
      .where(and(eq(crawlerDefinition.sourceId, input.sourceId), eq(crawlerDefinition.mediaId, input.mediaId)));
    await transaction.delete(rawArticle).where(and(eq(rawArticle.sourceId, input.sourceId), eq(rawArticle.mediaId, input.mediaId)));
    await transaction.delete(crawlRun).where(and(eq(crawlRun.sourceId, input.sourceId), eq(crawlRun.mediaId, input.mediaId)));
    if (definitions.length) {
      await transaction.delete(crawlerVersion).where(and(eq(crawlerVersion.mediaId, input.mediaId), inArray(crawlerVersion.definitionId, definitions.map((item) => item.id))));
    }
    await transaction.delete(crawlerDefinition).where(and(eq(crawlerDefinition.sourceId, input.sourceId), eq(crawlerDefinition.mediaId, input.mediaId)));
    await transaction.delete(source).where(and(eq(source.id, input.sourceId), eq(source.mediaId, input.mediaId)));
    return true;
  });
  if (!deleted) return null;
  await recordAuditEvent({
    mediaId: input.mediaId,
    actorUserId: input.actorUserId,
    action: "source.deleted",
    targetType: "source",
    targetId: input.sourceId,
    correlationId: input.correlationId,
  });
  return { sourceId: input.sourceId };
}
