import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { crawlerDefinition, crawlerVersion, crawlRun, crawlRunEvent, rawArticle, source } from "@/db/schema";
import { isSourceDue } from "@/lib/crawl-schedule";
import { recordAuditEvent } from "@/lib/server/audit";
import { db } from "@/lib/server/database";
import { CrawlerGeneratorError, crawlerGeneratorSiteId, runGeneratedCrawler } from "@/lib/server/crawler-generator-adapter";
import { crawlerGeneratorExecutionEnabled } from "@/lib/server/crawler-execution-policy";
import { parseRssFeed } from "@/lib/server/rss-adapter";
import { assertPublicHttpsUrl, fetchPublicXml, UnsafeSourceUrlError } from "@/lib/server/url-safety";

type CrawlTrigger = "manual" | "schedule";
const activeRunControllers = new Map<string, AbortController>();

async function appendRunEvent(mediaId: string, runId: string, event: Record<string, unknown>) {
  if (typeof event.message !== "string" || !event.message.trim()) return;
  const sequence = Number(event.sequence);
  try {
    await db.insert(crawlRunEvent).values({
      id: `crawl_event_${randomUUID()}`,
      mediaId,
      runId,
      sequence: Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : 0,
      stage: typeof event.stage === "string" ? event.stage.slice(0, 120) : "crawler",
      status: typeof event.status === "string" ? event.status.slice(0, 40) : "progress",
      level: typeof event.level === "string" ? event.level.slice(0, 20) : "info",
      message: event.message.trim().slice(0, 2_000),
    });
  } catch {
    // Progress persistence must never turn an otherwise healthy crawl into a failure.
  }
}

async function currentRunState(mediaId: string, runId: string) {
  const [current] = await db
    .select({ status: crawlRun.status, errorCode: crawlRun.errorCode })
    .from(crawlRun)
    .where(and(eq(crawlRun.id, runId), eq(crawlRun.mediaId, mediaId)))
    .limit(1);
  return current ?? null;
}

export async function cancelActiveSourceRuns(mediaId: string, sourceId: string) {
  const finishedAt = new Date();
  const cancelled = await db
    .update(crawlRun)
    .set({ status: "failed", errorCode: "USER_CANCELLED", finishedAt })
    .where(and(eq(crawlRun.mediaId, mediaId), eq(crawlRun.sourceId, sourceId), inArray(crawlRun.status, ["queued", "running"])))
    .returning();
  for (const run of cancelled) {
    await appendRunEvent(mediaId, run.id, { stage: "worker", status: "failed", level: "warn", message: "اجرا با درخواست کاربر متوقف شد." });
    activeRunControllers.get(run.id)?.abort(new Error("USER_CANCELLED"));
  }
  return cancelled.length;
}

function runErrorCode(error: unknown) {
  if (error instanceof UnsafeSourceUrlError) return "UNSAFE_SOURCE_URL";
  if (error instanceof CrawlerGeneratorError) return error.code;
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "UPSTREAM_TIMEOUT";
  if (error instanceof Error && /^(UPSTREAM_\d{3}|RESPONSE_TOO_LARGE|REDIRECT_LIMIT|EMPTY_RESPONSE)$/.test(error.message)) return error.message;
  return "ADAPTER_FAILED";
}

async function activeCrawler(mediaId: string, sourceId: string) {
  const [configuration] = await db
    .select({
      sourceId: source.id,
      url: source.url,
      enabled: source.enabled,
      adapterKey: source.adapterKey,
      versionId: crawlerVersion.id,
      config: crawlerVersion.config,
    })
    .from(source)
    .innerJoin(crawlerDefinition, and(eq(crawlerDefinition.sourceId, source.id), eq(crawlerDefinition.mediaId, source.mediaId)))
    .innerJoin(crawlerVersion, and(eq(crawlerVersion.definitionId, crawlerDefinition.id), eq(crawlerVersion.mediaId, source.mediaId), eq(crawlerVersion.status, "active")))
    .where(and(eq(source.id, sourceId), eq(source.mediaId, mediaId)))
    .limit(1);
  return configuration ?? null;
}

