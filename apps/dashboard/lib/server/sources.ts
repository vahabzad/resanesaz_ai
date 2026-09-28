import "server-only";

import { randomUUID } from "node:crypto";
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
