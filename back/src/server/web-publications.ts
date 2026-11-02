import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { articleVersion, editorialApproval, editorialStory, mediaSite, membership, siteArticle, webPublicationJob, publicationRule, storyPublicationPolicy } from "@/db/schema";
import { db } from "./database";
import { mediaIsApproved, requireApprovedMedia } from "./media-requests";
import { recordAuditEvent } from "./audit";
import { mediaRoles, type MediaRole } from "./permissions";
import { captureWebSnapshot, SiteError, type SiteActor } from "./sites";
import { publishedPrimary, resolveDelivery } from "./publication-policy";

export const publicationInput = z.object({ siteId: z.string().min(1).max(128), versionId: z.string().min(1).max(128), scheduledAt: z.iso.datetime({ offset: true }).optional(), role: z.enum(["primary", "republication", "summary"]).optional() }).strict();
export const publicationRescheduleInput = z.object({ scheduledAt: z.iso.datetime({ offset: true }), expectedScheduledAt: z.iso.datetime({ offset: true }) }).strict();
export const publicationListInput = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), status: z.enum(["queued", "succeeded", "failed", "cancelled"]).optional(), siteId: z.string().min(1).max(128).optional() }).strict();

export async function enqueueWebPublication(actor: SiteActor, input: z.infer<typeof publicationInput>, automatic?: { id: string; revision: number }) {
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
  if (input.scheduledAt && scheduledAt.getTime() < Date.now() - 5000) throw new SiteError("زمان انتشار گذشته است؛ زمان آینده را انتخاب کنید.", 400);
  return db.transaction(async tx => {
    await requireApprovedMedia(actor.mediaId, tx);
    const [site] = await tx.select().from(mediaSite).where(and(eq(mediaSite.id, input.siteId), eq(mediaSite.mediaId, actor.mediaId))).for("update");
    if (!site) throw new SiteError("سایت پیدا نشد.", 404);
    const [existing] = await tx.select().from(webPublicationJob).where(and(eq(webPublicationJob.mediaId, actor.mediaId), eq(webPublicationJob.siteId, site.id), eq(webPublicationJob.versionId, input.versionId)));
    if (existing) return { id: existing.id, duplicate: true };
    if (site.status !== "live") throw new SiteError("برای انتشار، سایت را فعال کنید.");
    if (automatic) {
      const [rule] = await tx.select().from(publicationRule).where(and(eq(publicationRule.id, automatic.id), eq(publicationRule.mediaId, actor.mediaId), eq(publicationRule.siteId, site.id), eq(publicationRule.revision, automatic.revision), eq(publicationRule.enabled, true)));
      if (!rule || rule.settings.mode !== "automatic" || rule.actorUserId !== actor.actorUserId) throw new SiteError("قاعدهٔ انتشار تغییر کرده یا متوقف شده است.");
      const [member] = await tx.select().from(membership).where(and(eq(membership.organizationId, actor.mediaId), eq(membership.userId, actor.actorUserId)));
      if (!member || !mediaRoles[member.role as MediaRole]?.authorize({ publication: ["create"] }).success) throw new SiteError("مجوز مالک قاعده تغییر کرده است.");
    }
    const snapshot = await captureWebSnapshot(actor.mediaId, input.versionId, tx);
    // Serialize with editorial approval/version changes, then recheck under the lock.
    const [story] = await tx.select().from(editorialStory).where(and(eq(editorialStory.id, snapshot.storyId), eq(editorialStory.mediaId, actor.mediaId))).for("update");
    if (!story || story.status !== "approved" || story.revision !== snapshot.revision) throw new SiteError("تأیید خبر تغییر کرده؛ نسخهٔ تازه را بررسی کنید.");
    snapshot.delivery = await resolveDelivery(actor.mediaId, story.id, site.id, input.role, tx);
    const [pending] = await tx.select({ count: sql<number>`count(*)::int` }).from(webPublicationJob).where(and(eq(webPublicationJob.mediaId, actor.mediaId), eq(webPublicationJob.status, "queued")));
    if (pending.count >= 500) throw new SiteError("صف انتشار رسانه پر است؛ ابتدا کارهای باز را تعیین تکلیف کنید.");
    const [job] = await tx.insert(webPublicationJob).values({ id: randomUUID(), mediaId: actor.mediaId, siteId: site.id, storyId: snapshot.storyId, versionId: input.versionId, snapshot, scheduledAt, requestedBy: actor.actorUserId, ruleId: automatic?.id ?? null }).onConflictDoNothing().returning();
    if (!job) throw new SiteError("این نسخه قبلاً برای این سایت ثبت شده است.");
    await recordAuditEvent({ ...actor, action: "publication.scheduled", targetType: "web_publication", targetId: job.id, metadata: { siteId: site.id, versionId: input.versionId, scheduledAt: scheduledAt.toISOString() } }, tx);
    return { id: job.id, duplicate: false };
  });
}

