import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { crawlerDefinition, crawlerVersion, crawlRun, media, mediaInboxItem, mediaSourceSubscription, rawArticle, source, sourceAccessRequest } from "@/db/schema";
import { db } from "./database";
import { recordAuditEvent } from "./audit";
import { mediaIsApproved } from "./media-requests";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Match review/removal ordering: media before source, then requests/subscriptions.
export async function lockCrawlerAccessMedia(transaction: Transaction, sourceId: string) {
  const requests = await transaction.select({ mediaId: sourceAccessRequest.mediaId }).from(sourceAccessRequest).where(and(eq(sourceAccessRequest.sourceId, sourceId), inArray(sourceAccessRequest.status, ["crawler_queued", "crawler_failed"])));
  const ids = [...new Set(requests.map(request => request.mediaId))].sort();
  if (ids.length) await transaction.select({ id: media.id }).from(media).where(inArray(media.id, ids)).orderBy(media.id).for("update");
}

// The caller holds the source lock and has validated its active crawler version.
// A failed build retains the original review; it does not revoke that approval.
export async function grantValidatedCrawlerRequests(transaction: Transaction, sourceId: string, correlationId: string) {
  const [currentSource] = await transaction.select().from(source).where(eq(source.id, sourceId));
  if (!currentSource || currentSource.archivedAt || !currentSource.mediaDeliveryEnabled) return 0;
  const requests = await transaction.select().from(sourceAccessRequest).where(and(
    eq(sourceAccessRequest.sourceId, sourceId), eq(sourceAccessRequest.kind, "source_access"),
    inArray(sourceAccessRequest.status, ["crawler_queued", "crawler_failed"]),
    isNotNull(sourceAccessRequest.reviewedBy), isNotNull(sourceAccessRequest.reviewedAt),
  )).for("update");
  let granted = 0;
  for (const request of requests) {
    if (!await mediaIsApproved(request.mediaId, transaction)) continue;
    const [subscription] = await transaction.select().from(mediaSourceSubscription).where(and(eq(mediaSourceSubscription.mediaId, request.mediaId), eq(mediaSourceSubscription.sourceId, sourceId))).for("update");
    // Recovery must neither restore a disabled grant nor overwrite a newer scope.
    if (request.status === "crawler_failed" && subscription && !subscription.enabled) continue;
    const values = { id: `subscription_${randomUUID()}`, mediaId: request.mediaId, sourceId, categoryMode: request.categoryMode, categoryIds: request.categoryIds, createdBy: request.reviewedBy };
    if (request.status === "crawler_failed") await transaction.insert(mediaSourceSubscription).values(values).onConflictDoNothing();
    else await transaction.insert(mediaSourceSubscription).values(values).onConflictDoUpdate({ target: [mediaSourceSubscription.mediaId, mediaSourceSubscription.sourceId], set: { enabled: true, categoryMode: request.categoryMode, categoryIds: request.categoryIds } });
    const articles = await transaction.select({ id: rawArticle.id, status: rawArticle.status }).from(rawArticle).where(eq(rawArticle.sourceId, sourceId));
    if (articles.length) await transaction.insert(mediaInboxItem).values(articles.map(article => ({ id: `inbox_${randomUUID()}`, mediaId: request.mediaId, rawArticleId: article.id, status: article.status }))).onConflictDoNothing();
    await transaction.update(sourceAccessRequest).set({ status: "access_granted" }).where(eq(sourceAccessRequest.id, request.id));
    await recordAuditEvent({ mediaId: request.mediaId, actorUserId: request.reviewedBy, action: "source_access_request.access_granted_after_crawler", targetType: "source_access_request", targetId: request.id, correlationId, metadata: { sourceId, previousStatus: request.status } }, transaction);
    granted++;
  }
  return granted;
}

// Repair historical missed transitions on startup, through the sole DB owner.
// Only an active version with a successful validation run is evidence of recovery.
export async function recoverValidatedSourceAccess() {
  const candidates = await db.selectDistinct({ id: sourceAccessRequest.sourceId }).from(sourceAccessRequest).where(eq(sourceAccessRequest.status, "crawler_failed"));
  let recovered = 0;
  for (const candidate of candidates) {
    if (!candidate.id) continue;
    recovered += await db.transaction(async transaction => {
      const sourceId = candidate.id!;
      await lockCrawlerAccessMedia(transaction, sourceId);
      const [currentSource] = await transaction.select().from(source).where(and(eq(source.id, sourceId), isNull(source.archivedAt), eq(source.mediaDeliveryEnabled, true), inArray(source.status, ["active", "paused", "degraded"]))).for("update");
      if (!currentSource) return 0;
      const [validation] = await transaction.select({ id: crawlRun.id }).from(crawlerDefinition)
        .innerJoin(crawlerVersion, eq(crawlerVersion.definitionId, crawlerDefinition.id))
        .innerJoin(crawlRun, eq(crawlRun.crawlerVersionId, crawlerVersion.id))
        .where(and(eq(crawlerDefinition.sourceId, currentSource.id), eq(crawlerVersion.status, "active"), eq(crawlRun.status, "succeeded"), inArray(crawlRun.trigger, ["build", "debug"])));
      return validation ? grantValidatedCrawlerRequests(transaction, currentSource.id, `crawler-access-recovery:${validation.id}`) : 0;
    });
  }
  return recovered;
}
