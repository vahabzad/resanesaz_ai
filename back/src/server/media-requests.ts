import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { editorialSection, media, mediaCreationRequest, mediaSite, platformCategory, sourceAccessRequest, user } from "@/db/schema";
import { db } from "./database";
import { recordAuditEvent } from "./audit";
import type { MediaRequest } from "../../contracts/src/media-requests";

export class MediaRequestError extends Error { constructor(message: string, readonly status = 409) { super(message); } }
type Reader = Pick<typeof db, "select">;
export const mediaRequestsInput = z.object({ status: z.enum(["pending", "approved", "rejected", "all"]).default("pending"), page: z.coerce.number().int().min(1).max(100000).default(1), q: z.string().trim().max(100).default("") }).strict();
export const mediaReviewInput = z.object({ expectedRevision: z.number().int().min(1), action: z.enum(["approve", "reject"]), note: z.string().trim().max(2000).default("") }).strict().refine(value => value.action !== "reject" || value.note.length >= 3, "دلیل رد درخواست را بنویسید.");
// Recover completed forms from older installations without approving any media.
export async function enrollCompletedMediaRequests() {
  await db.execute(sql`INSERT INTO media_creation_request (media_id, requested_by, submitted_at)
    SELECT m.id, owner.user_id, now() FROM media m
    LEFT JOIN LATERAL (SELECT user_id FROM membership WHERE organization_id = m.id AND role = 'owner' ORDER BY created_at, id LIMIT 1) owner ON true
    WHERE m.metadata IS NOT NULL AND m.metadata::jsonb #>> '{setupPreferences,setupCompleted}' = 'true'
    ON CONFLICT (media_id) DO NOTHING`);
}
export async function mediaRequestStatus(mediaId: string, reader: Reader = db): Promise<MediaRequest> {
  const [row] = await reader.select().from(mediaCreationRequest).where(eq(mediaCreationRequest.mediaId, mediaId)).limit(1);
  return row ? { mediaId, status: row.status, revision: row.revision, submittedAt: row.submittedAt.toISOString(), reviewedAt: row.reviewedAt?.toISOString() ?? null, reviewNote: row.reviewNote } : { mediaId, status: "draft", revision: 0, submittedAt: null, reviewedAt: null, reviewNote: null };
}
export async function mediaIsApproved(mediaId: string, reader: Reader = db) { return (await mediaRequestStatus(mediaId, reader)).status === "approved"; }
export async function requireApprovedMedia(mediaId: string, reader: Reader = db) {
  if (!await mediaIsApproved(mediaId, reader)) throw new MediaRequestError("درخواست ایجاد رسانه هنوز تأیید سوپر ادمین را ندارد؛ سایت‌ساز تا تأیید فعال نمی‌شود.", 403);
}
export async function listMediaRequests(input: z.infer<typeof mediaRequestsInput>) {
  const conditions = [];
  if (input.status !== "all") conditions.push(eq(mediaCreationRequest.status, input.status));
  if (input.q) {
    const pattern = `%${input.q.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    conditions.push(or(ilike(media.name, pattern), ilike(user.name, pattern))!);
  }
  const [total] = await db.select({ value: count() }).from(mediaCreationRequest).innerJoin(media, eq(media.id, mediaCreationRequest.mediaId)).leftJoin(user, eq(user.id, mediaCreationRequest.requestedBy)).where(and(...conditions));
  const [pending] = await db.select({ value: count() }).from(mediaCreationRequest).where(eq(mediaCreationRequest.status, "pending"));
  const pageCount = Math.max(1, Math.ceil(Number(total.value) / 20)); const page = Math.min(input.page, pageCount);
  const rows = await db.select({ request: mediaCreationRequest, mediaName: media.name, requestedBy: user.name, requesterEmail: user.email }).from(mediaCreationRequest).innerJoin(media, eq(media.id, mediaCreationRequest.mediaId)).leftJoin(user, eq(user.id, mediaCreationRequest.requestedBy)).where(and(...conditions)).orderBy(desc(mediaCreationRequest.submittedAt), mediaCreationRequest.mediaId).limit(20).offset((page - 1) * 20);
  const ids = rows.map(row => row.request.mediaId);
  const [sites, sources, editors, categories] = ids.length ? await Promise.all([
    db.select().from(mediaSite).where(inArray(mediaSite.mediaId, ids)),
    db.select({ mediaId: sourceAccessRequest.mediaId, url: sourceAccessRequest.url, sourceType: sourceAccessRequest.sourceType, categoryMode: sourceAccessRequest.categoryMode, categoryIds: sourceAccessRequest.categoryIds, status: sourceAccessRequest.status }).from(sourceAccessRequest).where(and(inArray(sourceAccessRequest.mediaId, ids), eq(sourceAccessRequest.kind, "source_access"))),
    db.select({ mediaId: editorialSection.mediaId, name: editorialSection.name }).from(editorialSection).where(and(inArray(editorialSection.mediaId, ids), eq(editorialSection.archived, false))),
    db.select({ id: platformCategory.id, name: platformCategory.nameFa }).from(platformCategory),
  ]) : [[], [], [], []];
  return { pending: Number(pending.value), total: Number(total.value), page, pageCount, rows: rows.map(({ request, ...row }) => ({ ...request, ...row, submittedAt: request.submittedAt.toISOString(), reviewedAt: request.reviewedAt?.toISOString() ?? null,
    sites: sites.filter(site => site.mediaId === request.mediaId).map(site => ({ name: site.name, slug: site.slug, topics: site.spec.designBrief?.mediaTopics ?? [], audience: site.spec.designBrief?.targetAudience ?? [], categories: site.spec.designBrief?.categories ?? [], style: site.spec.designBrief?.design.style ?? (site.spec.layout === "lead" ? "خبر اصلی" : "شبکه‌ای"), notes: site.spec.designBrief?.additionalNotes ?? "" })),
    sources: sources.filter(source => source.mediaId === request.mediaId && source.status !== "withdrawn").map(({ url, sourceType, categoryMode, categoryIds }) => ({ url, sourceType, categoryMode, categories: categoryIds.map(id => ({ id, name: categories.find(category => category.id === id)?.name ?? null })) })), editors: editors.filter(editor => editor.mediaId === request.mediaId).map(editor => editor.name),
  })) };
}
export async function reviewMediaRequest(mediaId: string, actorUserId: string, correlationId: string, input: z.infer<typeof mediaReviewInput>) {
  return db.transaction(async tx => {
    await tx.select({ id: media.id }).from(media).where(eq(media.id, mediaId)).for("update");
    const [row] = await tx.select().from(mediaCreationRequest).where(eq(mediaCreationRequest.mediaId, mediaId)).for("update");
    if (!row) throw new MediaRequestError("درخواست رسانه پیدا نشد.", 404);
    if (row.status !== "pending" || row.revision !== input.expectedRevision) throw new MediaRequestError("این درخواست قبلاً بررسی یا تغییر کرده است؛ فهرست را تازه‌سازی کنید.");
    const status = input.action === "approve" ? "approved" : "rejected";
    await tx.update(mediaCreationRequest).set({ status, revision: row.revision + 1, reviewedBy: actorUserId, reviewedAt: new Date(), reviewNote: input.note || null }).where(eq(mediaCreationRequest.mediaId, mediaId));
    await recordAuditEvent({ mediaId, actorUserId, correlationId, action: `media.request.${status}`, targetType: "media", targetId: mediaId, metadata: { revision: row.revision + 1, note: input.note } }, tx);
    return { mediaId, status, revision: row.revision + 1 };
  });
}


