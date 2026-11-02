import { randomUUID } from "node:crypto";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { editorialJob, media, mediaSourceSubscription, platformCategory, rawArticle, source, sourceAccessRequest } from "@/db/schema";
import { db } from "./database";
import { MediaSetupError } from "./media-setup";
import { recordAuditEvent } from "./audit";
import { sourceRequestKey } from "../../contracts/src/media-setup";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const additionalCategoriesInput = z.object({ categoryIds: z.array(z.string().min(1).max(128)).min(1).max(100).refine(ids => new Set(ids).size === ids.length) }).strict();

async function resolve(tx: Tx, mediaId: string, rowId: string) {
  const [owner] = await tx.select({ id: media.id }).from(media).where(eq(media.id, mediaId)).for("update");
  if (!owner) throw new MediaSetupError("رسانه پیدا نشد.", 404);
  const [request] = await tx.select().from(sourceAccessRequest).where(and(eq(sourceAccessRequest.mediaId, mediaId), eq(sourceAccessRequest.id, rowId), eq(sourceAccessRequest.kind, "source_access"), ne(sourceAccessRequest.status, "withdrawn"))).for("update");
  const subscriptions = await tx.select({ subscription: mediaSourceSubscription, source }).from(mediaSourceSubscription).innerJoin(source, eq(source.id, mediaSourceSubscription.sourceId)).where(eq(mediaSourceSubscription.mediaId, mediaId));
  const linked = subscriptions.find(item => request ? item.source.id === request.sourceId || sourceRequestKey(item.source.url) === sourceRequestKey(request.url) : item.subscription.id === rowId && item.subscription.enabled);
  if (!request && !linked) throw new MediaSetupError("منبع در فهرست این رسانه پیدا نشد.", 404);
  return { request, linked, url: request?.url ?? linked!.source.url };
}
export async function requestAdditionalCategories(mediaId: string, rowId: string, actorUserId: string, correlationId: string, categoryIds: string[]) {
  return db.transaction(async tx => {
    const { linked, request } = await resolve(tx, mediaId, rowId);
    if (!linked?.subscription.enabled && request && request.sourceType === "website" && request.categoryMode === "selected" && ["draft", "pending", "crawler_queued", "crawler_failed"].includes(request.status)) {
      if (categoryIds.some(id => request.categoryIds.includes(id))) throw new MediaSetupError("این دسته قبلاً در درخواست منبع انتخاب شده است.", 409);
      const valid = await tx.select({ id: platformCategory.id }).from(platformCategory).where(and(eq(platformCategory.active, true), inArray(platformCategory.id, categoryIds)));
      if (valid.length !== categoryIds.length) throw new MediaSetupError("دسته‌ها را از کاتالوگ فعال انتخاب کنید.", 400);
      await tx.update(sourceAccessRequest).set({ categoryIds: [...new Set([...request.categoryIds, ...categoryIds])] }).where(eq(sourceAccessRequest.id, request.id));
      await recordAuditEvent({ mediaId, actorUserId, correlationId, action: "source.categories.pending_request_expanded", targetType: "source_access_request", targetId: request.id, metadata: { categoryIds } }, tx);
      return { id: request.id };
    }
    if (request?.sourceType === "social" || !linked?.subscription.enabled || linked.source.archivedAt || !linked.source.mediaDeliveryEnabled) throw new MediaSetupError("افزایش دسته‌بندی فقط برای منبع وب‌سایت با دسترسی فعال ممکن است.", 409);
    const current = linked.subscription;
    if (current.categoryMode !== "selected") throw new MediaSetupError("دسترسی شما شامل همهٔ دسته‌هاست.", 409);
    if (categoryIds.some(id => current.categoryIds.includes(id))) throw new MediaSetupError("برای دسته‌های دارای دسترسی، درخواست دوباره ثبت نکنید.", 409);
    const valid = await tx.select({ id: platformCategory.id }).from(platformCategory).where(and(eq(platformCategory.active, true), inArray(platformCategory.id, categoryIds)));
    if (valid.length !== categoryIds.length) throw new MediaSetupError("دسته‌ها را از کاتالوگ فعال سوپر ادمین انتخاب کنید.", 400);
    const pending = await tx.select().from(sourceAccessRequest).where(and(eq(sourceAccessRequest.mediaId, mediaId), eq(sourceAccessRequest.subscriptionId, current.id), eq(sourceAccessRequest.kind, "category_extension"), eq(sourceAccessRequest.status, "pending")));
    if (pending.some(row => row.categoryIds.some(id => categoryIds.includes(id)))) throw new MediaSetupError("درخواست این دسته قبلاً ثبت شده و در انتظار بررسی است.", 409);
    const [created] = await tx.insert(sourceAccessRequest).values({ id: `sar_${randomUUID()}`, mediaId, requestedBy: actorUserId, kind: "category_extension", subscriptionId: current.id, sourceId: linked.source.id, sourceType: "website", name: linked.source.name, url: linked.source.url, categoryMode: "selected", categoryIds, status: "pending" }).returning();
    await recordAuditEvent({ mediaId, actorUserId, correlationId, action: "source.categories.requested", targetType: "source_access_request", targetId: created.id, metadata: { categoryIds, sourceId: linked.source.id } }, tx);
    return { id: created.id };
  });
}
export async function removeMediaSource(mediaId: string, rowId: string, actorUserId: string, correlationId: string) {
  return db.transaction(async tx => {
    const { linked, url } = await resolve(tx, mediaId, rowId);
    const rows = await tx.select({ id: sourceAccessRequest.id, url: sourceAccessRequest.url, sourceId: sourceAccessRequest.sourceId }).from(sourceAccessRequest).where(and(eq(sourceAccessRequest.mediaId, mediaId), ne(sourceAccessRequest.status, "withdrawn"))).for("update");
    const ids = rows.filter(row => sourceRequestKey(row.url) === sourceRequestKey(url) || (linked && row.sourceId === linked.source.id)).map(row => row.id);
    if (ids.length) await tx.update(sourceAccessRequest).set({ status: "withdrawn" }).where(inArray(sourceAccessRequest.id, ids));
    if (linked) {
      await tx.update(mediaSourceSubscription).set({ enabled: false }).where(eq(mediaSourceSubscription.id, linked.subscription.id));
      const articles = await tx.select({ id: rawArticle.id }).from(rawArticle).where(eq(rawArticle.sourceId, linked.source.id));
      if (articles.length) await tx.update(editorialJob).set({ status: "cancelled", errorCode: "SOURCE_UNSUBSCRIBED", finishedAt: new Date(), claimToken: null, leaseUntil: null }).where(and(eq(editorialJob.mediaId, mediaId), inArray(editorialJob.rawArticleId, articles.map(row => row.id)), inArray(editorialJob.status, ["queued", "running"])));
    }
    await recordAuditEvent({ mediaId, actorUserId, correlationId, action: "media.source.removed", targetType: "media_source", targetId: rowId, metadata: { sourceId: linked?.source.id ?? null, withdrawnRequestIds: ids } }, tx);
    return { id: rowId };
  });
}
