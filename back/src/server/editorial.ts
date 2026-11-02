import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { articleVersion, editorialApproval, editorialPolicy, editorialSection, editorialStory, mediaInboxItem, rawArticle, source, storySource } from "@/db/schema";
import { db } from "@/src/server/database";
import { recordAuditEvent } from "./audit";
import { EditorialError } from "./editorial-errors";
import { captureEditorialPolicy, editorialInputOptions, getPlatformEditorialConfig, matchesSectionInputs, sectionSettingsSchema, validateSectionSettings } from "./editorial-settings";
import { categoryMappingReady, canonicalArticleCategories } from "./category-mappings";
import { editorialSourceCategoryAccess } from "./media-source-category-access";
import { buildRenditions, renditionInput } from "./editorial-renditions";
import { editorialListInput, listEditorialStories, type EditorialListInput } from "./editorial-list";
import { EditorialRewriteError, rewriteWithCodex } from "./editorial-rewriter";
import { defaultEditorialInstructions, type SocialOutputSettings } from "@media/contracts/editorial-settings";
import { buildSocialOutput } from "./editorial-social-output";
export { EditorialError } from "./editorial-errors";

const plain = (min: number, max: number) => z.string().trim().min(min).max(max).refine(v => !/<\/?[a-z][^>]*>/i.test(v));
const id = z.string().min(1).max(128);
export const versionInput = z.object({
  expectedRevision: z.number().int().min(1), title: plain(3, 500),
  lead: plain(0, 4000), body: plain(80, 100000), sectionId: id, secondarySectionIds: z.array(id).max(20).optional(), sourceIds: z.array(id).min(1).max(20).optional(), renditions: renditionInput.optional(),
}).strict();
export const decisionInput = z.object({ expectedRevision: z.number().int().min(1), decision: z.enum(["approved", "rejected", "changes_requested"]), note: z.string().trim().max(2000) }).strict()
  .refine(v => v.decision === "approved" || v.note.length > 0);
export const createStoryInput = z.object({ rawArticleId: id, sectionId: id }).strict();
export const editorialPolicyPreviewInput = z.object({ name: plain(2, 80), settings: sectionSettingsSchema }).strict();
type Actor = { mediaId: string; actorUserId: string; correlationId: string };

const editorialPreviewSample = {
  sourceKey: "media-setup-editorial-sample-v1",
  sourceName: "نمونهٔ آزمایشی سامانه",
  title: "آغاز طرح بهسازی فضای سبز در چند محله",
  content: "شهرداری از آغاز طرحی برای بهسازی فضای سبز در چند محله خبر داد. در این طرح قرار است بوستان‌های محلی بازپیرایی شوند و امکاناتی مانند مسیر پیاده‌روی و روشنایی بهبود پیدا کند. مسئولان شهری اعلام کردند اجرای طرح از هفتهٔ آینده آغاز می‌شود و اولویت با محله‌هایی است که به خدمات عمومی کمتری دسترسی دارند. زمان‌بندی جزئی هر مرحله پس از بررسی وضعیت فنی و اعلام نظر ساکنان منتشر خواهد شد.",
};

