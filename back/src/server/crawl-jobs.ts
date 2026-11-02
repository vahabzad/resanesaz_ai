import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, lt, isNull, sql } from "drizzle-orm";
import { crawlerDefinition, crawlerVersion, crawlRun, crawlRunEvent, mediaInboxItem, mediaSourceSubscription, rawArticle, source, sourceAccessRequest } from "@/db/schema";
import { isSourceDue } from "@/src/crawl-schedule";
import { crawlOutcome } from "@/src/crawl-outcome";
import { recordAuditEvent } from "@/src/server/audit";
import { db } from "@/src/server/database";
import { parseRssFeed } from "@/src/server/rss-adapter";
import { assertPublicHttpsUrl, fetchPublicXml, UnsafeSourceUrlError } from "@/src/server/url-safety";
import { runWebCrawler, fetchFullArticle, describeArticleFailure, safeArticleLogUrl, type CrawledArticle } from "@/src/server/web-crawler";
import { buildCrawler, CrawlerBuildError, type CrawlerDebugContext } from "@/src/server/crawler-builder";
import { parseRecipe } from "@/src/server/crawler-recipe";
import { registerSourceCategories } from "./category-mappings";

type CrawlTrigger = "manual" | "schedule";
const activeRunControllers = new Map<string, AbortController>();

export async function distributeRawArticleToSubscribers(sourceId: string, rawArticleId: string, status: string) {
  const subscriptions = await db.select({ mediaId: mediaSourceSubscription.mediaId }).from(mediaSourceSubscription)
    .innerJoin(source, eq(source.id, mediaSourceSubscription.sourceId))
    .where(and(eq(mediaSourceSubscription.sourceId, sourceId), eq(mediaSourceSubscription.enabled, true), eq(source.mediaDeliveryEnabled, true), isNull(source.archivedAt)));
  if (subscriptions.length) await db.insert(mediaInboxItem).values(subscriptions.map((subscription) => ({
    id: `inbox_${randomUUID()}`, mediaId: subscription.mediaId, rawArticleId, status,
  }))).onConflictDoNothing();
}

async function appendRunEvent(runId: string, event: Record<string, unknown>) {
  if (typeof event.message !== "string" || !event.message.trim()) return;
  const sequence = Number(event.sequence);
  try {
    await db.insert(crawlRunEvent).values({
      id: `crawl_event_${randomUUID()}`,
      runId,
      sequence: Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : 0,
      stage: typeof event.stage === "string" ? event.stage.slice(0, 120) : "crawler",
      status: typeof event.status === "string" ? event.status.slice(0, 40) : "progress",
      level: typeof event.level === "string" ? event.level.slice(0, 20) : "info",
      message: event.message.trim().slice(0, 2_000),
      articleUrl: typeof event.articleUrl === "string" ? event.articleUrl.slice(0, 1_000) : null,
      errorCode: typeof event.errorCode === "string" ? event.errorCode.slice(0, 80) : null,
      durationMs: typeof event.durationMs === "number" && Number.isFinite(event.durationMs) ? Math.min(2_147_483_647, Math.max(0, Math.round(event.durationMs))) : null,
    });
  } catch {
    // Progress persistence must never turn an otherwise healthy crawl into a failure.
  }
}

async function currentRunState(runId: string) {
  const [current] = await db
    .select({ status: crawlRun.status, errorCode: crawlRun.errorCode })
    .from(crawlRun)
    .where(eq(crawlRun.id, runId))
    .limit(1);
  return current ?? null;
}

export async function cancelActiveSourceRuns(sourceId: string) {
  const finishedAt = new Date();
  const cancelled = await db
    .update(crawlRun)
    .set({ status: "failed", errorCode: "USER_CANCELLED", finishedAt })
    .where(and(eq(crawlRun.sourceId, sourceId), inArray(crawlRun.status, ["queued", "running"])))
    .returning();
  for (const run of cancelled) {
    if (["build", "debug"].includes(run.trigger)) await db.update(crawlerVersion).set({ status: "failed" }).where(and(eq(crawlerVersion.id, run.crawlerVersionId), eq(crawlerVersion.status, "draft")));
    await appendRunEvent(run.id, { stage: "worker", status: "failed", level: "warn", message: "اجرا با درخواست کاربر متوقف شد." });
    activeRunControllers.get(run.id)?.abort(new Error("USER_CANCELLED"));
  }
  return cancelled.length;
}

