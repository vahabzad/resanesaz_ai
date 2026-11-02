import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { crawlerDefinition, crawlerVersion, media, mediaCreationRequest, mediaInboxItem, mediaSourceSubscription, platformCategory, rawArticle, source, sourceAccessRequest, user } from "@/db/schema";
import { recordAuditEvent } from "@/src/server/audit";
import { db } from "@/src/server/database";
import { createPlatformSource, enqueueCrawlerBuild, restorePlatformSource } from "@/src/server/sources";
import { setupIsComplete } from "./media-source-drafts";
import { mediaIsApproved } from "./media-requests";

export class PlatformSourceRequestError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) { super(message); this.name = "PlatformSourceRequestError"; }
}

export async function listPlatformSourceAccessRequests() {
  const rows = await db.select({ id: sourceAccessRequest.id, kind: sourceAccessRequest.kind, mediaId: sourceAccessRequest.mediaId, mediaName: media.name, mediaMetadata: media.metadata, sourceType: sourceAccessRequest.sourceType, platform: sourceAccessRequest.platform, categoryMode: sourceAccessRequest.categoryMode, categoryIds: sourceAccessRequest.categoryIds, sourceId: sourceAccessRequest.sourceId, name: sourceAccessRequest.name, url: sourceAccessRequest.url, status: sourceAccessRequest.status, createdAt: sourceAccessRequest.createdAt, requestedBy: user.name })
    .from(sourceAccessRequest).innerJoin(media, eq(media.id, sourceAccessRequest.mediaId)).leftJoin(user, eq(user.id, sourceAccessRequest.requestedBy)).where(notInArray(sourceAccessRequest.status, ["draft", "withdrawn"])).orderBy(desc(sourceAccessRequest.createdAt));
  const [sources, readyRows, categories] = await Promise.all([
    db.select({ id: source.id, url: source.url, archivedAt: source.archivedAt, mediaDeliveryEnabled: source.mediaDeliveryEnabled }).from(source),
    db.select({ sourceId: crawlerDefinition.sourceId }).from(crawlerDefinition).innerJoin(crawlerVersion, eq(crawlerVersion.definitionId, crawlerDefinition.id)).where(eq(crawlerVersion.status, "active")),
    db.select({ id: platformCategory.id, nameFa: platformCategory.nameFa }).from(platformCategory),
  ]);
  const readyIds = new Set(readyRows.map((item) => item.sourceId));
  const approvedMedia = new Set((await db.select({ id: mediaCreationRequest.mediaId }).from(mediaCreationRequest).where(eq(mediaCreationRequest.status, "approved"))).map(row => row.id));
  return rows.filter(row => setupIsComplete(row.mediaMetadata)).map(({ mediaMetadata: _privateMetadata, ...row }) => {
    void _privateMetadata;
    const match = sources.find((item) => item.url === row.url);
    const sourceId = row.sourceId ?? match?.id ?? null;
    return {
      ...row,
      mediaApproved: approvedMedia.has(row.mediaId),
      sourceId,
      categories: categories.filter((category) => row.categoryIds.includes(category.id)).map((category) => category.nameFa),
      crawlerReady: Boolean(match && readyIds.has(match.id)),
      existingCrawlerAvailable: Boolean(match && readyIds.has(match.id) && !match.archivedAt && match.mediaDeliveryEnabled),
    };
  });
}