export async function previewEditorialPolicy(actor: Actor, input: z.infer<typeof editorialPolicyPreviewInput>, signal: AbortSignal) {
  await validateSectionSettings(actor.mediaId, input.settings);
  const config = await getPlatformEditorialConfig();
  const effectiveConfig = config ?? { id: "builtin-default", revision: 0, instructions: defaultEditorialInstructions, factions: [] };
  const faction = input.settings.factionId ? effectiveConfig.factions.find(item => item.id === input.settings.factionId && item.enabled) ?? null : null;
  if (input.settings.factionId && !faction) throw new EditorialError("پروفایل انتخاب‌شده فعال نیست.", 409);
  try {
    const settings = { ...input.settings };
    delete settings.instructions;
    const output = await rewriteWithCodex({ ...editorialPreviewSample, policy: { platformConfigId: effectiveConfig.id, platformRevision: effectiveConfig.revision, instructions: input.settings.instructions?.trim() || defaultEditorialInstructions, sectionName: input.name, sectionRevision: 0, settings: { ...settings, socialOutput: input.settings.socialOutput }, faction } }, signal, { allowReviewRequired: true });
    const socialSettings = input.settings.socialOutput as SocialOutputSettings | undefined;
    const social = buildSocialOutput({ ...output, imageUrl: null }, socialSettings, output.socialText);
    return { title: output.title, lead: output.lead, body: output.body, socialText: social.text, reviewRequired: output.reviewRequired };
  } catch (error) {
    if (error instanceof EditorialRewriteError) {
      const messages: Record<string, string> = { CODEX_AUTH_REQUIRED: "برای پیش‌نمایش، ورود Codex روی Backend لازم است.", CODEX_RATE_LIMITED: "سهمیهٔ تولید فعلاً در دسترس نیست؛ کمی بعد دوباره امتحان کنید.", CODEX_TIMEOUT: "ساخت پیش‌نمایش بیش از حد طول کشید.", CONTENT_REVIEW_REQUIRED: "این نمونه برای بازنویسی خودکار امن نیست و به بررسی انسانی نیاز دارد.", OUTPUT_INVALID: "خروجی نمونه ساختار معتبر نداشت.", CODEX_REWRITE_FAILED: "ساخت پیش‌نمایش ناموفق بود." };
      throw new EditorialError(messages[error.code] ?? "ساخت پیش‌نمایش ناموفق بود.", 503, error.code);
    }
    throw error;
  }
}