function runErrorCode(error: unknown) {
  if (error instanceof CrawlerBuildError) return error.code;
  if (error instanceof Error && ["CODEX_EXECUTABLE_NOT_FOUND", "INVALID_RECIPE", "UPSTREAM_TIMEOUT"].includes(error.message)) return error.message;
  if (error instanceof UnsafeSourceUrlError) return "UNSAFE_SOURCE_URL";
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "UPSTREAM_TIMEOUT";
  if (error instanceof Error && /^(UPSTREAM_\d{3}|RESPONSE_TOO_LARGE|REDIRECT_LIMIT|EMPTY_RESPONSE)$/.test(error.message)) return error.message;
  return "ADAPTER_FAILED";
}

async function activeCrawler(sourceId: string, versionId?: string, building = false) {
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
    .innerJoin(crawlerDefinition, eq(crawlerDefinition.sourceId, source.id))
    .innerJoin(crawlerVersion, and(eq(crawlerVersion.definitionId, crawlerDefinition.id), eq(crawlerVersion.status, building ? "draft" : "active"), ...(versionId ? [eq(crawlerVersion.id, versionId)] : [])))
    .where(and(eq(source.id, sourceId), isNull(source.archivedAt)))
    .limit(1);
  return configuration ?? null;
}

export async function enqueueSourceRun(input: {
  sourceId: string;
  actorUserId: string | null;
  correlationId: string;
  trigger: CrawlTrigger;
}) {
  const configuration = await activeCrawler(input.sourceId);
  if (!configuration?.enabled) return null;

  const runId = `crawl_run_${randomUUID()}`;
  const inserted = await db.insert(crawlRun).values({
    id: runId,
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
      .where(and(eq(crawlRun.sourceId, input.sourceId), inArray(crawlRun.status, ["queued", "running"])))
      .orderBy(asc(crawlRun.createdAt))
      .limit(1);
    return active ? { runId: active.id, status: active.status as "queued" | "running", accepted: false } : null;
  }

  await recordAuditEvent({
    mediaId: null,
    actorUserId: input.actorUserId,
    action: "source.crawl.queued",
    targetType: "crawl_run",
    targetId: runId,
    correlationId: input.correlationId,
    metadata: { sourceId: input.sourceId, trigger: input.trigger },
  });

  await appendRunEvent(runId, { stage: "queue", status: "queued", message: "درخواست دریافت شد و در صف worker قرار گرفت." });

  return { runId, status: "queued" as const, accepted: true };
}

async function claimNextRun() {
  const [candidate] = await db
    .select({ id: crawlRun.id })
    .from(crawlRun)
    .where(eq(crawlRun.status, "queued"))
    .orderBy(sql`case when ${crawlRun.trigger} in ('build', 'debug') then 0 else 1 end`, asc(crawlRun.createdAt))
    .limit(1);
  if (!candidate) return null;

  const [claimed] = await db
    .update(crawlRun)
    .set({ status: "running", startedAt: new Date() })
    .where(and(eq(crawlRun.id, candidate.id), eq(crawlRun.status, "queued")))
    .returning();
  return claimed ?? null;
}

async function executeClaimedRun(run: NonNullable<Awaited<ReturnType<typeof claimNextRun>>>, builder = buildCrawler) {
  console.info("crawl run started", { runId: run.id, sourceId: run.sourceId, trigger: run.trigger });
  const controller = new AbortController();
  activeRunControllers.set(run.id, controller);
  let checkingCancellation = false;
  const cancellationPoll = setInterval(async () => {
    if (checkingCancellation || controller.signal.aborted) return;
    checkingCancellation = true;
    try {
      const current = await currentRunState(run.id);
      if (!current || current.status !== "running") controller.abort(new Error(current?.errorCode ?? "RUN_CANCELLED"));
    } finally {
      checkingCancellation = false;
    }
  }, 1_000);
  try {
    await appendRunEvent(run.id, { stage: "worker", status: "started", message: "worker اجرای منبع را آغاز کرد." });
    const building = ["build", "debug"].includes(run.trigger);
    const configuration = await activeCrawler(run.sourceId, run.crawlerVersionId, building);
    if (!configuration || (!building && !configuration.enabled)) throw new Error("SOURCE_DISABLED");
    if (building) {
      const debugging = run.trigger === "debug";
      const debug = debugging ? configuration.config.debugContext as CrawlerDebugContext : undefined;
      if (debug) {
        const { validatedArticleUrls } = await import("./crawler-history");
        debug.knownArticleUrls = [...new Set([...(debug.knownArticleUrls ?? []), ...await validatedArticleUrls(run.sourceId, configuration.url)])].slice(0, 1000);
      }
      const result = await builder(configuration.url, configuration.adapterKey, controller.signal, (event) => appendRunEvent(run.id, event), undefined, debug);
      controller.signal.throwIfAborted();
      if (!result.report.passed) throw new CrawlerBuildError("CRAWLER_VALIDATION_FAILED", result.report);
      if (configuration.adapterKey === "web") parseRecipe("recipe" in result.config ? result.config.recipe : undefined);
      const finishedAt = new Date();
      await db.transaction(async (transaction) => {
        const [currentSource] = await transaction.select().from(source).where(and(eq(source.id, run.sourceId), isNull(source.archivedAt))).for("update");
        if (!currentSource) throw new Error("USER_CANCELLED");
        const [completed] = await transaction.update(crawlRun).set({ status: "succeeded", discoveredCount: result.report.discovered, failedCount: 0, finishedAt }).where(and(eq(crawlRun.id, run.id), eq(crawlRun.status, "running"))).returning();
        if (!completed) throw new Error("USER_CANCELLED");
        const keepPaused = debugging && currentSource.status === "paused";
        const [enabled] = await transaction.update(source).set({ enabled: !keepPaused, status: keepPaused ? "paused" : "active", lastErrorCode: null, updatedAt: finishedAt }).where(and(eq(source.id, run.sourceId), isNull(source.archivedAt))).returning();
        if (!enabled) throw new Error("USER_CANCELLED");
        const [version] = await transaction.select().from(crawlerVersion).where(eq(crawlerVersion.id, run.crawlerVersionId));
        await transaction.update(crawlerVersion).set({ status: "retired" }).where(and(eq(crawlerVersion.definitionId, version.definitionId), eq(crawlerVersion.status, "active")));
        await transaction.update(crawlerVersion).set({ status: "active", config: { ...result.config, ...(debugging ? { mode: "debug", previousVersionId: debug?.previousVersionId } : {}) } }).where(eq(crawlerVersion.id, run.crawlerVersionId));
        const queuedRequests = await transaction.select().from(sourceAccessRequest).where(and(eq(sourceAccessRequest.sourceId, run.sourceId), eq(sourceAccessRequest.status, "crawler_queued"))).for("update");
        for (const accessRequest of queuedRequests) {
          await transaction.insert(mediaSourceSubscription).values({ id: `subscription_${randomUUID()}`, mediaId: accessRequest.mediaId, sourceId: run.sourceId, categoryMode: accessRequest.categoryMode, categoryIds: accessRequest.categoryIds, createdBy: accessRequest.reviewedBy ?? run.requestedBy }).onConflictDoUpdate({ target: [mediaSourceSubscription.mediaId, mediaSourceSubscription.sourceId], set: { enabled: true, categoryMode: accessRequest.categoryMode, categoryIds: accessRequest.categoryIds } });
          const existingArticles = await transaction.select({ id: rawArticle.id, status: rawArticle.status }).from(rawArticle).where(eq(rawArticle.sourceId, run.sourceId));
          if (existingArticles.length) await transaction.insert(mediaInboxItem).values(existingArticles.map((article) => ({ id: `inbox_${randomUUID()}`, mediaId: accessRequest.mediaId, rawArticleId: article.id, status: article.status }))).onConflictDoNothing();
          await transaction.update(sourceAccessRequest).set({ status: "access_granted" }).where(eq(sourceAccessRequest.id, accessRequest.id));
          await recordAuditEvent({ mediaId: accessRequest.mediaId, actorUserId: accessRequest.reviewedBy ?? run.requestedBy, action: "source_access_request.access_granted_after_crawler", targetType: "source_access_request", targetId: accessRequest.id, correlationId: run.correlationId, metadata: { sourceId: run.sourceId } }, transaction);
        }
        await recordAuditEvent({ mediaId: null, actorUserId: run.requestedBy, action: debugging ? "platform.crawler.debug.validated" : "platform.crawler.validated", targetType: "crawler_version", targetId: run.crawlerVersionId, correlationId: run.correlationId, metadata: { sourceId: run.sourceId, samples: result.report.samples.length, attempts: result.report.attempts } }, transaction);
      });
      await appendRunEvent(run.id, { stage: "build-complete", status: "completed", message: `نسخهٔ ${debugging ? "اصلاح‌شده" : "جدید"} کراولر آزمون ${result.report.samples.length} نمونه را گذراند و جایگزین شد. نمونه‌های آزمون وارد صندوق رسانه‌ها نشدند.` });
      return { status: "succeeded" as const, runId: run.id };
    }
    const generated = configuration.adapterKey === "web"
      ? await runWebCrawler(configuration.url, controller.signal, (event) => appendRunEvent(run.id, event), configuration.config.recipe ? parseRecipe(configuration.config.recipe) : undefined, Array.isArray(configuration.config.articleUrls) ? configuration.config.articleUrls.filter((url): url is string => typeof url === "string").slice(0, 500) : [])
      : null;
    const rss = configuration.adapterKey === "rss" ? await fetchPublicXml(configuration.url) : null;
    const items: Array<CrawledArticle & { externalId: string | null }> = generated ? generated.articles.map((item) => ({ ...item, externalId: null })) : parseRssFeed(rss!.body).map((item) => ({
      externalId: item.externalId,
      url: item.canonicalUrl,
      title: item.title,
      summary: item.summary,
      publishedAt: item.publishedAt?.toISOString() ?? null,
      content: null,
      contentHtml: null,
      imageUrl: null,
      categories: item.categories,
      tags: [] as string[],
      author: null,
    }));
    let insertedCount = 0;
    let duplicateCount = 0;
    let quarantinedCount = 0;
    let rssFailures = 0;

    for (const item of items) {
      let status = "new";
      let quarantineReason: string | null = null;
      try {
        await assertPublicHttpsUrl(item.url);
      } catch {
        status = "quarantined";
        quarantineReason = "UNSAFE_ARTICLE_URL";
        quarantinedCount += 1;
        if (rss) rssFailures++;
      }

      if (rss && status !== "quarantined") {
        try {
          const full = await fetchFullArticle(item.url, controller.signal);
          item.content = full.content; item.contentHtml = full.contentHtml; item.imageUrl = full.imageUrl;
          item.categories = full.categories.length ? full.categories : item.categories;
          item.author = full.author;
          await appendRunEvent(run.id, { stage: "article", status: "progress", articleUrl: safeArticleLogUrl(item.url), message: `متن کامل خبر RSS استخراج شد؛ ${item.content?.length ?? 0} نویسه؛ تصویر: ${item.imageUrl ? "دارد" : "پیدا نشد"}.` });
        } catch (error) {
          controller.signal.throwIfAborted();
          rssFailures++; quarantinedCount++; status = "quarantined"; quarantineReason = "ARTICLE_BODY_UNAVAILABLE";
          const failure = describeArticleFailure(error);
          await appendRunEvent(run.id, { stage: "article", status: "warning", level: "warn", articleUrl: safeArticleLogUrl(item.url), errorCode: failure.code, message: `متن کامل خبر RSS دریافت نشد؛ فقط دادهٔ feed در قرنطینه حفظ می‌شود. ${failure.reason}` });
        }
      }

      const contentHash = createHash("sha256").update(`${item.url}\n${item.title}`).digest("hex");
      await registerSourceCategories(run.sourceId, item.categories);
      const publishedAt = item.publishedAt && !Number.isNaN(Date.parse(item.publishedAt)) ? new Date(item.publishedAt) : null;
      const inserted = await db.insert(rawArticle).values({
        id: `raw_${randomUUID()}`,
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
        provenance: configuration.adapterKey === "web"
          ? { adapterKey: "web", runtime: "internal", contractVersion: "1", crawlRunId: run.id }
          : { adapterKey: "rss", feedUrl: rss!.finalUrl, contractVersion: "1", crawlRunId: run.id },
      }).onConflictDoNothing().returning();
      if (inserted.length) {
        insertedCount += 1;
        await distributeRawArticleToSubscribers(run.sourceId, inserted[0].id, status);
      } else duplicateCount += 1;
    }

    const finishedAt = new Date();
    const discoveredCount = generated?.discovered ?? items.length;
    const upstreamFailures = generated?.failed ?? rssFailures;
    const { status, sourceStatus, errorCode } = crawlOutcome({ web: true, discovered: discoveredCount, extracted: items.length - rssFailures, failed: upstreamFailures });
    const completelyFailed = status === "failed";
    const completed = await db.update(crawlRun).set({ status, errorCode, discoveredCount, insertedCount, duplicateCount, quarantinedCount, failedCount: upstreamFailures, finishedAt })
      .where(and(eq(crawlRun.id, run.id), eq(crawlRun.status, "running")))
      .returning();
    if (!completed.length) return { status: "failed" as const, runId: run.id, errorCode: "USER_CANCELLED" };
    await db.update(source).set({ status: sourceStatus, lastRunAt: finishedAt, ...(completelyFailed ? {} : { lastSuccessAt: finishedAt }), lastErrorCode: errorCode, updatedAt: finishedAt })
      .where(eq(source.id, run.sourceId));
    await recordAuditEvent({
      mediaId: null,
      actorUserId: run.requestedBy,
      action: `source.crawl.${status}`,
      targetType: "crawl_run",
      targetId: run.id,
      correlationId: run.correlationId,
      metadata: { sourceId: run.sourceId, adapterKey: configuration.adapterKey, discoveredCount, insertedCount, duplicateCount, quarantinedCount, failedCount: upstreamFailures, errorCode },
    });
    await appendRunEvent(run.id, { stage: "ingestion", status: completelyFailed ? "failed" : upstreamFailures ? "warning" : "completed", level: completelyFailed ? "error" : upstreamFailures ? "warn" : "info", errorCode, message: `اجرا پایان یافت؛ ${discoveredCount} لینک خبر، ${insertedCount} جدید، ${duplicateCount} تکراری، ${quarantinedCount} قرنطینه و ${upstreamFailures} استخراج ناموفق.` });
    return { status, runId: run.id, ...(errorCode ? { errorCode } : {}) };
  } catch (error) {
    const current = await currentRunState(run.id);
    if (!current || current.errorCode === "USER_CANCELLED") {
      return { status: "failed" as const, runId: run.id, errorCode: "USER_CANCELLED" };
    }
    const errorCode = runErrorCode(error);
    const finishedAt = new Date();
    const buildReport = error instanceof CrawlerBuildError ? error.report : null;
    await db.update(crawlRun).set({ status: "failed", errorCode, finishedAt, ...(["build", "debug"].includes(run.trigger) ? { discoveredCount: buildReport?.discovered ?? 0, failedCount: buildReport?.samples.filter((sample) => !sample.passed).length ?? 0 } : {}) }).where(eq(crawlRun.id, run.id));
    const [workingVersion] = run.trigger === "debug" ? await db.select({ id: crawlerVersion.id }).from(crawlerVersion).innerJoin(crawlerDefinition, eq(crawlerDefinition.id, crawlerVersion.definitionId)).where(and(eq(crawlerDefinition.sourceId, run.sourceId), eq(crawlerVersion.status, "active"))).limit(1) : [];
    if (!workingVersion) await db.update(source).set({ status: "failed", lastRunAt: finishedAt, lastErrorCode: errorCode, updatedAt: finishedAt }).where(eq(source.id, run.sourceId));
    if (["build", "debug"].includes(run.trigger)) await db.update(crawlerVersion).set({ status: "failed", config: { contractVersion: "2", mode: run.trigger, errorCode, validation: error instanceof CrawlerBuildError ? error.report : null } }).where(and(eq(crawlerVersion.id, run.crawlerVersionId), eq(crawlerVersion.status, "draft")));
    if (run.trigger === "build") {
      const failedRequests = await db.update(sourceAccessRequest).set({ status: "crawler_failed" }).where(and(eq(sourceAccessRequest.sourceId, run.sourceId), eq(sourceAccessRequest.status, "crawler_queued"))).returning();
      for (const accessRequest of failedRequests) await recordAuditEvent({ mediaId: accessRequest.mediaId, actorUserId: accessRequest.reviewedBy ?? run.requestedBy, action: "source_access_request.crawler_failed", targetType: "source_access_request", targetId: accessRequest.id, correlationId: run.correlationId, metadata: { sourceId: run.sourceId, errorCode } });
    }
    await recordAuditEvent({
      mediaId: null,
      actorUserId: run.requestedBy,
      action: "source.crawl.failed",
      targetType: "crawl_run",
      targetId: run.id,
      correlationId: run.correlationId,
      metadata: { sourceId: run.sourceId, errorCode },
    });
    const buildReasons: Record<string, string> = { CRAWLER_VALIDATION_FAILED: "نمونه‌های کافی با عنوان و متن معتبر استخراج نشدند؛ نسخه فعال نشد. گزارش آزمون را بررسی کنید.", CODEX_AUTH_REQUIRED: "ورود Codex روی میزبان بک‌اند معتبر نیست؛ وارد Codex شوید و ساخت را تکرار کنید.", CODEX_EXECUTABLE_NOT_FOUND: "Codex روی میزبان بک‌اند پیدا نشد؛ نصب و تنظیم مسیر اجرا را بررسی کنید.", CODEX_RATE_LIMITED: "سهمیه یا محدودیت درخواست Codex اجازهٔ ساخت نداد؛ بعداً دوباره تلاش کنید.", CODEX_GENERATION_TIMEOUT: "مهلت تولید الگو با Codex تمام شد؛ نسخه فعال نشد.", CODEX_RECIPE_FAILED: "Codex نتوانست الگوی معتبر تولید کند؛ ورود و دسترسی مدل را بررسی و ساخت را تکرار کنید.", CODEX_SCHEMA_REJECTED: "مدل قالب خروجی الگو را نپذیرفت؛ تنظیم مدل/SDK باید بررسی شود.", RSS_VALIDATION_FAILED: "خوراک RSS خبر معتبر ندارد؛ آدرس خوراک را بررسی کنید." };
    await appendRunEvent(run.id, { stage: "worker", status: "failed", level: "error", errorCode, message: buildReasons[errorCode] ?? (errorCode === "USER_CANCELLED" ? "اجرا توسط کاربر متوقف شد." : `اجرای منبع با خطای ${errorCode} پایان یافت.`) });
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
      .where(eq(source.id, run.sourceId));
    await recordAuditEvent({
      mediaId: null,
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
    .select({ id: source.id, adapterKey: source.adapterKey, scheduleMinutes: source.scheduleMinutes, lastRunAt: source.lastRunAt })
    .from(source)
    .where(and(eq(source.enabled, true), isNull(source.archivedAt)));
  let queued = 0;
  for (const candidate of candidates) {
    if (!isSourceDue(candidate.lastRunAt, candidate.scheduleMinutes, now)) continue;
    const result = await enqueueSourceRun({
      sourceId: candidate.id,
      actorUserId: null,
      correlationId: `schedule:${candidate.id}:${randomUUID()}`,
      trigger: "schedule",
    });
    if (result?.accepted) queued += 1;
  }
  return queued;
}

export async function runCrawlWorkerCycle(maxJobs = 4, builder = buildCrawler) {
  const recovered = await failStaleRuns();
  const scheduled = await enqueueDueSourceRuns();
  const results = [];
  for (let index = 0; index < maxJobs; index += 1) {
    const run = await claimNextRun();
    if (!run) break;
    results.push(await executeClaimedRun(run, builder));
  }
  return { recovered, scheduled, processed: results.length, results };
}

// PGlite has one exclusive owner. After the API's local process restarts,
// no other worker can still be executing these runs; preserve their IDs and retry.
export async function recoverInterruptedLocalRuns() {
  if (process.env.DATABASE_DRIVER !== "pglite") throw new Error("LOCAL_RECOVERY_REQUIRES_PGLITE");
  const runs = await db.update(crawlRun).set({ status: "queued", startedAt: null, finishedAt: null, errorCode: null })
    .where(eq(crawlRun.status, "running")).returning();
  for (const run of runs) await appendRunEvent(run.id, { stage: "worker", status: "queued", message: "فرایند محلی دوباره راه‌اندازی شد؛ اجرای ناتمام دوباره در صف قرار گرفت." });
  return runs.length;
}