export async function enqueueSourceRun(input: {
  mediaId: string;
  sourceId: string;
  actorUserId: string | null;
  correlationId: string;
  trigger: CrawlTrigger;
}) {
  const configuration = await activeCrawler(input.mediaId, input.sourceId);
  if (!configuration?.enabled) return null;

  const runId = `crawl_run_${randomUUID()}`;
  const inserted = await db.insert(crawlRun).values({
    id: runId,
    mediaId: input.mediaId,
    sourceId: input.sourceId,
    crawlerVersionId: configuration.versionId,
    status: "queued",
    trigger: input.trigger,
    correlationId: input.correlationId,
    requestedBy: input.actorUserId,
  }).onConflictDoNothing().returning();

  if (!inserted.length) {
    const [active] = await db
      .select({ id: crawlRun.id, status: crawlRun.status })
      .from(crawlRun)
      .where(and(eq(crawlRun.mediaId, input.mediaId), eq(crawlRun.sourceId, input.sourceId), inArray(crawlRun.status, ["queued", "running"])))
      .orderBy(asc(crawlRun.createdAt))
      .limit(1);
    return active ? { runId: active.id, status: active.status as "queued" | "running", accepted: false } : null;
  }

  await recordAuditEvent({
    mediaId: input.mediaId,
    actorUserId: input.actorUserId,
    action: "source.crawl.queued",
    targetType: "crawl_run",
    targetId: runId,
    correlationId: input.correlationId,
    metadata: { sourceId: input.sourceId, trigger: input.trigger },
  });

  await appendRunEvent(input.mediaId, runId, { stage: "queue", status: "queued", message: "درخواست دریافت شد و در صف worker قرار گرفت." });

  return { runId, status: "queued" as const, accepted: true };
}

async function claimNextRun() {
  const [candidate] = await db
    .select({ id: crawlRun.id })
    .from(crawlRun)
    .where(eq(crawlRun.status, "queued"))
    .orderBy(asc(crawlRun.createdAt))
    .limit(1);
  if (!candidate) return null;

  const [claimed] = await db
    .update(crawlRun)
    .set({ status: "running", startedAt: new Date() })
    .where(and(eq(crawlRun.id, candidate.id), eq(crawlRun.status, "queued")))
    .returning();
  return claimed ?? null;
}

