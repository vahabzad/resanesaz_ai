import { z } from "zod";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, lt, max, sql } from "drizzle-orm";
import { articleVersion, editorialJob, editorialPolicy, editorialSection, editorialStory, mediaInboxItem, membership, rawArticle, source, storySource } from "@/db/schema";
import { db } from "./database";
import { EditorialError } from "./editorial-errors";
import { captureEditorialPolicy, getSectionCandidates, matchesSectionInputs } from "./editorial-settings";
import { EditorialRewriteError, rewriteWithCodex, validateRewrite, type RewriteInput, rewriteSchema } from "./editorial-rewriter";
import { buildRenditions } from "./editorial-renditions";
import { buildSocialOutput } from "./editorial-social-output";
import { recordAuditEvent } from "./audit";
import { categoryMappingReady, canonicalArticleCategories } from "./category-mappings";
import { automaticInputRejection, automaticRejectionMessages, queuedAutomaticRejection } from "./editorial-freshness";
import { editorialSourceCategoryAccess } from "./media-source-category-access";
import { editorialJobDiagnosis } from "./editorial-job-diagnostics";
import { editorialSourceIdentity, editorialSourceIdentitySchema } from "./editorial-source-identity";

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
    const [raw] = await tx.select({ article: rawArticle, sourceName: source.name, sourceUrl: source.url, sourceAdapter: source.adapterKey, mappingReady: categoryMappingReady, canonicalCategories: canonicalArticleCategories }).from(mediaInboxItem).innerJoin(rawArticle, eq(rawArticle.id, mediaInboxItem.rawArticleId)).innerJoin(source, eq(source.id, rawArticle.sourceId)).where(and(eq(mediaInboxItem.mediaId, actor.mediaId), eq(rawArticle.id, rawArticleId), editorialSourceCategoryAccess(actor.mediaId)));
    if (!section || !raw) throw new EditorialError("سرویس یا خبر در صندوق رسانه پیدا نشد.", 404);
    if (section.paused) throw new EditorialError("این سرویس متوقف است؛ ابتدا آن را فعال کنید.");
    if (trigger === "automatic" && !section.autoEnabled) throw new EditorialError("اجرای خودکار این سرویس متوقف است.");
    if (!raw.mappingReady) throw new EditorialError("معادل‌سازی دسته‌های این منبع هنوز تکمیل نشده است؛ سوپر ادمین باید فهرست معادل‌سازی را تنظیم کند.");
    if (raw.article.status !== "new" || !raw.article.content || raw.article.content.trim().length < 80 || !matchesSectionInputs(section.settings, { ...raw.article, categories: raw.canonicalCategories, sourceUrl: raw.sourceUrl })) throw new EditorialError("این خبر با ورودی سالم سرویس منطبق نیست.");
    if (trigger === "automatic") {
      const rejection = automaticInputRejection(section.settings, raw.article);
      if (rejection) throw new EditorialError(automaticRejectionMessages[rejection], 409, rejection);
    }
    const [existing] = await tx.select().from(editorialJob).where(and(eq(editorialJob.mediaId, actor.mediaId), eq(editorialJob.sectionId, sectionId), eq(editorialJob.inputKey, rawArticleId)));
    if (existing) return { id: existing.id, status: existing.status, duplicate: true };
    const policy = await captureEditorialPolicy(actor, section, tx);
    const identity = editorialSourceIdentity(raw.sourceName, raw.sourceUrl, raw.sourceAdapter);
    const input = { title: raw.article.title, content: raw.article.content, sourceName: identity.displayName, sourceId: raw.article.sourceId, url: raw.article.canonicalUrl, imageUrl: raw.article.imageUrl, provenance: { ...raw.article.provenance, editorialSource: identity } };
    const [job] = await tx.insert(editorialJob).values({ id: randomUUID(), mediaId: actor.mediaId, sectionId, rawArticleId, inputKey: rawArticleId, policyId: policy.id, input, trigger, requestedBy: actor.actorUserId }).onConflictDoNothing().returning();
    if (!job) { await tx.delete(editorialPolicy).where(eq(editorialPolicy.id, policy.id)); return { duplicate: true }; }
    await recordAuditEvent({ ...actor, action: "editorial.job.queued", targetType: "editorial_job", targetId: job.id, metadata: { sectionId, trigger } }, tx);
    return { id: job.id, status: job.status, duplicate: false };
  });
}
const queueStatus = sql<string>`case when ${editorialJob.status} = 'failed' and ${editorialJob.errorCode} = 'CONTENT_REVIEW_REQUIRED' then 'review_required' else ${editorialJob.status} end`;
export const queueListInput = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().pipe(z.union([z.literal(10),z.literal(20),z.literal(50)])).default(20), sectionId: z.string().trim().min(1).max(128).optional(), status: z.enum(["queued","running","succeeded","failed","review_required","cancelled"]).optional() }).strict();
export async function editorialQueue(mediaId: string, input = queueListInput.parse({})) {
  const scope = and(eq(editorialJob.mediaId, mediaId), input.sectionId ? eq(editorialJob.sectionId, input.sectionId) : undefined);
  const conditions = and(scope, input.status ? sql`${queueStatus} = ${input.status}` : undefined);
  const [count] = await db.select({count:sql<number>`count(*)::int`}).from(editorialJob).where(conditions);
  const pageCount = Math.max(1,Math.ceil(count.count/input.pageSize)); const page=Math.min(input.page,pageCount);
  const jobs = await db.select({ id: editorialJob.id, sectionId: editorialJob.sectionId, sectionName: editorialSection.name, serviceStopped: sql<boolean>`(${editorialSection.paused} OR ${editorialSection.archived})`, title: sql<string>`${editorialJob.input}->>'title'`, status: editorialJob.status, attempts: editorialJob.attempts, errorCode: editorialJob.errorCode, storyId: editorialJob.storyId, trigger: editorialJob.trigger, createdAt: editorialJob.createdAt, finishedAt: editorialJob.finishedAt })
    .from(editorialJob).innerJoin(editorialSection, eq(editorialSection.id, editorialJob.sectionId)).where(conditions).orderBy(desc(editorialJob.createdAt), desc(editorialJob.id)).limit(input.pageSize).offset((page-1)*input.pageSize);
  const counts = await db.select({ status: queueStatus, count: sql<number>`count(*)::int` }).from(editorialJob).where(scope).groupBy(queueStatus);
  const activity = await db.select({ sectionId: editorialJob.sectionId,
    queued: sql<number>`count(*) filter (where ${editorialJob.status} = 'queued')::int`,
    running: sql<number>`count(*) filter (where ${editorialJob.status} = 'running')::int`,
    succeeded: sql<number>`count(*) filter (where ${editorialJob.status} = 'succeeded')::int`,
    failed: sql<number>`count(*) filter (where ${queueStatus} = 'failed')::int`,
    reviewRequired: sql<number>`count(*) filter (where ${queueStatus} = 'review_required')::int`,
    cancelled: sql<number>`count(*) filter (where ${editorialJob.status} = 'cancelled')::int`,
    lastJobAt: max(editorialJob.createdAt), lastFinishedAt: max(editorialJob.finishedAt),
  }).from(editorialJob).where(eq(editorialJob.mediaId, mediaId)).groupBy(editorialJob.sectionId);
  return { jobs: jobs.map(job => ({ ...job, status: job.status === 'failed' && job.errorCode === 'CONTENT_REVIEW_REQUIRED' ? 'review_required' : job.status })), counts, activity, pagination:{page,pageSize:input.pageSize,total:count.count,pageCount} };
}

