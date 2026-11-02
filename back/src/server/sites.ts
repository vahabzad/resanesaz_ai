import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { articleVersion, editorialApproval, editorialPolicy, editorialSection, editorialStory, media, mediaSite, platformCategory, siteArticle, storySource, storyPublicationPolicy, webPublicationJob } from "@/db/schema";
import { db } from "./database";
import { recordAuditEvent } from "./audit";
import { buildRenditions } from "./editorial-renditions";
import { assertPublicHttpsUrl } from "./url-safety";
import type { SiteSpec, WebSnapshot } from "../../contracts/src/sites";
import { brandIdentitySchema, logoDraftSchema, renderLogoArtwork, sameLogoRequest } from "./branding";
import { resolveMediaLogo } from "./media-logo";
import { identityRequestText } from "../../contracts/src/branding";
import { mediaIsApproved, requireApprovedMedia } from "./media-requests";
import { setupIsComplete } from "./media-source-drafts";

export class SiteError extends Error { constructor(message: string, public status = 409) { super(message); } }
export type SiteActor = { mediaId: string; actorUserId: string; correlationId: string };
const id = z.string().trim().min(1).max(128);
const plain = (min: number, max: number) => z.string().trim().min(min).max(max).refine(v => !/[<>]/.test(v));
const designBriefInput = z.object({
  categoryIds: z.array(id).min(1).max(30).refine(ids => new Set(ids).size === ids.length).optional(),
  mediaTopics: z.array(plain(1, 80)).min(1).max(20), targetAudience: z.array(plain(1, 80)).min(1).max(20), languages: z.array(plain(1, 40)).min(1).max(10),
  categories: z.array(plain(1, 80)).min(1).max(30), contentTypes: z.array(plain(1, 80)).min(1).max(30), homepageFocus: z.array(plain(1, 80)).min(1).max(20),
  design: z.object({ style: plain(1, 100), referenceWebsite: z.string().trim().max(500).url().or(z.literal("")), contentDensity: plain(1, 80), colorScheme: plain(1, 80), primaryColor: z.string().max(30), secondaryColor: z.string().max(30), backgroundColor: z.string().max(30), logoMode: z.enum(["provided", "generate", "text-only"]), visualIdentity: plain(1, 80), fontPreference: plain(1, 80), logoData: z.string().max(1500000).optional(), logoInstructions: z.string().max(3000).optional(), logoDraft: logoDraftSchema.optional(), identityDetails: brandIdentitySchema.optional() }).strict(),
  features: z.array(plain(1, 80)).min(1).max(30), additionalNotes: z.string().trim().max(4000),
}).strict();
export const siteSpecInput = z.object({
  logo: z.string().max(1500000).nullable().optional(),
  title: plain(2, 100), tagline: plain(0, 300), language: z.enum(["fa", "en", "ar"]), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  layout: z.enum(["lead", "grid"]), footer: plain(0, 500),
  blocks: z.array(z.object({ id, title: plain(2, 80), sectionIds: z.array(id).max(20), limit: z.number().int().min(1).max(20) }).strict()).min(1).max(8),
  designBrief: designBriefInput.optional(),
}).strict().refine(v => new Set(v.blocks.map(b => b.id)).size === v.blocks.length && v.blocks.every(b => new Set(b.sectionIds).size === b.sectionIds.length));
export const siteInput = z.object({ name: plain(2, 100), slug: z.string().min(3).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), spec: siteSpecInput }).strict();
export const siteUpdateInput = siteInput.extend({ expectedRevision: z.number().int().min(1) });
export const siteActionInput = z.object({ expectedRevision: z.number().int().min(1), action: z.enum(["activate", "pause", "archive", "restore"]) }).strict();
export const sitePageInput = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), sectionId: id.optional(), view: z.literal("all").optional() }).strict();

async function validateSections(mediaId: string, spec: SiteSpec, tx: Pick<typeof db, "select">) {
  const ids = [...new Set(spec.blocks.flatMap(block => block.sectionIds))];
  const rows = ids.length ? await tx.select({ id: editorialSection.id }).from(editorialSection).where(and(eq(editorialSection.mediaId, mediaId), eq(editorialSection.archived, false), inArray(editorialSection.id, ids))) : [];
  if (rows.length !== ids.length) throw new SiteError("بخش انتخاب‌شده در این رسانه فعال نیست.");
}