export async function reviewPlatformSourceAccessRequest(input: {
  requestId: string; action: "reject" | "grant_existing" | "queue_crawler"; actorUserId: string; correlationId: string;
}) {
  const [requestRow] = await db.select().from(sourceAccessRequest).where(eq(sourceAccessRequest.id, input.requestId)).limit(1);
  if (!requestRow) throw new PlatformSourceRequestError("درخواست منبع پیدا نشد.", 404);
  const [owner] = await db.select({ metadata: media.metadata }).from(media).where(eq(media.id, requestRow.mediaId)).limit(1);
  if (!owner || !setupIsComplete(owner.metadata)) throw new PlatformSourceRequestError("تا تکمیل راه‌اندازی رسانه، درخواست منبع برای بررسی ارسال نشده است.", 409);
  if (!await mediaIsApproved(requestRow.mediaId)) throw new PlatformSourceRequestError("ابتدا درخواست ایجاد رسانه باید به تأیید سوپر ادمین برسد.", 409);
  if (!(requestRow.status === "pending" || (requestRow.status === "crawler_failed" && input.action !== "reject"))) {
    throw new PlatformSourceRequestError("این درخواست قبلاً بررسی شده یا در صف ساخت کراولر است.", 409);
  }

  if (requestRow.kind === "category_extension") return reviewCategoryExtension(requestRow.mediaId, input);

  if (input.action === "reject") {
    const [updated] = await db.update(sourceAccessRequest).set({ status: "rejected", reviewedBy: input.actorUserId, reviewedAt: new Date() })
      .where(and(eq(sourceAccessRequest.id, input.requestId), eq(sourceAccessRequest.status, "pending"))).returning();
    if (!updated) throw new PlatformSourceRequestError("درخواست هم‌زمان بررسی شده است.", 409);
    await recordAuditEvent({ mediaId: updated.mediaId, actorUserId: input.actorUserId, action: "source_access_request.rejected", targetType: "source_access_request", targetId: updated.id, correlationId: input.correlationId });
    return { id: updated.id, status: updated.status, sourceId: updated.sourceId, runId: null };
  }

  const normalizedUrl = new URL(requestRow.url).toString();
  if (input.action === "grant_existing") {
    const [candidate] = await db.select().from(source).where(eq(source.url, normalizedUrl)).limit(1);
    if (!candidate || candidate.archivedAt || !candidate.mediaDeliveryEnabled) throw new PlatformSourceRequestError("منبع آماده و قابل‌استفاده‌ای با این لینک پیدا نشد.", 409);
    const ready = await db.select({ id: crawlerVersion.id }).from(crawlerDefinition).innerJoin(crawlerVersion, eq(crawlerVersion.definitionId, crawlerDefinition.id))
      .where(and(eq(crawlerDefinition.sourceId, candidate.id), eq(crawlerVersion.status, "active"))).limit(1);
    if (!ready.length) throw new PlatformSourceRequestError("کراولر این منبع هنوز با موفقیت ساخته نشده است.", 409);
    return db.transaction(async (transaction) => {
      await transaction.select({ id: media.id }).from(media).where(eq(media.id, requestRow.mediaId)).for("update");
      const [lockedRequest] = await transaction.select().from(sourceAccessRequest).where(eq(sourceAccessRequest.id, input.requestId)).for("update");
      if (!lockedRequest || !(lockedRequest.status === "pending" || lockedRequest.status === "crawler_failed")) throw new PlatformSourceRequestError("درخواست هم‌زمان بررسی شده است.", 409);
      const [lockedSource] = await transaction.select().from(source).where(eq(source.id, candidate.id)).for("update");
      if (!lockedSource || lockedSource.archivedAt || !lockedSource.mediaDeliveryEnabled) throw new PlatformSourceRequestError("منبع دیگر برای رسانه قابل‌استفاده نیست.", 409);
      await transaction.insert(mediaSourceSubscription).values({ id: `subscription_${randomUUID()}`, mediaId: lockedRequest.mediaId, sourceId: lockedSource.id, categoryMode: lockedRequest.categoryMode, categoryIds: lockedRequest.categoryIds, createdBy: input.actorUserId }).onConflictDoUpdate({ target: [mediaSourceSubscription.mediaId, mediaSourceSubscription.sourceId], set: { enabled: true, categoryMode: lockedRequest.categoryMode, categoryIds: lockedRequest.categoryIds } });
      const articles = await transaction.select({ id: rawArticle.id, status: rawArticle.status }).from(rawArticle).where(eq(rawArticle.sourceId, lockedSource.id));
      if (articles.length) await transaction.insert(mediaInboxItem).values(articles.map((article) => ({ id: `inbox_${randomUUID()}`, mediaId: lockedRequest.mediaId, rawArticleId: article.id, status: article.status }))).onConflictDoNothing();
      const [updated] = await transaction.update(sourceAccessRequest).set({ status: "access_granted", sourceId: lockedSource.id, reviewedBy: input.actorUserId, reviewedAt: new Date() }).where(eq(sourceAccessRequest.id, lockedRequest.id)).returning();
      await recordAuditEvent({ mediaId: lockedRequest.mediaId, actorUserId: input.actorUserId, action: "source_access_request.access_granted", targetType: "source_access_request", targetId: lockedRequest.id, correlationId: input.correlationId, metadata: { sourceId: lockedSource.id, categoryMode: lockedRequest.categoryMode, categoryCount: lockedRequest.categoryIds.length } }, transaction);
      return { id: updated.id, status: updated.status, sourceId: lockedSource.id, runId: null };
    });
  }

  let [existing] = await db.select().from(source).where(eq(source.url, normalizedUrl)).limit(1);
  if (existing?.archivedAt) {
    await restorePlatformSource({ sourceId: existing.id, actorUserId: input.actorUserId, correlationId: input.correlationId });
    [existing] = await db.select().from(source).where(eq(source.id, existing.id)).limit(1);
  }
  if (existing) {
    const ready = await db.select({ id: crawlerVersion.id }).from(crawlerDefinition).innerJoin(crawlerVersion, eq(crawlerVersion.definitionId, crawlerDefinition.id))
      .where(and(eq(crawlerDefinition.sourceId, existing.id), eq(crawlerVersion.status, "active"))).limit(1);
    if (ready.length) throw new PlatformSourceRequestError("کراولر این لینک آماده است؛ مسیر اعطای دسترسی به منبع موجود را انتخاب کنید.", 409);
    const result = await enqueueCrawlerBuild({ sourceId: existing.id, actorUserId: input.actorUserId, correlationId: input.correlationId, mode: "build", sourceAccessRequestId: input.requestId });
    if (!result) throw new PlatformSourceRequestError("منبع موجود تعریف کراولر ندارد؛ آن را در صفحهٔ منابع اصلاح کنید.", 409);
    return { id: input.requestId, status: "crawler_queued", sourceId: existing.id, runId: result.runId };
  }

  const created = await createPlatformSource({ actorUserId: input.actorUserId, correlationId: input.correlationId, sourceAccessRequestId: input.requestId, name: new URL(normalizedUrl).hostname, url: normalizedUrl, scheduleMinutes: 15, adapterKey: "web" });
  return { id: input.requestId, status: "crawler_queued", sourceId: created.sourceId, runId: created.runId };
}