export async function editorialJobDetail(mediaId: string, id: string) {
  const [row] = await db.select({ job: editorialJob, sectionName: editorialSection.name, stopped: sql<boolean>`(${editorialSection.paused} OR ${editorialSection.archived})` }).from(editorialJob)
    .innerJoin(editorialSection, eq(editorialSection.id, editorialJob.sectionId)).where(and(eq(editorialJob.mediaId, mediaId), eq(editorialJob.id, id))).limit(1);
  if (!row) throw new EditorialError("کار در این رسانه پیدا نشد.", 404);
  const job = row.job;
  return { id: job.id, title: job.input.title, sectionName: row.sectionName, status: job.status === 'failed' && job.errorCode === 'CONTENT_REVIEW_REQUIRED' ? 'review_required' : job.status,
    errorCode: job.errorCode, attempts: job.attempts, createdAt: job.createdAt, finishedAt: job.finishedAt,
    diagnosis: { ...editorialJobDiagnosis(job.errorCode, job.attempts, row.stopped), canRetry: ['failed', 'cancelled'].includes(job.status) && editorialJobDiagnosis(job.errorCode, job.attempts, row.stopped).canRetry },
    input: { title: job.input.title, content: job.input.content, sourceName: job.input.sourceName } };
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

export async function recoverInterruptedEditorialJobs() {
  const candidates = await db.select().from(editorialJob).where(and(eq(editorialJob.status, 'failed'), eq(editorialJob.errorCode, 'WORKER_INTERRUPTED'), lt(editorialJob.attempts, 3))).orderBy(asc(editorialJob.createdAt)).limit(20);
  let recovered = 0;
  for (const job of candidates) {
    if (!await allowed(job.mediaId, job.requestedBy, job.trigger === 'automatic')) continue;
    await db.transaction(async tx => {
      const [section] = await tx.select().from(editorialSection).where(and(eq(editorialSection.id, job.sectionId), eq(editorialSection.mediaId, job.mediaId))).for('update');
      if (!section || section.paused || section.archived || (job.trigger === 'automatic' && !section.autoEnabled)) return;
      const rejection = job.trigger === 'automatic' ? await queuedAutomaticRejection(job, section.settings, tx) : null;
      const [updated] = await tx.update(editorialJob).set({ status: rejection ? 'cancelled' : 'queued', errorCode: rejection, finishedAt: rejection ? new Date() : null, claimToken: null, leaseUntil: null })
        .where(and(eq(editorialJob.id, job.id), eq(editorialJob.status, 'failed'), eq(editorialJob.errorCode, 'WORKER_INTERRUPTED'), lt(editorialJob.attempts, 3))).returning();
      if (!updated) return;
      if (!rejection) recovered++;
      await recordAuditEvent({ mediaId: job.mediaId, action: rejection ? 'editorial.job.recovery_skipped' : 'editorial.job.recovered', targetType: 'editorial_job', targetId: job.id, correlationId: job.id, metadata: { reason: rejection ?? 'WORKER_INTERRUPTED', attempts: job.attempts } }, tx);
    });
  }
  return recovered;
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
          if (!(error instanceof EditorialError) || !(error.code && error.code in automaticRejectionMessages)) throw error;
        }
      }
      await db.update(editorialSection).set({ autoErrorCode: null }).where(eq(editorialSection.id, section.id));
    } catch { await db.update(editorialSection).set({ autoErrorCode: "AUTO_CONFIGURATION_INVALID" }).where(eq(editorialSection.id, section.id)); }
  }
  return queued;
}
export async function runEditorialWorkerCycle(rewrite: Rewrite = rewriteWithCodex) {
  await recoverInterruptedEditorialJobs();
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
    if (job.trigger === "automatic") {
      const rejection = await queuedAutomaticRejection(job, section.settings);
      if (rejection) throw new EditorialRewriteError(rejection);
    }
    const [policy] = await db.select().from(editorialPolicy).where(and(eq(editorialPolicy.id, job.policyId), eq(editorialPolicy.mediaId, job.mediaId)));
    if (!policy?.settingsSnapshot) throw new EditorialRewriteError("POLICY_INVALID");
    const savedIdentity = editorialSourceIdentitySchema.safeParse(job.input.provenance.editorialSource);
    const sourceIdentity = savedIdentity.success ? savedIdentity.data : editorialSourceIdentity(job.input.sourceName, job.input.url);
    const input = { sourceKey: job.inputKey, title: job.input.title, content: job.input.content, sourceName: sourceIdentity.displayName, sourceIdentity, policy: policy.settingsSnapshot };
    const generated = await rewrite(input, AbortSignal.timeout(180000));
    const fallbackSocial = buildSocialOutput({ ...generated, imageUrl: job.input.imageUrl }, policy.settingsSnapshot?.settings.socialOutput).text;
    const output = validateRewrite({ ...generated, socialText: generated.socialText ?? fallbackSocial }, input);
    await db.transaction(async tx => {
      const [currentSection] = await tx.select().from(editorialSection).where(and(eq(editorialSection.id, job.sectionId), eq(editorialSection.mediaId, job.mediaId))).for("update");
      if (!currentSection || currentSection.archived || currentSection.paused || (job.trigger === "automatic" && !currentSection.autoEnabled)) throw new EditorialRewriteError("SERVICE_STOPPED");
      if (job.trigger === "automatic") {
        const rejection = await queuedAutomaticRejection(job, currentSection.settings, tx);
        if (rejection) throw new EditorialRewriteError(rejection);
      }
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
    await db.update(editorialJob).set({ status: code in automaticRejectionMessages ? "cancelled" : "failed", errorCode: code, finishedAt: new Date(), claimToken: null, leaseUntil: null }).where(and(eq(editorialJob.id, job.id), eq(editorialJob.status, "running"), eq(editorialJob.claimToken, token)));
  }
  return { queued, processed: 1 };
}