async function executeClaimedRun(run: NonNullable<Awaited<ReturnType<typeof claimNextRun>>>) {
  const controller = new AbortController();
  activeRunControllers.set(run.id, controller);
  let checkingCancellation = false;
  const cancellationPoll = setInterval(async () => {
    if (checkingCancellation || controller.signal.aborted) return;
    checkingCancellation = true;
    try {
      const current = await currentRunState(run.mediaId, run.id);
      if (!current || current.status !== "running") controller.abort(new Error(current?.errorCode ?? "RUN_CANCELLED"));
    } finally {
      checkingCancellation = false;
    }
  }, 1_000);
  try {
    await appendRunEvent(run.mediaId, run.id, { stage: "worker", status: "started", message: "worker اجرای منبع را آغاز کرد." });
    const configuration = await activeCrawler(run.mediaId, run.sourceId);
    if (!configuration?.enabled) throw new Error("SOURCE_DISABLED");
    const generated = configuration.adapterKey === "crawler-generator"
      ? await runGeneratedCrawler(configuration.url, crawlerGeneratorSiteId(configuration.url), run.trigger === "manual", controller.signal, (event) => appendRunEvent(run.mediaId, run.id, event))
      : null;
    const rss = configuration.adapterKey === "rss" ? await fetchPublicXml(configuration.url) : null;
    const items = generated ? generated.articles.map((item) => ({ ...item, externalId: null })) : parseRssFeed(rss!.body).map((item) => ({
      externalId: item.externalId,
      url: item.canonicalUrl,
      title: item.title,
      summary: item.summary,
      publishedAt: item.publishedAt?.toISOString() ?? null,
      content: null,
      contentHtml: null,
      imageUrl: null,
      categories: [] as string[],
      tags: [] as string[],
      author: null,
    }));
    let insertedCount = 0;
    let duplicateCount = 0;
    let quarantinedCount = 0;

    for (const item of items) {
      let status = "new";
      let quarantineReason: string | null = null;
      try {
        await assertPublicHttpsUrl(item.url);
      } catch {
        status = "quarantined";
        quarantineReason = "UNSAFE_ARTICLE_URL";
        quarantinedCount += 1;
      }

      const contentHash = createHash("sha256").update(`${item.url}\n${item.title}`).digest("hex");
      const publishedAt = item.publishedAt && !Number.isNaN(Date.parse(item.publishedAt)) ? new Date(item.publishedAt) : null;
      const inserted = await db.insert(rawArticle).values({
        id: `raw_${randomUUID()}`,
        mediaId: run.mediaId,
        sourceId: run.sourceId,
        crawlRunId: run.id,
        externalId: item.externalId,
        canonicalUrl: item.url,
        title: item.title,
        summary: item.summary,
        content: item.content,
        contentHtml: item.contentHtml,
        imageUrl: item.imageUrl,
        categories: item.categories,
        tags: item.tags,
        author: item.author,
        publishedAt,
        contentHash,
        status,
        quarantineReason,
        provenance: configuration.adapterKey === "crawler-generator"
          ? { adapterKey: "crawler-generator", siteId: generated!.site.id, crawlerVersion: generated!.site.version, outputFile: generated!.outputFile, contractVersion: "1", crawlRunId: run.id }
          : { adapterKey: "rss", feedUrl: rss!.finalUrl, contractVersion: "1", crawlRunId: run.id },
      }).onConflictDoNothing().returning();
      if (inserted.length) insertedCount += 1;
      else duplicateCount += 1;
    }

    const finishedAt = new Date();
    const discoveredCount = generated?.discovered ?? items.length;
    const upstreamFailures = generated?.failed ?? 0;
    const completed = await db.update(crawlRun).set({ status: "succeeded", discoveredCount, insertedCount, duplicateCount, quarantinedCount: quarantinedCount + upstreamFailures, finishedAt })
      .where(and(eq(crawlRun.id, run.id), eq(crawlRun.mediaId, run.mediaId), eq(crawlRun.status, "running")))
      .returning();
    if (!completed.length) return { status: "failed" as const, runId: run.id, errorCode: "USER_CANCELLED" };
    await db.update(source).set({ status: "active", lastRunAt: finishedAt, lastSuccessAt: finishedAt, lastErrorCode: null, updatedAt: finishedAt })
      .where(and(eq(source.id, run.sourceId), eq(source.mediaId, run.mediaId)));
    await recordAuditEvent({
      mediaId: run.mediaId,
      actorUserId: run.requestedBy,
      action: "source.crawl.succeeded",
      targetType: "crawl_run",
      targetId: run.id,
      correlationId: run.correlationId,
      metadata: { sourceId: run.sourceId, adapterKey: configuration.adapterKey, discoveredCount, insertedCount, duplicateCount, quarantinedCount: quarantinedCount + upstreamFailures },
    });
    await appendRunEvent(run.mediaId, run.id, { stage: "ingestion", status: "completed", message: `اجرا پایان یافت؛ ${insertedCount} خبر جدید و ${duplicateCount} خبر تکراری ثبت شد.` });
    return { status: "succeeded" as const, runId: run.id };
  } catch (error) {
    const current = await currentRunState(run.mediaId, run.id);
    if (!current || current.errorCode === "USER_CANCELLED") {
      return { status: "failed" as const, runId: run.id, errorCode: "USER_CANCELLED" };
    }
    const errorCode = runErrorCode(error);
    const finishedAt = new Date();
    await db.update(crawlRun).set({ status: "failed", errorCode, finishedAt }).where(and(eq(crawlRun.id, run.id), eq(crawlRun.mediaId, run.mediaId)));
    await db.update(source).set({ status: "failed", lastRunAt: finishedAt, lastErrorCode: errorCode, updatedAt: finishedAt }).where(and(eq(source.id, run.sourceId), eq(source.mediaId, run.mediaId)));
    await recordAuditEvent({
      mediaId: run.mediaId,
      actorUserId: run.requestedBy,
      action: "source.crawl.failed",
      targetType: "crawl_run",
      targetId: run.id,
      correlationId: run.correlationId,
      metadata: { sourceId: run.sourceId, errorCode },
    });
    await appendRunEvent(run.mediaId, run.id, { stage: "worker", status: "failed", level: "error", message: errorCode === "USER_CANCELLED" ? "اجرا توسط کاربر متوقف شد." : `اجرای منبع با خطای ${errorCode} پایان یافت.` });
    return { status: "failed" as const, runId: run.id, errorCode };
  } finally {
    clearInterval(cancellationPoll);
    activeRunControllers.delete(run.id);
  }
}

