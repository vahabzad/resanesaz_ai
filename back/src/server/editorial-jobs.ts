import { z } from "zod";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { articleVersion, editorialJob, editorialPolicy, editorialSection, editorialStory, mediaInboxItem, membership, rawArticle, source, storySource } from "@/db/schema";
import { db } from "./database";
import { EditorialError } from "./editorial-errors";
import { captureEditorialPolicy, getSectionCandidates, matchesSectionInputs } from "./editorial-settings";
import { EditorialRewriteError, rewriteWithCodex, validateRewrite, type RewriteInput, rewriteSchema } from "./editorial-rewriter";
import { buildRenditions } from "./editorial-renditions";
import { buildSocialOutput } from "./editorial-social-output";
import { recordAuditEvent } from "./audit";
import { categoryMappingReady, canonicalArticleCategories } from "./category-mappings";
import { editorialSourceCategoryAccess } from "./media-source-category-access";

type Actor = { mediaId: string; actorUserId: string; correlationId: string };
type RewriteOutput = Omit<z.infer<typeof rewriteSchema>, "socialText"> & { socialText?: string };
type Rewrite = (input: RewriteInput, signal: AbortSignal, options?: { allowReviewRequired?: boolean }) => Promise<RewriteOutput>;
async function allowed(mediaId: string, actorUserId: string | null, automated: boolean) {
  if (!actorUserId) return false;
  const [member] = await db.select().from(membership).where(and(eq(membership.organizationId, mediaId), eq(membership.userId, actorUserId)));
  return !!member && (automated ? ["owner", "admin", "editor"] : ["owner", "admin", "editor", "journalist"]).includes(member.role);
}
export async function enqueueEditorialJob(actor: Actor, sectionId: string, rawArticleId: string, trigger = "manual") {
  return db.transaction(async tx => {
    const [section] = await tx.select().from(editorialSection).where(and(eq(editorialSection.id, sectionId), eq(editorialSection.mediaId, actor.mediaId), eq(editorialSection.archived, false))).for("update");
    const [raw] = await tx.select({ article: rawArticle, sourceName: source.name, sourceUrl: source.url, mappingReady: categoryMappingReady, canonicalCategories: canonicalArticleCategories }).from(mediaInboxItem).innerJoin(rawArticle, eq(rawArticle.id, mediaInboxItem.rawArticleId)).innerJoin(source, eq(source.id, rawArticle.sourceId)).where(and(eq(mediaInboxItem.mediaId, actor.mediaId), eq(rawArticle.id, rawArticleId), editorialSourceCategoryAccess(actor.mediaId)));
    if (!section || !raw) throw new EditorialError("سرویس یا خبر در صندوق رسانه پیدا نشد.", 404);
    if (section.paused) throw new EditorialError("این سرویس متوقف است؛ ابتدا آن را فعال کنید.");
    if (trigger === "automatic" && !section.autoEnabled) throw new EditorialError("اجرای خودکار این سرویس متوقف است.");
    if (!raw.mappingReady) throw new EditorialError("معادل‌سازی دسته‌های این منبع هنوز تکمیل نشده است؛ سوپر ادمین باید فهرست معادل‌سازی را تنظیم کند.");
    if (raw.article.status !== "new" || !raw.article.content || raw.article.content.trim().length < 80 || !matchesSectionInputs(section.settings, { ...raw.article, categories: raw.canonicalCategories, sourceUrl: raw.sourceUrl })) throw new EditorialError("این خبر با ورودی سالم سرویس منطبق نیست.");
    if (trigger === "automatic" && section.settings.autoReceivedSince && raw.article.ingestedAt.getTime() < new Date(section.settings.autoReceivedSince).getTime()) throw new EditorialError("زمان دریافت خبر پیش از نقطهٔ شروع خودکار این سرویس است.", 409, "AUTO_INPUT_OUTSIDE_START");
    const [existing] = await tx.select().from(editorialJob).where(and(eq(editorialJob.mediaId, actor.mediaId), eq(editorialJob.sectionId, sectionId), eq(editorialJob.inputKey, rawArticleId)));
    if (existing) return { id: existing.id, status: existing.status, duplicate: true };
    const policy = await captureEditorialPolicy(actor, section, tx);
    const input = { title: raw.article.title, content: raw.article.content, sourceName: raw.sourceName, sourceId: raw.article.sourceId, url: raw.article.canonicalUrl, imageUrl: raw.article.imageUrl, provenance: raw.article.provenance };
    const [job] = await tx.insert(editorialJob).values({ id: randomUUID(), mediaId: actor.mediaId, sectionId, rawArticleId, inputKey: rawArticleId, policyId: policy.id, input, trigger, requestedBy: actor.actorUserId }).onConflictDoNothing().returning();
    if (!job) { await tx.delete(editorialPolicy).where(eq(editorialPolicy.id, policy.id)); return { duplicate: true }; }
    await recordAuditEvent({ ...actor, action: "editorial.job.queued", targetType: "editorial_job", targetId: job.id, metadata: { sectionId, trigger } }, tx);
    return { id: job.id, status: job.status, duplicate: false };
  });
}
export const queueListInput = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().pipe(z.union([z.literal(10),z.literal(20),z.literal(50)])).default(20), status: z.enum(["queued","running","succeeded","failed","cancelled"]).optional() }).strict();
export async function editorialQueue(mediaId: string, input = queueListInput.parse({})) {
  const conditions = and(eq(editorialJob.mediaId,mediaId), input.status ? eq(editorialJob.status,input.status) : sql`true`);
  const [count] = await db.select({count:sql<number>`count(*)::int`}).from(editorialJob).where(conditions);
  const pageCount = Math.max(1,Math.ceil(count.count/input.pageSize)); const page=Math.min(input.page,pageCount);
  const jobs = await db.select({ id: editorialJob.id, sectionId: editorialJob.sectionId, sectionName: editorialSection.name, serviceStopped: sql<boolean>`(${editorialSection.paused} OR ${editorialSection.archived})`, title: sql<string>`${editorialJob.input}->>'title'`, status: editorialJob.status, attempts: editorialJob.attempts, errorCode: editorialJob.errorCode, storyId: editorialJob.storyId, trigger: editorialJob.trigger, createdAt: editorialJob.createdAt })
    .from(editorialJob).innerJoin(editorialSection, eq(editorialSection.id, editorialJob.sectionId)).where(conditions).orderBy(desc(editorialJob.createdAt), desc(editorialJob.id)).limit(input.pageSize).offset((page-1)*input.pageSize);
  const counts = await db.select({ status: editorialJob.status, count: sql<number>`count(*)::int` }).from(editorialJob).where(eq(editorialJob.mediaId, mediaId)).groupBy(editorialJob.status);
  return { jobs, counts, pagination:{page,pageSize:input.pageSize,total:count.count,pageCount} };
}
export async function changeEditorialJob(actor: Actor, id: string, action: "cancel" | "retry") {
  return db.transaction(async tx => {
    const [job] = await tx.select().from(editorialJob).where(and(eq(editorialJob.id, id), eq(editorialJob.mediaId, actor.mediaId)));
    if (!job) throw new EditorialError("کار پیدا نشد.", 404);
    const [section] = await tx.select().from(editorialSection).where(and(eq(editorialSection.id, job.sectionId), eq(editorialSection.mediaId, actor.mediaId), eq(editorialSection.archived, false))).for("update");
    if (action === "retry" && (!section || section.paused || job.attempts >= 3)) throw new EditorialError("سرویس متوقف است یا سه تلاش انجام شده است.");
    const [updated] = await tx.update(editorialJob).set({ status: action === "retry" ? "queued" : "cancelled", claimToken: null, leaseUntil: null, errorCode: null, finishedAt: action === "retry" ? null : new Date(), ...(action === "retry" ? { trigger: "manual", requestedBy: actor.actorUserId } : {}) })
      .where(and(eq(editorialJob.id, id), eq(editorialJob.mediaId, actor.mediaId), inArray(editorialJob.status, action === "retry" ? ["failed", "cancelled"] : ["queued", "running"]))).returning();
    if (!updated) throw new EditorialError("وضعیت کار تغییر کرده؛ صف را تازه کنید.");
    await recordAuditEvent({ ...actor, action: `editorial.job.${action}`, targetType: "editorial_job", targetId: id }, tx);
    return { id: updated.id };
  });
}
export async function scheduleEditorialJobs() {
  const now = new Date(); let queued = 0;
  const sections = await db.select().from(editorialSection).where(and(eq(editorialSection.autoEnabled, true), eq(editorialSection.paused, false), eq(editorialSection.archived, false), sql`(${editorialSection.lastEnqueuedAt} IS NULL OR ${editorialSection.lastEnqueuedAt} <= ${now.toISOString()}::timestamptz - (${editorialSection.autoIntervalMinutes} * interval '1 minute'))`)).orderBy(asc(editorialSection.lastEnqueuedAt)).limit(100);
  for (const section of sections) {
    if (section.lastEnqueuedAt && now.getTime() - section.lastEnqueuedAt.getTime() < section.autoIntervalMinutes * 60000) continue;
    if (!await allowed(section.mediaId, section.autoActorUserId, true)) { await db.update(editorialSection).set({ autoErrorCode: "ACCESS_REVOKED", lastEnqueuedAt: now }).where(eq(editorialSection.id, section.id)); continue; }
    const [claimed] = await db.update(editorialSection).set({ lastEnqueuedAt: now }).where(and(eq(editorialSection.id, section.id), eq(editorialSection.autoEnabled, true), eq(editorialSection.paused, false), eq(editorialSection.archived, false), sql`(${editorialSection.lastEnqueuedAt} IS NULL OR ${editorialSection.lastEnqueuedAt} <= ${new Date(now.getTime() - section.autoIntervalMinutes * 60000)})`)).returning();
    if (!claimed) continue;
    const pending = await db.select({ count: sql<number>`count(*)::int` }).from(editorialJob).where(and(eq(editorialJob.mediaId, section.mediaId), inArray(editorialJob.status, ["queued", "running"])));
    if (pending[0].count >= 100) continue;
    try {
      const candidates = await getSectionCandidates(section.mediaId, section.id, true);
      for (const candidate of candidates.slice(0, Math.min(section.autoBatchSize, 100 - pending[0].count))) {
        try {
          const result = await enqueueEditorialJob({ mediaId: section.mediaId, actorUserId: section.autoActorUserId!, correlationId: randomUUID() }, section.id, candidate.id, "automatic");
          if (!result.duplicate) queued++;
        } catch (error) {
          // A concurrently saved start can exclude candidates from the earlier read.
          if (!(error instanceof EditorialError) || error.code !== "AUTO_INPUT_OUTSIDE_START") throw error;
        }
      }
      await db.update(editorialSection).set({ autoErrorCode: null }).where(eq(editorialSection.id, section.id));
    } catch { await db.update(editorialSection).set({ autoErrorCode: "AUTO_CONFIGURATION_INVALID" }).where(eq(editorialSection.id, section.id)); }
  }
  return queued;
}
export async function runEditorialWorkerCycle(rewrite: Rewrite = rewriteWithCodex) {
  const now = new Date();
  await db.update(editorialJob).set({ status: "failed", errorCode: "WORKER_INTERRUPTED", claimToken: null, leaseUntil: null, finishedAt: now }).where(and(eq(editorialJob.status, "running"), lt(editorialJob.leaseUntil, now)));
  const queued = await scheduleEditorialJobs();
  const [candidate] = await db.select().from(editorialJob).where(eq(editorialJob.status, "queued")).orderBy(asc(editorialJob.createdAt), asc(editorialJob.id)).limit(1);
  if (!candidate) return { queued, processed: 0 };
  const token = randomUUID();
  const [job] = await db.update(editorialJob).set({ status: "running", claimToken: token, leaseUntil: new Date(Date.now() + 240000), attempts: sql`${editorialJob.attempts} + 1` }).where(and(eq(editorialJob.id, candidate.id), eq(editorialJob.status, "queued"))).returning();
  if (!job) return { queued, processed: 0 };
  try {
    if (!await allowed(job.mediaId, job.requestedBy, job.trigger === "automatic")) throw new EditorialRewriteError("ACCESS_REVOKED");
    const [section] = await db.select().from(editorialSection).where(and(eq(editorialSection.id, job.sectionId), eq(editorialSection.mediaId, job.mediaId)));
    if (!section || section.archived || section.paused || (job.trigger === "automatic" && !section.autoEnabled)) throw new EditorialRewriteError("SERVICE_STOPPED");
    const [policy] = await db.select().from(editorialPolicy).where(and(eq(editorialPolicy.id, job.policyId), eq(editorialPolicy.mediaId, job.mediaId)));
    if (!policy?.settingsSnapshot) throw new EditorialRewriteError("POLICY_INVALID");
    const input = { sourceKey: job.inputKey, title: job.input.title, content: job.input.content, sourceName: job.input.sourceName, policy: policy.settingsSnapshot };
    const generated = await rewrite(input, AbortSignal.timeout(180000));
    const fallbackSocial = buildSocialOutput({ ...generated, imageUrl: job.input.imageUrl }, policy.settingsSnapshot?.settings.socialOutput).text;
    const output = validateRewrite({ ...generated, socialText: generated.socialText ?? fallbackSocial }, input);
    await db.transaction(async tx => {
      const [currentSection] = await tx.select().from(editorialSection).where(and(eq(editorialSection.id, job.sectionId), eq(editorialSection.mediaId, job.mediaId))).for("update");
      if (!currentSection || currentSection.archived || currentSection.paused || (job.trigger === "automatic" && !currentSection.autoEnabled)) throw new EditorialRewriteError("SERVICE_STOPPED");
      const [currentMember] = await tx.select().from(membership).where(and(eq(membership.organizationId, job.mediaId), eq(membership.userId, job.requestedBy ?? ""))).for("update");
      if (!currentMember || !(job.trigger === "automatic" ? ["owner", "admin", "editor"] : ["owner", "admin", "editor", "journalist"]).includes(currentMember.role)) throw new EditorialRewriteError("ACCESS_REVOKED");
      const storyId = randomUUID();
      const [claimed] = await tx.update(editorialJob).set({ status: "succeeded", finishedAt: new Date(), claimToken: null, leaseUntil: null })
        .where(and(eq(editorialJob.id, job.id), eq(editorialJob.status, "running"), eq(editorialJob.claimToken, token), sql`${editorialJob.leaseUntil} > now()`)).returning();
      if (!claimed) return;
      await tx.insert(editorialStory).values({ id: storyId, mediaId: job.mediaId, status: "ready" });
      const sourceId = randomUUID();
      await tx.insert(storySource).values({ id: sourceId, mediaId: job.mediaId, storyId, rawArticleId: claimed.rawArticleId, snapshot: job.input });
      await tx.insert(articleVersion).values({ id: randomUUID(), mediaId: job.mediaId, storyId, revision: 1, policyId: job.policyId, sectionId: job.sectionId, title: output.title, lead: output.lead, body: output.body, imageUrl: job.input.imageUrl, sourceIds: [sourceId], renditions: buildRenditions({ ...output, imageUrl: job.input.imageUrl }, undefined, policy.settingsSnapshot?.settings.socialOutput, generated.socialText === undefined ? undefined : output.socialText), actorUserId: null });
      await tx.update(editorialJob).set({ storyId }).where(eq(editorialJob.id, job.id));
      await recordAuditEvent({ mediaId: job.mediaId, action: "editorial.job.completed", targetType: "story", targetId: storyId, correlationId: job.id, metadata: { jobId: job.id, policyId: job.policyId, generatedBy: "codex", humanApproval: false } }, tx);
    });
  } catch (error) {
    const code = error instanceof EditorialRewriteError ? error.code : "EDITORIAL_JOB_FAILED";
    await db.update(editorialJob).set({ status: "failed", errorCode: code, finishedAt: new Date(), claimToken: null, leaseUntil: null }).where(and(eq(editorialJob.id, job.id), eq(editorialJob.status, "running"), eq(editorialJob.claimToken, token)));
  }
  return { queued, processed: 1 };
}