export async function editorialWorkspace(mediaId: string, readyOnly = false, input: EditorialListInput = editorialListInput.parse({})) {
  const sections = await db.select().from(editorialSection).where(eq(editorialSection.mediaId, mediaId)).orderBy(editorialSection.name);
  const policies = await db.select().from(editorialPolicy).where(eq(editorialPolicy.mediaId, mediaId)).orderBy(desc(editorialPolicy.createdAt), desc(editorialPolicy.id));
  const listing = await listEditorialStories(mediaId, readyOnly, input);
  const config = await getPlatformEditorialConfig();
  return { ...listing, sections, policies, platformConfig: config, inputOptions: await editorialInputOptions(mediaId) };
}
export async function editorialDetail(mediaId: string, storyId: string) {
  const [story] = await db.select().from(editorialStory).where(and(eq(editorialStory.mediaId, mediaId), eq(editorialStory.id, storyId)));
  if (!story) throw new EditorialError("خبر تحریریه پیدا نشد.", 404);
  const versions = await db.select().from(articleVersion).where(and(eq(articleVersion.mediaId, mediaId), eq(articleVersion.storyId, storyId))).orderBy(desc(articleVersion.revision));
  const sources = await db.select().from(storySource).where(and(eq(storySource.mediaId, mediaId), eq(storySource.storyId, storyId)));
  const approvals = await db.select({ id: editorialApproval.id, versionId: editorialApproval.versionId, decision: editorialApproval.decision, note: editorialApproval.note, actorUserId: editorialApproval.actorUserId, createdAt: editorialApproval.createdAt })
    .from(editorialApproval).innerJoin(articleVersion, eq(articleVersion.id, editorialApproval.versionId)).where(and(eq(editorialApproval.mediaId, mediaId), eq(articleVersion.storyId, storyId))).orderBy(desc(editorialApproval.createdAt));
  const policies = versions.length ? await db.select().from(editorialPolicy).where(and(eq(editorialPolicy.mediaId, mediaId), inArray(editorialPolicy.id, versions.map(v => v.policyId)))) : [];
  return { story, versions: versions.map(v => ({ ...v, sourceIds: v.sourceIds ?? sources.map(s => s.id), renditions: v.renditions ?? buildRenditions(v, undefined, policies.find(p => p.id === v.policyId)?.settingsSnapshot?.settings.socialOutput) })), sources, approvals, policies };
}
export async function createEditorialStory(actor: Actor, input: z.infer<typeof createStoryInput>) {
  return db.transaction(async tx => {
    const [raw] = await tx.select({ article: rawArticle, sourceName: source.name, sourceUrl: source.url, mappingReady: categoryMappingReady, canonicalCategories: canonicalArticleCategories }).from(mediaInboxItem)
      .innerJoin(rawArticle, eq(rawArticle.id, mediaInboxItem.rawArticleId)).innerJoin(source, eq(source.id, rawArticle.sourceId))
      .where(and(eq(mediaInboxItem.mediaId, actor.mediaId), eq(rawArticle.id, input.rawArticleId), editorialSourceCategoryAccess(actor.mediaId)));
    if (!raw) throw new EditorialError("این خبر در صندوق رسانه وجود ندارد.", 404);
    if (!raw.mappingReady) throw new EditorialError("معادل‌سازی دسته‌های این منبع هنوز تکمیل نشده است.");
    if (raw.article.status === "quarantined" || !raw.article.content || raw.article.content.trim().length < 80) throw new EditorialError("خبر قرنطینه یا فاقد متن کامل، آمادهٔ تحریریه نیست.");
    const [section] = await tx.select().from(editorialSection).where(and(eq(editorialSection.id, input.sectionId), eq(editorialSection.mediaId, actor.mediaId))).for("update");
    if (!section) throw new EditorialError("سرویس تحریریهٔ رسانه را انتخاب کنید.");
    if (!matchesSectionInputs(section.settings, { ...raw.article, categories: raw.canonicalCategories, sourceUrl: raw.sourceUrl })) throw new EditorialError("این خبر با منابع و دسته‌بندی‌های ورودی سرویس تطابق ندارد.");
    const policy = await captureEditorialPolicy(actor, section, tx);
    const storyId = randomUUID();
    await tx.insert(editorialStory).values({ id: storyId, mediaId: actor.mediaId });
    const sourceId = randomUUID();
    await tx.insert(storySource).values({ id: sourceId, mediaId: actor.mediaId, storyId, rawArticleId: raw.article.id, snapshot: { title: raw.article.title, content: raw.article.content, url: raw.article.canonicalUrl, imageUrl: raw.article.imageUrl, sourceId: raw.article.sourceId, sourceName: raw.sourceName, provenance: raw.article.provenance } });
    await tx.insert(articleVersion).values({ id: randomUUID(), mediaId: actor.mediaId, storyId, revision: 1, policyId: policy.id, sectionId: section.id, title: raw.article.title, lead: raw.article.summary ?? "", body: raw.article.content, imageUrl: raw.article.imageUrl, sourceIds: [sourceId], renditions: buildRenditions({ title: raw.article.title, lead: raw.article.summary ?? "", body: raw.article.content, imageUrl: raw.article.imageUrl }, undefined, policy.settingsSnapshot?.settings.socialOutput), actorUserId: actor.actorUserId });
    await recordAuditEvent({ ...actor, action: "editorial.story.created", targetType: "story", targetId: storyId, metadata: { rawArticleId: raw.article.id, policyId: policy.id } }, tx);
    return { id: storyId };
  });
}
export async function saveEditorialVersion(actor: Actor, storyId: string, input: z.infer<typeof versionInput>) {
  return db.transaction(tx => saveVersion(tx, actor, storyId, input));
}
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function saveVersion(tx: Transaction, actor: Actor, storyId: string, input: z.infer<typeof versionInput>) {
    const [section] = await tx.select().from(editorialSection).where(and(eq(editorialSection.id, input.sectionId), eq(editorialSection.mediaId, actor.mediaId))).for("update");
    if (!section) throw new EditorialError("سرویس معتبر نیست.");
    const policy = await captureEditorialPolicy(actor, section, tx);
    const [story] = await tx.update(editorialStory).set({ revision: sql`${editorialStory.revision} + 1`, status: "draft", updatedAt: new Date() })
      .where(and(eq(editorialStory.id, storyId), eq(editorialStory.mediaId, actor.mediaId), eq(editorialStory.revision, input.expectedRevision))).returning();
    if (!story) throw new EditorialError("خبر تغییر کرده یا در دسترس نیست؛ نسخهٔ تازه را باز کنید.");
    const [previous] = await tx.select().from(articleVersion).where(and(eq(articleVersion.storyId, storyId), eq(articleVersion.revision, input.expectedRevision)));
    const secondaryIds = input.secondarySectionIds ?? previous.secondarySectionIds;
    if (new Set(secondaryIds).size !== secondaryIds.length || secondaryIds.includes(section.id)) throw new EditorialError("بخش‌های ثانویه تکراری یا برابر بخش اصلی نیستند.");
    const secondary = secondaryIds.length ? await tx.select().from(editorialSection).where(and(eq(editorialSection.mediaId, actor.mediaId), inArray(editorialSection.id, secondaryIds))) : [];
    if (secondary.length !== secondaryIds.length || secondary.some(s => s.archived)) throw new EditorialError("بخش ثانویه در دسترس رسانه نیست.");
    const availableSources = await tx.select().from(storySource).where(and(eq(storySource.mediaId, actor.mediaId), eq(storySource.storyId, storyId)));
    const sourceIds = input.sourceIds ?? previous.sourceIds ?? availableSources.map(s => s.id);
    if (!sourceIds.length || new Set(sourceIds).size !== sourceIds.length || sourceIds.some(id => !availableSources.some(s => s.id === id))) throw new EditorialError("هر خبر باید حداقل یک منبع معتبر از همین خبر داشته باشد.");
    await tx.insert(articleVersion).values({ id: randomUUID(), mediaId: actor.mediaId, storyId, revision: story.revision, policyId: policy.id, sectionId: section.id, title: input.title, lead: input.lead, body: input.body, imageUrl: previous.imageUrl, secondarySectionIds: secondaryIds, sourceIds, renditions: buildRenditions({ title: input.title, lead: input.lead, body: input.body, imageUrl: previous.imageUrl }, input.renditions, policy.settingsSnapshot?.settings.socialOutput), actorUserId: actor.actorUserId });
    await recordAuditEvent({ ...actor, action: "editorial.version.created", targetType: "story", targetId: storyId, metadata: { revision: story.revision, policyId: policy.id } }, tx);
    return { id: storyId };
}
export async function decideEditorialVersion(actor: Actor, storyId: string, input: z.infer<typeof decisionInput>) {
  return db.transaction(async tx => {
    const [story] = await tx.update(editorialStory).set({ status: input.decision, updatedAt: new Date() })
      .where(and(eq(editorialStory.id, storyId), eq(editorialStory.mediaId, actor.mediaId), eq(editorialStory.revision, input.expectedRevision), inArray(editorialStory.status, ["draft", "ready"]))).returning();
    if (!story) throw new EditorialError("این نسخه تغییر کرده یا قبلاً تصمیم‌گیری شده است؛ دوباره بارگذاری کنید.");
    const [version] = await tx.select().from(articleVersion).where(and(eq(articleVersion.storyId, storyId), eq(articleVersion.revision, story.revision)));
    await tx.insert(editorialApproval).values({ id: randomUUID(), mediaId: actor.mediaId, versionId: version.id, decision: input.decision, note: input.note, actorUserId: actor.actorUserId });
    await recordAuditEvent({ ...actor, action: `editorial.version.${input.decision}`, targetType: "article_version", targetId: version.id, metadata: { policyId: version.policyId, revision: story.revision } }, tx);
    return { id: storyId };
  });
}