async function failStaleRuns(now = new Date()) {
  const configuredStaleAfterMs = Number(process.env.CRAWL_WORKER_STALE_MS ?? 90 * 60_000);
  const staleAfterMs = Number.isFinite(configuredStaleAfterMs) && configuredStaleAfterMs >= 60_000
    ? configuredStaleAfterMs
    : 90 * 60_000;
  const cutoff = new Date(now.getTime() - staleAfterMs);
  const staleRuns = await db
    .update(crawlRun)
    .set({ status: "failed", errorCode: "WORKER_STALLED", finishedAt: now })
    .where(and(eq(crawlRun.status, "running"), lt(crawlRun.startedAt, cutoff)))
    .returning();

  for (const run of staleRuns) {
    await db.update(source)
      .set({ status: "failed", lastRunAt: now, lastErrorCode: "WORKER_STALLED", updatedAt: now })
      .where(and(eq(source.id, run.sourceId), eq(source.mediaId, run.mediaId)));
    await recordAuditEvent({
      mediaId: run.mediaId,
      actorUserId: run.requestedBy,
      action: "source.crawl.failed",
      targetType: "crawl_run",
      targetId: run.id,
      correlationId: run.correlationId,
      metadata: { sourceId: run.sourceId, errorCode: "WORKER_STALLED" },
    });
  }
  return staleRuns.length;
}

export async function enqueueDueSourceRuns(now = new Date()) {
  const candidates = await db
    .select({ id: source.id, mediaId: source.mediaId, adapterKey: source.adapterKey, scheduleMinutes: source.scheduleMinutes, lastRunAt: source.lastRunAt })
    .from(source)
    .where(eq(source.enabled, true));
  let queued = 0;
  for (const candidate of candidates) {
    if (candidate.adapterKey === "crawler-generator" && !crawlerGeneratorExecutionEnabled()) continue;
    if (!isSourceDue(candidate.lastRunAt, candidate.scheduleMinutes, now)) continue;
    const result = await enqueueSourceRun({
      mediaId: candidate.mediaId,
      sourceId: candidate.id,
      actorUserId: null,
      correlationId: `schedule:${candidate.id}:${randomUUID()}`,
      trigger: "schedule",
    });
    if (result?.accepted) queued += 1;
  }
  return queued;
}

export async function runCrawlWorkerCycle(maxJobs = 4) {
  const recovered = await failStaleRuns();
  const scheduled = await enqueueDueSourceRuns();
  const results = [];
  for (let index = 0; index < maxJobs; index += 1) {
    const run = await claimNextRun();
    if (!run) break;
    results.push(await executeClaimedRun(run));
  }
  return { recovered, scheduled, processed: results.length, results };
}