export async function sitesWorkspace(mediaId: string) {
  const sites = await db.select().from(mediaSite).where(eq(mediaSite.mediaId, mediaId)).orderBy(desc(mediaSite.updatedAt));
  const sections = await db.select({ id: editorialSection.id, name: editorialSection.name }).from(editorialSection).where(and(eq(editorialSection.mediaId, mediaId), eq(editorialSection.archived, false))).orderBy(editorialSection.name);
  return { sites: sites.map(({ mediaId: _scope, createdAt: _created, ...site }) => { void _scope; void _created; return site; }), sections };
}

export async function saveSite(actor: SiteActor, input: z.infer<typeof siteInput> | z.infer<typeof siteUpdateInput>, siteId?: string) {
  return db.transaction(async tx => {
    const [owner] = await tx.select({ metadata: media.metadata }).from(media).where(eq(media.id, actor.mediaId)).for("update");
    if (!owner) throw new SiteError("رسانه پیدا نشد.", 404);
    if (setupIsComplete(owner.metadata)) await requireApprovedMedia(actor.mediaId, tx);
    let spec = input.spec;
    if (spec.designBrief) {
      const brief = spec.designBrief;
      const design = brief.design;
      if (design.visualIdentity === "هویت بصری مشخص دارم" && !design.identityDetails) throw new SiteError("جزئیات هویت بصری برند را کامل کنید.", 400);
      const [ownerMedia] = await tx.select({ logo: media.logo }).from(media).where(eq(media.id, actor.mediaId)).limit(1);
      let logo: string | null = null;
      if (design.logoMode === "generate") {
        const draft = design.logoDraft;
        const expected = { name: input.name.trim(), instructions: (design.logoInstructions ?? "").trim(), primaryColor: design.primaryColor, secondaryColor: design.secondaryColor, backgroundColor: design.backgroundColor, identity: design.visualIdentity === "هویت بصری مشخص دارم" ? identityRequestText(design.identityDetails) : "" };
        if (!draft?.approved || !sameLogoRequest(draft.request, expected)) throw new SiteError("ابتدا لوگو را با مشخصات فعلی بسازید و پیش‌نمایش آن را تأیید کنید.", 400);
        logo = renderLogoArtwork(draft.artwork);
      } else if (design.logoMode === "provided") {
        logo = design.logoData ? resolveMediaLogo(input.name, "upload", design.logoData) : ownerMedia?.logo ?? null;
        if (!design.logoData && siteId && input.spec.logo) {
          const [existing] = await tx.select({ spec: mediaSite.spec }).from(mediaSite).where(and(eq(mediaSite.id, siteId), eq(mediaSite.mediaId, actor.mediaId))).limit(1);
          if (existing?.spec.logo === input.spec.logo) logo = existing.spec.logo;
        }
        if (!logo) throw new SiteError("فایل لوگوی رسانه را انتخاب کنید.", 400);
      }
      spec = { ...spec, logo };
      const catalog = await tx.select().from(platformCategory).where(eq(platformCategory.active, true));
      const selected = brief.categoryIds
        ? brief.categoryIds.map(id => catalog.find(category => category.id === id))
        : brief.categories.map(name => catalog.find(category => category.nameFa === name));
      if (!selected.length || selected.some(category => !category)) throw new SiteError("دسته‌بندی‌های خبری را از فهرست فعال سوپر ادمین انتخاب کنید.", 400);
      const categories = selected.filter(category => category !== undefined);
      spec = { ...spec, designBrief: { ...brief, design: { ...design, logoData: undefined }, categoryIds: [...new Set(categories.map(category => category.id))], categories: [...new Set(categories.map(category => category.nameFa))] } };
      if (logo && (design.logoMode === "generate" || design.logoData)) {
        await tx.update(media).set({ logo }).where(eq(media.id, actor.mediaId));
        await recordAuditEvent({ ...actor, action: "media.logo.updated", targetType: "media", targetId: actor.mediaId, metadata: { mode: design.logoMode } }, tx);
      }
    }
    await validateSections(actor.mediaId, input.spec, tx);
    const now = new Date();
    let site;
    if (siteId) {
      const [previous] = await tx.select().from(mediaSite).where(and(eq(mediaSite.id, siteId), eq(mediaSite.mediaId, actor.mediaId))).for("update");
      if (!previous) throw new SiteError("سایت پیدا نشد.", 404);
      if (previous.status === "archived") throw new SiteError("ابتدا سایت را بازیابی کنید.");
      if (previous.slug !== input.slug) throw new SiteError("نشانی سایت پس از ساخت ثابت است؛ نام و طراحی قابل تغییرند.");
      if (!spec.designBrief && spec.logo && spec.logo !== previous.spec.logo) throw new SiteError("لوگو را از بخش هویت بصری ثبت کنید.", 400);
      [site] = await tx.update(mediaSite).set({ name: input.name, spec, revision: sql`${mediaSite.revision} + 1`, updatedAt: now }).where(and(eq(mediaSite.id, siteId), eq(mediaSite.mediaId, actor.mediaId), eq(mediaSite.revision, "expectedRevision" in input ? input.expectedRevision : 0))).returning();
      if (!site) throw new SiteError("سایت تغییر کرده؛ دوباره بارگذاری کنید.");
    } else {
      if (!spec.designBrief && spec.logo) throw new SiteError("لوگو را از بخش هویت بصری ثبت کنید.", 400);
      [site] = await tx.insert(mediaSite).values({ id: randomUUID(), mediaId: actor.mediaId, name: input.name, slug: input.slug, spec }).onConflictDoNothing({ target: mediaSite.slug }).returning();
      if (!site) throw new SiteError("این شناسهٔ نشانی قبلاً استفاده شده است؛ شناسهٔ دیگری انتخاب کنید.", 409);
    }
    await recordAuditEvent({ ...actor, action: siteId ? "site.updated" : "site.created", targetType: "site", targetId: site.id, metadata: { revision: site.revision } }, tx);
    return { id: site.id };
  });
}

