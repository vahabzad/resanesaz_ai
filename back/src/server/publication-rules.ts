import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { articleVersion, editorialApproval, editorialPolicy, editorialSection, editorialStory, mediaSite, membership, publicationRule, siteArticle, storyPublicationPolicy, webPublicationJob } from "@/db/schema";
import { db } from "./database";
import { recordAuditEvent } from "./audit";
import { captureWebSnapshot, SiteError, type SiteActor } from "./sites";
import { enqueueWebPublication } from "./web-publications";
import { mediaRoles, type MediaRole } from "./permissions";
import type { PublicationRuleSettings } from "../../contracts/src/sites";

const id = z.string().trim().min(1).max(128);
export const ruleInput = z.object({ name: z.string().trim().min(2).max(100).refine(v => !/[<>]/.test(v)), siteId: id, enabled: z.boolean(), settings: z.object({
  serviceIds: z.array(id).max(50), sectionIds: z.array(id).max(50), language: z.enum(["fa", "en", "ar", "tr", "fr", "de", "es", "ru"]),
  role: z.enum(["primary", "republication", "summary"]), mode: z.enum(["manual", "automatic"]), approvedSince: z.iso.datetime({ offset: true }),
}).strict(), startNow: z.boolean().optional(), expectedRevision: z.number().int().min(1).optional() }).strict();

async function validateRule(mediaId: string, input: z.infer<typeof ruleInput>) {
  const [site] = await db.select().from(mediaSite).where(and(eq(mediaSite.id, input.siteId), eq(mediaSite.mediaId, mediaId)));
  if (!site || site.status === "archived") throw new SiteError("سایت مقصد در این رسانه قابل انتخاب نیست.", 404);
  const ids = [...new Set([...input.settings.serviceIds, ...input.settings.sectionIds])];
  const sections = ids.length ? await db.select().from(editorialSection).where(and(eq(editorialSection.mediaId, mediaId), eq(editorialSection.archived, false), inArray(editorialSection.id, ids))) : [];
  if (sections.length !== ids.length) throw new SiteError("سرویس یا بخش انتخاب‌شده در این رسانه فعال نیست.");
}

function filters(mediaId: string, siteId: string, settings: PublicationRuleSettings) {
  const parts = [eq(editorialStory.mediaId, mediaId), eq(articleVersion.mediaId, mediaId), eq(editorialStory.status, "approved"), eq(articleVersion.revision, editorialStory.revision),
    sql`coalesce(${editorialPolicy.settingsSnapshot}->'settings'->>'language', 'fa') = ${settings.language}`,
    sql`EXISTS (SELECT 1 FROM ${editorialApproval} WHERE ${editorialApproval.mediaId} = ${mediaId} AND ${editorialApproval.versionId} = ${articleVersion.id} AND ${editorialApproval.decision} = 'approved' AND ${editorialApproval.createdAt} >= ${settings.approvedSince}::timestamptz)`];
  if (settings.serviceIds.length) parts.push(inArray(articleVersion.sectionId, settings.serviceIds));
  if (settings.sectionIds.length) parts.push(sql`(${inArray(articleVersion.sectionId, settings.sectionIds)} OR ${sql.join(settings.sectionIds.map(id => sql`${articleVersion.secondarySectionIds} ? ${id}`), sql` OR `)})`);
  if (settings.role === "primary") parts.push(sql`NOT EXISTS (SELECT 1 FROM ${storyPublicationPolicy} WHERE ${storyPublicationPolicy.storyId} = ${editorialStory.id} AND ${storyPublicationPolicy.mediaId} = ${mediaId} AND ${storyPublicationPolicy.primarySiteId} <> ${siteId})`);
  else parts.push(sql`NOT EXISTS (SELECT 1 FROM ${storyPublicationPolicy} WHERE ${storyPublicationPolicy.storyId} = ${editorialStory.id} AND ${storyPublicationPolicy.mediaId} = ${mediaId} AND ${storyPublicationPolicy.primarySiteId} = ${siteId})`);
  return and(...parts);
}

function candidates(mediaId: string) {
  return db.select({ versionId: articleVersion.id, title: articleVersion.title }).from(articleVersion)
    .innerJoin(editorialStory, eq(editorialStory.id, articleVersion.storyId))
    .innerJoin(editorialPolicy, and(eq(editorialPolicy.id, articleVersion.policyId), eq(editorialPolicy.mediaId, mediaId)));
}

export async function previewRule(mediaId: string, input: z.infer<typeof ruleInput>) {
  await validateRule(mediaId, input);
  const checkedAt = new Date().toISOString(); const settings = { ...input.settings, approvedSince: input.startNow ? checkedAt : input.settings.approvedSince };
  const rows = candidates(mediaId).where(filters(mediaId, input.siteId, settings)).as("matches");
  const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(rows);
  const [registered] = await db.select({ count: sql<number>`count(*)::int` }).from(rows).innerJoin(webPublicationJob, and(eq(webPublicationJob.versionId, rows.versionId), eq(webPublicationJob.mediaId, mediaId), eq(webPublicationJob.siteId, input.siteId)));
  const samples = await db.select().from(rows).limit(10);
  return { total: total.count, alreadyRegistered: registered.count, samples, checkedAt };
}