export async function publicationWorkspace(mediaId: string, input: z.infer<typeof publicationListInput>) {
  const conditions = [eq(webPublicationJob.mediaId, mediaId)];
  if (input.status) conditions.push(eq(webPublicationJob.status, input.status));
  if (input.siteId) conditions.push(eq(webPublicationJob.siteId, input.siteId));
  const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(webPublicationJob).where(and(...conditions));
  const pageCount = Math.max(1, Math.ceil(count.count / 20)); const page = Math.min(input.page, pageCount);
  const jobs = await db.select({ id: webPublicationJob.id, siteId: mediaSite.id, siteName: mediaSite.name, siteSlug: mediaSite.slug, siteStatus: mediaSite.status, storyId: webPublicationJob.storyId, versionId: webPublicationJob.versionId, title: sql<string>`${webPublicationJob.snapshot}->'webCard'->>'title'`, revision: sql<number>`(${webPublicationJob.snapshot}->>'revision')::int`, status: webPublicationJob.status, attempts: webPublicationJob.attempts, scheduledAt: webPublicationJob.scheduledAt, finishedAt: webPublicationJob.finishedAt, errorCode: webPublicationJob.errorCode, resultPath: webPublicationJob.resultPath,
    role: sql<string>`coalesce(${webPublicationJob.snapshot}->'delivery'->>'role', CASE WHEN EXISTS (SELECT 1 FROM ${storyPublicationPolicy} WHERE ${storyPublicationPolicy.storyId} = ${webPublicationJob.storyId} AND ${storyPublicationPolicy.mediaId} = ${mediaId} AND ${storyPublicationPolicy.primarySiteId} = ${webPublicationJob.siteId}) THEN 'primary' ELSE 'republication' END)`, ruleName: publicationRule.name, isWithdrawn: sql<boolean>`${siteArticle.withdrawnAt} IS NOT NULL`, publishedVersionId: siteArticle.versionId })
    .from(webPublicationJob).innerJoin(mediaSite, and(eq(mediaSite.id, webPublicationJob.siteId), eq(mediaSite.mediaId, mediaId)))
    .leftJoin(publicationRule, and(eq(publicationRule.id, webPublicationJob.ruleId), eq(publicationRule.mediaId, mediaId)))
    .leftJoin(siteArticle, and(eq(siteArticle.siteId, webPublicationJob.siteId), eq(siteArticle.storyId, webPublicationJob.storyId), eq(siteArticle.mediaId, mediaId)))
    .where(and(...conditions)).orderBy(desc(webPublicationJob.createdAt), desc(webPublicationJob.id)).limit(20).offset((page - 1) * 20);
  const counts = await db.select({ status: webPublicationJob.status, count: sql<number>`count(*)::int` }).from(webPublicationJob).where(eq(webPublicationJob.mediaId, mediaId)).groupBy(webPublicationJob.status);
  return { jobs, counts, pagination: { page, pageSize: 20, total: count.count, pageCount } };
}