export async function changeSite(actor: SiteActor, siteId: string, input: z.infer<typeof siteActionInput>) {
  return db.transaction(async tx => {
    if (input.action === "activate") await requireApprovedMedia(actor.mediaId, tx);
    const [previous] = await tx.select().from(mediaSite).where(and(eq(mediaSite.id, siteId), eq(mediaSite.mediaId, actor.mediaId))).for("update");
    if (!previous) throw new SiteError("سایت پیدا نشد.", 404);
    if (previous.revision !== input.expectedRevision) throw new SiteError("نسخهٔ سایت تغییر کرده؛ دوباره بارگذاری کنید.");
    if ((input.action === "restore") !== (previous.status === "archived")) throw new SiteError("این اقدام با وضعیت سایت سازگار نیست.");
    if (input.action === "pause" && previous.status !== "live") throw new SiteError("فقط سایت فعال قابل توقف است.");
    if (input.action === "activate") await validateSections(actor.mediaId, previous.spec, tx);
    const status = { activate: "live", pause: "paused", archive: "archived", restore: "draft" }[input.action];
    await tx.update(mediaSite).set({ status, ...(input.action === "activate" ? { liveSpec: previous.spec } : {}), revision: previous.revision + 1, updatedAt: new Date() }).where(eq(mediaSite.id, siteId));
    if (["pause", "archive"].includes(input.action)) await tx.update(webPublicationJob).set({ status: "cancelled", finishedAt: new Date(), errorCode: "SITE_STOPPED" }).where(and(eq(webPublicationJob.mediaId, actor.mediaId), eq(webPublicationJob.siteId, siteId), eq(webPublicationJob.status, "queued")));
    await recordAuditEvent({ ...actor, action: `site.${input.action}`, targetType: "site", targetId: siteId, metadata: { revision: previous.revision + 1 } }, tx);
    return { id: siteId };
  });
}

export async function captureWebSnapshot(mediaId: string, versionId: string, tx: Pick<typeof db, "select"> = db): Promise<WebSnapshot> {
  const [row] = await tx.select({ version: articleVersion, story: editorialStory, policy: editorialPolicy }).from(articleVersion)
    .innerJoin(editorialStory, and(eq(editorialStory.id, articleVersion.storyId), eq(editorialStory.mediaId, mediaId)))
    .innerJoin(editorialPolicy, eq(editorialPolicy.id, articleVersion.policyId)).where(and(eq(articleVersion.id, versionId), eq(articleVersion.mediaId, mediaId)));
  if (!row) throw new SiteError("نسخهٔ خبر در این رسانه پیدا نشد.", 404);
  const approval = await tx.select({ id: editorialApproval.id }).from(editorialApproval).where(and(eq(editorialApproval.mediaId, mediaId), eq(editorialApproval.versionId, versionId), eq(editorialApproval.decision, "approved"))).limit(1);
  if (!approval.length || row.story.status !== "approved" || row.story.revision !== row.version.revision) throw new SiteError("فقط آخرین نسخهٔ تأییدشدهٔ خبر قابل انتشار است.");
  const version = row.version;
  const sectionIds = [...new Set([version.sectionId, ...version.secondarySectionIds])];
  const sections = await tx.select({ id: editorialSection.id, name: editorialSection.name }).from(editorialSection).where(and(eq(editorialSection.mediaId, mediaId), inArray(editorialSection.id, sectionIds)));
  const sources = await tx.select().from(storySource).where(and(eq(storySource.mediaId, mediaId), eq(storySource.storyId, version.storyId)));
  const renditions = version.renditions ?? buildRenditions(version, undefined, row.policy.settingsSnapshot?.settings.socialOutput);
  async function image(value: string | null) { try { return value ? (await assertPublicHttpsUrl(value)).toString() : null; } catch { return null; } }
  return { storyId: version.storyId, versionId, revision: version.revision, language: row.policy.settingsSnapshot?.settings.language ?? "fa", sectionIds, sectionNames: sectionIds.map(id => sections.find(s => s.id === id)?.name ?? "خبرها"), sourceNames: [...new Set(sources.filter(s => version.sourceIds === null || version.sourceIds.includes(s.id)).map(s => s.snapshot.sourceName))], webCard: { ...renditions.webCard, imageUrl: await image(renditions.webCard.imageUrl) }, webFull: { ...renditions.webFull, imageUrl: await image(renditions.webFull.imageUrl) } };
}