export const storySourceInput = z.object({ expectedRevision: z.number().int().min(1), rawArticleId: id.optional(), sourceId: id.optional() }).strict().refine(v => !!v.rawArticleId !== !!v.sourceId);
export async function changeStorySources(actor: Actor, storyId: string, input: z.infer<typeof storySourceInput>) {
  return db.transaction(async tx => {
    const [current] = await tx.select().from(articleVersion).where(and(eq(articleVersion.mediaId, actor.mediaId), eq(articleVersion.storyId, storyId), eq(articleVersion.revision, input.expectedRevision)));
    if (!current) throw new EditorialError("خبر یا نسخه پیدا نشد.", 404);
    // Serialize source changes before inserting provenance, in the same lock order as version edits.
    await tx.select({ id: editorialSection.id }).from(editorialSection).where(and(eq(editorialSection.id, current.sectionId), eq(editorialSection.mediaId, actor.mediaId))).for("update");
    const [latest] = await tx.select({ revision: editorialStory.revision }).from(editorialStory).where(and(eq(editorialStory.id, storyId), eq(editorialStory.mediaId, actor.mediaId)));
    if (latest?.revision !== input.expectedRevision) throw new EditorialError("خبر تغییر کرده؛ نسخهٔ تازه را باز کنید.");
    const all = await tx.select().from(storySource).where(and(eq(storySource.storyId, storyId), eq(storySource.mediaId, actor.mediaId)));
    let sourceIds = current.sourceIds ?? all.map(s => s.id);
    if (input.rawArticleId) {
      const [raw] = await tx.select({ article: rawArticle, name: source.name, mappingReady: categoryMappingReady }).from(mediaInboxItem).innerJoin(rawArticle, eq(rawArticle.id, mediaInboxItem.rawArticleId)).innerJoin(source, eq(source.id, rawArticle.sourceId)).where(and(eq(mediaInboxItem.mediaId, actor.mediaId), eq(rawArticle.id, input.rawArticleId), editorialSourceCategoryAccess(actor.mediaId)));
      if (!raw) throw new EditorialError("خبر منبع در صندوق این رسانه پیدا نشد.", 404);
      if (!raw.mappingReady) throw new EditorialError("معادل‌سازی دسته‌های این منبع هنوز تکمیل نشده است.");
      if (raw.article.status !== "new" || !raw.article.content || raw.article.content.trim().length < 80) throw new EditorialError("خبر منبع سالم و کامل نیست.");
      let attached = all.find(s => s.rawArticleId === input.rawArticleId);
      if (attached && sourceIds.includes(attached.id)) throw new EditorialError("منبع قبلاً متصل شده است.");
      if (!attached) [attached] = await tx.insert(storySource).values({ id: randomUUID(), mediaId: actor.mediaId, storyId, rawArticleId: raw.article.id, snapshot: { title: raw.article.title, content: raw.article.content, url: raw.article.canonicalUrl, sourceId: raw.article.sourceId, sourceName: raw.name, imageUrl: raw.article.imageUrl, provenance: raw.article.provenance } }).returning();
      sourceIds = [...sourceIds, attached.id];
    } else {
      if (!sourceIds.includes(input.sourceId!)) throw new EditorialError("منبع به این نسخه متصل نیست.");
      sourceIds = sourceIds.filter(id => id !== input.sourceId);
    }
    if (sourceIds.length > 20) throw new EditorialError("حداکثر ۲۰ منبع برای هر نسخه مجاز است.");
    const result = await saveVersion(tx, actor, storyId, { expectedRevision: input.expectedRevision, sectionId: current.sectionId, secondarySectionIds: current.secondarySectionIds, sourceIds, title: current.title, lead: current.lead, body: current.body, renditions: current.renditions ? { social: current.renditions.social, webCard: current.renditions.webCard } : undefined });
    await recordAuditEvent({ ...actor, action: input.rawArticleId ? "editorial.source.attached" : "editorial.source.detached", targetType: "story", targetId: storyId }, tx);
    return result;
  });
}