async function reviewCategoryExtension(mediaId: string, input: { requestId: string; action: "reject" | "grant_existing" | "queue_crawler"; actorUserId: string; correlationId: string }) {
  if (input.action === "queue_crawler") throw new PlatformSourceRequestError("افزایش دسته‌بندی نیاز به ساخت کراولر تازه ندارد؛ دسترسی را تأیید یا رد کنید.", 409);
  return db.transaction(async tx => {
    await tx.select({ id: media.id }).from(media).where(eq(media.id, mediaId)).for("update");
    const [request] = await tx.select().from(sourceAccessRequest).where(and(eq(sourceAccessRequest.id, input.requestId), eq(sourceAccessRequest.mediaId, mediaId))).for("update");
    if (!request || request.status !== "pending" || request.kind !== "category_extension") throw new PlatformSourceRequestError("درخواست تغییر کرده یا از طرف ادمین حذف شده است.", 409);
    const [subscription] = await tx.select().from(mediaSourceSubscription).where(and(eq(mediaSourceSubscription.id, request.subscriptionId ?? ""), eq(mediaSourceSubscription.mediaId, mediaId), eq(mediaSourceSubscription.sourceId, request.sourceId ?? ""))).for("update");
    if (!subscription?.enabled) throw new PlatformSourceRequestError("منبع از رسانه حذف شده یا دسترسی آن فعال نیست.", 409);
    if (input.action === "grant_existing") {
      const categories = await tx.select({ id: platformCategory.id }).from(platformCategory).where(and(eq(platformCategory.active, true), inArray(platformCategory.id, request.categoryIds)));
      if (categories.length !== request.categoryIds.length) throw new PlatformSourceRequestError("یکی از دسته‌های درخواست‌شده غیرفعال شده است.", 409);
      const [activeSource] = await tx.select().from(source).where(eq(source.id, subscription.sourceId));
      if (!activeSource || activeSource.archivedAt || !activeSource.mediaDeliveryEnabled) throw new PlatformSourceRequestError("منبع فعلاً قابل ارائه نیست.", 409);
      await tx.update(mediaSourceSubscription).set({ categoryIds: subscription.categoryMode === "selected" ? [...new Set([...subscription.categoryIds, ...request.categoryIds])] : subscription.categoryIds }).where(eq(mediaSourceSubscription.id, subscription.id));
    }
    const status = input.action === "grant_existing" ? "access_granted" : "rejected";
    await tx.update(sourceAccessRequest).set({ status, reviewedBy: input.actorUserId, reviewedAt: new Date() }).where(eq(sourceAccessRequest.id, request.id));
    await recordAuditEvent({ mediaId, actorUserId: input.actorUserId, correlationId: input.correlationId, action: `source.categories.${status}`, targetType: "source_access_request", targetId: request.id, metadata: { categoryIds: request.categoryIds, sourceId: request.sourceId } }, tx);
    return { id: request.id, status, sourceId: request.sourceId, runId: null };
  });
}