export async function sitePage(input: { slug?: string; mediaId?: string; siteId?: string; storyId?: string; preview?: boolean; page: number; sectionId?: string; view?: "all" }) {
  const [site] = await db.select().from(mediaSite).where(input.preview ? and(eq(mediaSite.id, input.siteId!), eq(mediaSite.mediaId, input.mediaId!)) : and(eq(mediaSite.slug, input.slug!), eq(mediaSite.status, "live")));
  if (!site || (!input.preview && !site.liveSpec)) throw new SiteError("سایت در دسترس نیست.", 404);
  if (!await mediaIsApproved(site.mediaId)) throw new SiteError(input.preview ? "پیش‌نمایش سایت پس از تأیید درخواست رسانه فعال می‌شود." : "سایت در دسترس نیست.", input.preview ? 403 : 404);
  const spec = input.preview ? site.spec : site.liveSpec!;
  const conditions = [eq(siteArticle.siteId, site.id), eq(siteArticle.mediaId, site.mediaId), isNull(siteArticle.withdrawnAt)];
  if (input.storyId) conditions.push(eq(siteArticle.storyId, input.storyId));
  if (input.sectionId) conditions.push(sql`${siteArticle.snapshot}->'sectionIds' ? ${input.sectionId}`);
  const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(siteArticle).where(and(...conditions));
  const pageCount = Math.max(1, Math.ceil(count.count / 20)); const page = Math.min(input.page, pageCount);
  const rows = await db.select().from(siteArticle).where(and(...conditions)).orderBy(desc(siteArticle.publishedAt), desc(siteArticle.id)).limit(input.storyId ? 1 : 20).offset((page - 1) * 20);
  let articles = rows.map(row => ({ ...row.snapshot, publishedAt: row.publishedAt.toISOString() as string | null }));
  // Authenticated previews can show real approved content before its first publication.
  if (input.preview) {
    const approved = await db.select({ id: articleVersion.id }).from(editorialStory).innerJoin(articleVersion, and(eq(articleVersion.storyId, editorialStory.id), eq(articleVersion.revision, editorialStory.revision))).where(and(eq(editorialStory.mediaId, site.mediaId), eq(editorialStory.status, "approved"), ...(input.storyId ? [eq(editorialStory.id, input.storyId)] : []))).orderBy(desc(editorialStory.updatedAt)).limit(20);
    const snapshots = await Promise.all(approved.map(v => captureWebSnapshot(site.mediaId, v.id)));
    articles = [...snapshots.filter(s => !input.sectionId || s.sectionIds.includes(input.sectionId)).map(snapshot => ({ ...snapshot, publishedAt: null })), ...articles].filter((v, i, all) => all.findIndex(a => a.storyId === v.storyId) === i).slice(0, 20);
  }
  if (input.storyId && !articles.length) throw new SiteError("خبر منتشرشده پیدا نشد.", 404);
  const sectionOptions = await db.select({ id: editorialSection.id, name: editorialSection.name }).from(editorialSection).where(and(eq(editorialSection.mediaId, site.mediaId), sql`EXISTS (SELECT 1 FROM ${siteArticle} WHERE ${siteArticle.siteId} = ${site.id} AND ${siteArticle.mediaId} = ${site.mediaId} AND ${siteArticle.withdrawnAt} IS NULL AND ${siteArticle.snapshot}->'sectionIds' ? ${editorialSection.id})`)).orderBy(editorialSection.name);
  const blocks = !input.storyId && !input.sectionId && input.view !== "all" && page === 1 ? await Promise.all(spec.blocks.map(async block => {
    if (input.preview) return { id: block.id, articles: articles.filter(article => !block.sectionIds.length || block.sectionIds.some(id => article.sectionIds.includes(id))).slice(0, block.limit) };
    const filters = [eq(siteArticle.siteId, site.id), eq(siteArticle.mediaId, site.mediaId), isNull(siteArticle.withdrawnAt)];
    if (block.sectionIds.length) filters.push(sql`(${sql.join(block.sectionIds.map(id => sql`${siteArticle.snapshot}->'sectionIds' ? ${id}`), sql` OR `)})`);
    const matching = await db.select().from(siteArticle).where(and(...filters)).orderBy(desc(siteArticle.publishedAt), desc(siteArticle.id)).limit(block.limit);
    return { id: block.id, articles: matching.map(row => ({ ...row.snapshot, publishedAt: row.publishedAt.toISOString() as string | null })) };
  })) : [];
  if (input.preview) for (const article of articles) article.sectionIds.forEach((id, index) => { if (!sectionOptions.some(s => s.id === id)) sectionOptions.push({ id, name: article.sectionNames[index] ?? "خبرها" }); });
  if (!input.preview) {
    const all = [...articles, ...blocks.flatMap(b => b.articles)]; const ids = [...new Set(all.map(a => a.storyId))];
    if (ids.length) {
      const policies = await db.select().from(storyPublicationPolicy).where(and(eq(storyPublicationPolicy.mediaId, site.mediaId), inArray(storyPublicationPolicy.storyId, ids)));
      const history = await db.select({ article: siteArticle, site: mediaSite }).from(siteArticle).innerJoin(mediaSite, and(eq(mediaSite.id, siteArticle.siteId), eq(mediaSite.mediaId, site.mediaId))).where(and(eq(siteArticle.mediaId, site.mediaId), inArray(siteArticle.storyId, ids))).orderBy(asc(siteArticle.publishedAt), asc(siteArticle.id));
      for (const article of all) {
        const owner = policies.find(p => p.storyId === article.storyId)?.primarySiteId ?? history.find(h => h.article.storyId === article.storyId)?.site.id;
        const role = article.delivery?.role ?? (owner === site.id ? "primary" : "republication");
        const primary = history.find(h => h.article.storyId === article.storyId && h.site.id === owner && h.site.status === "live" && !h.article.withdrawnAt);
        const current = history.find(h => h.site.id === site.id && h.article.storyId === article.storyId);
        article.seo = { role, noindex: role !== "primary", canonicalPath: `/s/${site.slug}/news/${article.storyId}`, primaryPath: primary ? `/s/${primary.site.slug}/news/${article.storyId}` : null, modifiedAt: current?.article.modifiedAt?.toISOString() ?? article.publishedAt };
      }
    }
  }
  const { designBrief: _privateDesignBrief, ...publicSpec } = spec;
  return { site: { name: site.name, slug: site.slug, spec: publicSpec }, preview: Boolean(input.preview), articles, blocks, pagination: { page, total: input.preview ? articles.length : count.count, pageCount: input.preview ? 1 : pageCount }, selectedSection: input.sectionId ?? null, sectionOptions };
}

export async function siteSitemap(slug: string) {
  const [site] = await db.select().from(mediaSite).where(and(eq(mediaSite.slug, slug), eq(mediaSite.status, "live")));
  if (!site) throw new SiteError("سایت در دسترس نیست.", 404);
  if (!await mediaIsApproved(site.mediaId)) throw new SiteError("سایت در دسترس نیست.", 404);
  const articles = await db.select({ storyId: siteArticle.storyId, modifiedAt: siteArticle.modifiedAt, publishedAt: siteArticle.publishedAt }).from(siteArticle)
    .innerJoin(storyPublicationPolicy, and(eq(storyPublicationPolicy.storyId, siteArticle.storyId), eq(storyPublicationPolicy.mediaId, site.mediaId), eq(storyPublicationPolicy.primarySiteId, site.id)))
    .where(and(eq(siteArticle.siteId, site.id), eq(siteArticle.mediaId, site.mediaId), isNull(siteArticle.withdrawnAt))).orderBy(desc(siteArticle.publishedAt)).limit(49000);
  return { articles: articles.map(a => ({ path: `/s/${slug}/news/${a.storyId}`, modifiedAt: (a.modifiedAt ?? a.publishedAt).toISOString() })) };
}