export async function changeWebPublication(actor: SiteActor, id: string, action: "retry" | "cancel" | "reschedule", schedule?: z.infer<typeof publicationRescheduleInput>) {
  if (action === "reschedule" && (!schedule || Date.parse(schedule.scheduledAt) < Date.now())) throw new SiteError("زمان تازه باید در آینده باشد.", 400);
  return db.transaction(async tx => {
    const [candidate] = await tx.select().from(webPublicationJob).where(and(eq(webPublicationJob.id, id), eq(webPublicationJob.mediaId, actor.mediaId)));
    if (!candidate) throw new SiteError("کار انتشار پیدا نشد.", 404);
    // Site → story → job is the common lock order for scheduling, workers and pause/cancel.
    const [site] = await tx.select().from(mediaSite).where(and(eq(mediaSite.id, candidate.siteId), eq(mediaSite.mediaId, actor.mediaId))).for("update");
    if (action !== "cancel") {
      if (!site || site.status !== "live") throw new SiteError("سایت متوقف است؛ ابتدا آن را فعال کنید.");
      const [story] = await tx.select().from(editorialStory).where(and(eq(editorialStory.id, candidate.storyId), eq(editorialStory.mediaId, actor.mediaId))).for("update");
      if (!story || story.status !== "approved" || story.revision !== candidate.snapshot.revision) throw new SiteError("نسخهٔ این کار دیگر آخرین نسخهٔ تأییدشده نیست؛ نسخهٔ تازه را برای انتشار انتخاب کنید.");
      if (candidate.attempts >= 3) throw new SiteError("سه تلاش انجام شده است؛ کار نیازمند بررسی است.");
    }
    const [updated] = await tx.update(webPublicationJob).set(action !== "cancel" ? { status: "queued", scheduledAt: action === "reschedule" ? new Date(schedule!.scheduledAt) : new Date(), requestedBy: actor.actorUserId, ruleId: null, finishedAt: null, errorCode: null } : { status: "cancelled", finishedAt: new Date(), errorCode: null })
      .where(and(eq(webPublicationJob.id, id), eq(webPublicationJob.mediaId, actor.mediaId), inArray(webPublicationJob.status, action === "reschedule" ? ["queued", "failed", "cancelled"] : action === "retry" ? ["failed", "cancelled"] : ["queued"]), ...(action !== "cancel" ? [sql`${webPublicationJob.attempts} < 3`] : []), ...(action === "reschedule" ? [eq(webPublicationJob.scheduledAt, new Date(schedule!.expectedScheduledAt))] : []))).returning();
    if (!updated) throw new SiteError("وضعیت کار تغییر کرده؛ صف را تازه کنید.");
    await recordAuditEvent({ ...actor, action: `publication.${action}`, targetType: "web_publication", targetId: id }, tx);
    return { id };
  });
}