export async function ruleWorkspace(mediaId: string) {
  const rules = await db.select({ id: publicationRule.id, name: publicationRule.name, siteId: publicationRule.siteId, revision: publicationRule.revision, enabled: publicationRule.enabled, settings: publicationRule.settings, createdAt: publicationRule.createdAt, lastErrorCode: publicationRule.lastErrorCode }).from(publicationRule).where(eq(publicationRule.mediaId, mediaId)).orderBy(asc(publicationRule.createdAt), asc(publicationRule.id));
  const services = await db.select({ id: editorialSection.id, name: editorialSection.name }).from(editorialSection).where(and(eq(editorialSection.mediaId, mediaId), eq(editorialSection.archived, false))).orderBy(editorialSection.name);
  return { rules, services };
}

export async function saveRule(actor: SiteActor, input: z.infer<typeof ruleInput>, ruleId?: string) {
  await validateRule(actor.mediaId, input);
  return db.transaction(async tx => {
    // Shared site lock serializes rule changes with scheduling and delivery.
    const [site] = await tx.select().from(mediaSite).where(and(eq(mediaSite.id, input.siteId), eq(mediaSite.mediaId, actor.mediaId))).for("update");
    if (!site || site.status === "archived") throw new SiteError("سایت قابل انتخاب نیست.");
    const settings = { ...input.settings, approvedSince: input.startNow ? new Date().toISOString() : input.settings.approvedSince };
    let rule;
    if (ruleId) {
      const [old] = await tx.select().from(publicationRule).where(and(eq(publicationRule.id, ruleId), eq(publicationRule.mediaId, actor.mediaId))).for("update");
      if (!old) throw new SiteError("قاعده پیدا نشد.", 404);
      if (old.siteId !== input.siteId) throw new SiteError("برای مقصد دیگر، قاعدهٔ تازه بسازید.");
      if (old.revision !== input.expectedRevision) throw new SiteError("قاعده تغییر کرده؛ دوباره بارگذاری کنید.");
      [rule] = await tx.update(publicationRule).set({ name: input.name, enabled: input.enabled, settings, actorUserId: actor.actorUserId, revision: old.revision + 1, lastErrorCode: null }).where(eq(publicationRule.id, ruleId)).returning();
      await tx.update(webPublicationJob).set({ status: "cancelled", errorCode: "RULE_CHANGED", finishedAt: new Date() }).where(and(eq(webPublicationJob.mediaId, actor.mediaId), eq(webPublicationJob.ruleId, ruleId), eq(webPublicationJob.status, "queued")));
    } else {
      const [count] = await tx.select({ count: sql<number>`count(*)::int` }).from(publicationRule).where(eq(publicationRule.mediaId, actor.mediaId));
      if (count.count >= 100) throw new SiteError("حداکثر ۱۰۰ قاعده برای هر رسانه قابل ثبت است.");
      [rule] = await tx.insert(publicationRule).values({ id: randomUUID(), mediaId: actor.mediaId, siteId: site.id, name: input.name, enabled: input.enabled, settings, actorUserId: actor.actorUserId }).returning();
    }
    await recordAuditEvent({ ...actor, action: ruleId ? "publication_rule.updated" : "publication_rule.created", targetType: "publication_rule", targetId: rule.id, metadata: { revision: rule.revision, enabled: rule.enabled } }, tx);
    return { id: rule.id };
  });
}

