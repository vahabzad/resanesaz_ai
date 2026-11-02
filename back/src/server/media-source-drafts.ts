import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { editorialSection, media, platformCategory, sourceAccessRequest } from "@/db/schema";
import { db } from "./database";
import { recordAuditEvent } from "./audit";
import { MediaSetupError } from "./media-setup";
import { sourceRequestKey, type SourceAccessInput } from "../../contracts/src/media-setup";

export function setupIsComplete(metadata: string | null) {
  try { return JSON.parse(metadata ?? "{}").setupPreferences?.setupCompleted === true; }
  catch { return false; }
}

export async function removeSourceDraft(mediaId: string, requestId: string, actorUserId: string, correlationId: string) {
  return db.transaction(async tx => {
    // Completion, creation and deletion all lock the same Media before its requests.
    const [owner] = await tx.select({ metadata: media.metadata }).from(media).where(eq(media.id, mediaId)).for("update");
    if (!owner) throw new MediaSetupError("رسانه پیدا نشد.", 404);
    if (setupIsComplete(owner.metadata)) throw new MediaSetupError("منابع این رسانه برای بررسی ارسال شده‌اند و دیگر پیش‌نویس نیستند.", 409);
    const [removed] = await tx.update(sourceAccessRequest).set({ status: "withdrawn" }).where(and(eq(sourceAccessRequest.id, requestId), eq(sourceAccessRequest.mediaId, mediaId), inArray(sourceAccessRequest.status, ["draft", "pending"]))).returning();
    if (!removed) throw new MediaSetupError("پیش‌نویس منبع پیدا نشد یا قبلاً بررسی شده است.", 404);
    await recordAuditEvent({ mediaId, actorUserId, action: "source_access_request.draft_removed", targetType: "source_access_request", targetId: removed.id, correlationId }, tx);
    return { id: removed.id };
  });
}

export async function updateSourceDraft(mediaId: string, requestId: string, actorUserId: string, correlationId: string, input: SourceAccessInput) {
  return db.transaction(async tx => {
    const [owner] = await tx.select({ metadata: media.metadata }).from(media).where(eq(media.id, mediaId)).for("update");
    if (!owner) throw new MediaSetupError("رسانه پیدا نشد.", 404);
    if (setupIsComplete(owner.metadata)) throw new MediaSetupError("منابع برای بررسی ارسال شده‌اند؛ ویرایش پیش‌نویس ممکن نیست.", 409);
    const [previous] = await tx.select().from(sourceAccessRequest).where(and(eq(sourceAccessRequest.id, requestId), eq(sourceAccessRequest.mediaId, mediaId), inArray(sourceAccessRequest.status, ["draft", "pending"]))).for("update");
    if (!previous) throw new MediaSetupError("پیش‌نویس منبع پیدا نشد یا قبلاً بررسی شده است.", 404);
    const url = new URL(input.url).toString();
    const others = await tx.select({ url: sourceAccessRequest.url }).from(sourceAccessRequest).where(and(eq(sourceAccessRequest.mediaId, mediaId), ne(sourceAccessRequest.id, requestId), ne(sourceAccessRequest.status, "withdrawn")));
    if (others.some(row => sourceRequestKey(row.url) === sourceRequestKey(url))) throw new MediaSetupError("این منبع را قبلاً به همین رسانه اضافه کرده‌اید؛ ثبت تکراری ممکن نیست.", 409);
    const categoryIds = input.sourceType === "website" && input.categoryMode === "selected" ? input.categoryIds ?? [] : [];
    if (categoryIds.length) {
      const valid = await tx.select({ id: platformCategory.id }).from(platformCategory).where(and(eq(platformCategory.active, true), inArray(platformCategory.id, categoryIds)));
      if (valid.length !== categoryIds.length) throw new MediaSetupError("یکی از دسته‌بندی‌های انتخاب‌شده دیگر فعال نیست؛ انتخاب را اصلاح کنید.", 400);
    }
    const [updated] = await tx.update(sourceAccessRequest).set({ sourceType: input.sourceType, url, name: new URL(url).hostname, categoryMode: input.sourceType === "website" ? input.categoryMode : null, categoryIds, status: "draft", sourceId: null, platform: null, reviewedBy: null, reviewedAt: null }).where(eq(sourceAccessRequest.id, previous.id)).returning();
    if (previous.url !== url) {
      const sections = await tx.select().from(editorialSection).where(and(eq(editorialSection.mediaId, mediaId), eq(editorialSection.archived, false)));
      for (const section of sections) {
        const urls = section.settings.sourceUrls ?? [];
        if (!urls.some(item => sourceRequestKey(item) === sourceRequestKey(previous.url))) continue;
        const sourceUrls = [...new Set(urls.map(item => sourceRequestKey(item) === sourceRequestKey(previous.url) ? url : item))];
        await tx.update(editorialSection).set({ settings: { ...section.settings, sourceUrls }, revision: sql`${editorialSection.revision} + 1` }).where(eq(editorialSection.id, section.id));
      }
    }
    await recordAuditEvent({ mediaId, actorUserId, action: "source_access_request.draft_updated", targetType: "source_access_request", targetId: requestId, correlationId, metadata: { sourceType: updated.sourceType, categoryMode: updated.categoryMode, categoryCount: updated.categoryIds.length } }, tx);
    return updated;
  });
}