export async function runWebPublicationCycle(now = new Date()) {
  const candidates = await db.select({ id: webPublicationJob.id, siteId: webPublicationJob.siteId, mediaId: webPublicationJob.mediaId }).from(webPublicationJob).where(and(eq(webPublicationJob.status, "queued"), lte(webPublicationJob.scheduledAt, now))).orderBy(asc(webPublicationJob.scheduledAt), asc(webPublicationJob.id)).limit(100);
  let processed = 0;
  for (const candidate of candidates) {
    processed += await db.transaction(async tx => {
      const [site] = await tx.select().from(mediaSite).where(and(eq(mediaSite.id, candidate.siteId), eq(mediaSite.mediaId, candidate.mediaId))).for("update");
      const [initial] = await tx.select().from(webPublicationJob).where(and(eq(webPublicationJob.id, candidate.id), eq(webPublicationJob.mediaId, candidate.mediaId)));
      if (!initial || initial.status !== "queued" || initial.scheduledAt > now) return 0;
      const [story] = await tx.select().from(editorialStory).where(and(eq(editorialStory.id, initial.storyId), eq(editorialStory.mediaId, initial.mediaId))).for("update");
      const [job] = await tx.select().from(webPublicationJob).where(and(eq(webPublicationJob.id, candidate.id), eq(webPublicationJob.status, "queued"))).for("update");
      if (!job) return 0;
      const [member] = await tx.select().from(membership).where(and(eq(membership.organizationId, job.mediaId), eq(membership.userId, job.requestedBy ?? ""))).for("update");
      const [approval] = await tx.select({ id: editorialApproval.id }).from(editorialApproval).where(and(eq(editorialApproval.mediaId, job.mediaId), eq(editorialApproval.versionId, job.versionId), eq(editorialApproval.decision, "approved"))).limit(1);
      let errorCode: string | null = null;
      if (!await mediaIsApproved(job.mediaId, tx)) errorCode = "MEDIA_NOT_APPROVED";
      else if (!site || site.status !== "live") errorCode = "SITE_STOPPED";
      else if (!member || !mediaRoles[member.role as MediaRole]?.authorize({ publication: ["create"] }).success) errorCode = "ACCESS_REVOKED";
      else if (!story || story.status !== "approved" || story.revision !== job.snapshot.revision || !approval) errorCode = "APPROVAL_CHANGED";
      if (!errorCode && job.ruleId) {
        const [rule] = await tx.select().from(publicationRule).where(and(eq(publicationRule.id, job.ruleId), eq(publicationRule.mediaId, job.mediaId)));
        if (!rule?.enabled || rule.settings.mode !== "automatic") errorCode = "RULE_STOPPED";
      }
      const snapshot = { ...job.snapshot };
      if (!errorCode) {
        try { snapshot.delivery = await resolveDelivery(job.mediaId, job.storyId, job.siteId, snapshot.delivery?.role, tx); }
        catch (error) { if (error instanceof SiteError) errorCode = "PRIMARY_CONFLICT"; else throw error; }
      }
      if (!errorCode && snapshot.delivery?.role === "summary") {
        const primary = await publishedPrimary(job.mediaId, job.storyId, snapshot.delivery.primarySiteId, tx);
        const [primaryDestination] = snapshot.delivery.primarySiteId ? await tx.select().from(mediaSite).where(and(eq(mediaSite.id, snapshot.delivery.primarySiteId), eq(mediaSite.mediaId, job.mediaId))) : [];
        if (!primary || primaryDestination?.status !== "live") {
          await tx.update(webPublicationJob).set({ scheduledAt: new Date(now.getTime() + 30000), errorCode: "WAITING_PRIMARY" }).where(eq(webPublicationJob.id, job.id));
          return 0;
        }
        snapshot.webFull = { ...snapshot.webFull, body: snapshot.webCard.summary };
      }
      const resultPath = `/s/${site?.slug}/news/${job.storyId}`;
      if (!errorCode) {
        await tx.insert(siteArticle).values({ id: randomUUID(), mediaId: job.mediaId, siteId: job.siteId, storyId: job.storyId, versionId: job.versionId, snapshot, publishedAt: now, modifiedAt: now })
          .onConflictDoUpdate({ target: [siteArticle.siteId, siteArticle.storyId], set: { versionId: job.versionId, snapshot, modifiedAt: now, withdrawnAt: null } });
      }
      await tx.update(webPublicationJob).set({ status: errorCode ? "failed" : "succeeded", snapshot, attempts: job.attempts + 1, errorCode, resultPath: errorCode ? null : resultPath, finishedAt: now }).where(eq(webPublicationJob.id, job.id));
      await recordAuditEvent({ mediaId: job.mediaId, actorUserId: job.requestedBy, correlationId: job.id, action: errorCode ? "publication.failed" : "publication.succeeded", targetType: "web_publication", targetId: job.id, metadata: { siteId: job.siteId, versionId: job.versionId, errorCode } }, tx);
      return 1;
    }).catch(async () => {
      // A failed transaction cannot leave half a publication behind. Surface a bounded, retryable job failure.
      return db.transaction(async tx => {
        const [failed] = await tx.update(webPublicationJob).set({ status: "failed", attempts: sql`${webPublicationJob.attempts} + 1`, errorCode: "WORKER_FAILED", finishedAt: now })
          .where(and(eq(webPublicationJob.id, candidate.id), eq(webPublicationJob.mediaId, candidate.mediaId), eq(webPublicationJob.status, "queued"))).returning();
        if (failed) await recordAuditEvent({ mediaId: failed.mediaId, actorUserId: failed.requestedBy, correlationId: failed.id, action: "publication.failed", targetType: "web_publication", targetId: failed.id, metadata: { errorCode: "WORKER_FAILED" } }, tx);
        return failed ? 1 : 0;
      });
    });
  }
  return { processed };
}