export async function runPublicationRulesCycle() {
  const rules = await db.select().from(publicationRule).where(eq(publicationRule.enabled, true)).orderBy(asc(publicationRule.createdAt), asc(publicationRule.id));
  let queued = 0;
  for (const rule of rules) {
    if (rule.settings.mode !== "automatic") continue;
    const [site] = await db.select().from(mediaSite).where(and(eq(mediaSite.id, rule.siteId), eq(mediaSite.mediaId, rule.mediaId)));
    const [member] = await db.select().from(membership).where(and(eq(membership.organizationId, rule.mediaId), eq(membership.userId, rule.actorUserId ?? "")));
    let lastErrorCode: string | null = !member || !mediaRoles[member.role as MediaRole]?.authorize({ publication: ["create"] }).success ? "ACCESS_REVOKED" : site?.status !== "live" ? "SITE_STOPPED" : null;
    if (lastErrorCode) { await db.update(publicationRule).set({ lastErrorCode }).where(and(eq(publicationRule.id, rule.id), eq(publicationRule.revision, rule.revision))); continue; }
    const versions = await candidates(rule.mediaId).where(and(filters(rule.mediaId, rule.siteId, rule.settings), sql`NOT EXISTS (SELECT 1 FROM ${webPublicationJob} WHERE ${webPublicationJob.mediaId} = ${rule.mediaId} AND ${webPublicationJob.siteId} = ${rule.siteId} AND ${webPublicationJob.versionId} = ${articleVersion.id})`)).orderBy(asc(articleVersion.createdAt), asc(articleVersion.id)).limit(20);
    for (const version of versions) {
      try { const result = await enqueueWebPublication({ mediaId: rule.mediaId, actorUserId: rule.actorUserId!, correlationId: rule.id }, { siteId: rule.siteId, versionId: version.versionId, role: rule.settings.role }, { id: rule.id, revision: rule.revision }); if (!result.duplicate) queued++; }
      catch { lastErrorCode = "SCHEDULING_FAILED"; }
    }
    await db.update(publicationRule).set({ lastErrorCode }).where(and(eq(publicationRule.id, rule.id), eq(publicationRule.revision, rule.revision)));
  }
  return { queued };
}

export async function distributionWorkspace(mediaId: string, versionId: string) {
  const snapshot = await captureWebSnapshot(mediaId, versionId);
  const sites = await db.select().from(mediaSite).where(eq(mediaSite.mediaId, mediaId)).orderBy(mediaSite.name);
  const { rules } = await ruleWorkspace(mediaId);
  const [policy] = await db.select().from(storyPublicationPolicy).where(and(eq(storyPublicationPolicy.storyId, snapshot.storyId), eq(storyPublicationPolicy.mediaId, mediaId)));
  const jobs = await db.select().from(webPublicationJob).where(and(eq(webPublicationJob.mediaId, mediaId), eq(webPublicationJob.versionId, versionId)));
  const articles = await db.select().from(siteArticle).where(and(eq(siteArticle.mediaId, mediaId), eq(siteArticle.storyId, snapshot.storyId)));
  const matches: string[] = [];
  for (const rule of rules.filter(r => r.enabled)) { const [row] = await candidates(mediaId).where(and(filters(mediaId, rule.siteId, rule.settings), eq(articleVersion.id, versionId))).limit(1); if (row) matches.push(rule.id); }
  return { storyId: snapshot.storyId, sites: sites.map(site => {
    const job = jobs.find(j => j.siteId === site.id); const article = articles.find(a => a.siteId === site.id); const matched = rules.filter(r => r.siteId === site.id && matches.includes(r.id));
    return { id: site.id, name: site.name, status: site.status, reason: site.status !== "live" ? "سایت فعال نیست؛ ابتدا آن را در بخش سایت‌ها فعال کنید." : null,
      suggestedRole: policy ? policy.primarySiteId === site.id ? "primary" : "republication" : matched[0]?.settings.role ?? "primary", rules: matched.map(r => r.name),
      published: article ? { versionId: article.versionId, revision: article.snapshot.revision, role: article.snapshot.delivery?.role ?? (policy?.primarySiteId === site.id ? "primary" : "republication"), withdrawn: Boolean(article.withdrawnAt) } : null,
      job: job ? { id: job.id, status: job.status, role: job.snapshot.delivery?.role ?? "primary", scheduledAt: job.scheduledAt } : null };
  }) };
}

export async function withdrawArticle(actor: SiteActor, siteId: string, storyId: string, versionId: string) {
  return db.transaction(async tx => {
    const [site] = await tx.select().from(mediaSite).where(and(eq(mediaSite.id, siteId), eq(mediaSite.mediaId, actor.mediaId))).for("update");
    if (!site) throw new SiteError("سایت پیدا نشد.", 404);
    await tx.select().from(editorialStory).where(and(eq(editorialStory.id, storyId), eq(editorialStory.mediaId, actor.mediaId))).for("update");
    const [article] = await tx.update(siteArticle).set({ withdrawnAt: new Date() }).where(and(eq(siteArticle.mediaId, actor.mediaId), eq(siteArticle.siteId, siteId), eq(siteArticle.storyId, storyId), eq(siteArticle.versionId, versionId), isNull(siteArticle.withdrawnAt))).returning();
    if (!article) throw new SiteError("خبر تغییر کرده یا قبلاً از سایت برداشته شده است.");
    await tx.update(webPublicationJob).set({ status: "cancelled", errorCode: "ARTICLE_WITHDRAWN", finishedAt: new Date() }).where(and(eq(webPublicationJob.mediaId, actor.mediaId), eq(webPublicationJob.siteId, siteId), eq(webPublicationJob.storyId, storyId), eq(webPublicationJob.status, "queued")));
    await recordAuditEvent({ ...actor, action: "publication.withdrawn", targetType: "site_article", targetId: article.id }, tx);
    return { id: article.id };
  });
}
