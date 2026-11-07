import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { articleVersion, storySource, editorialJob, editorialPolicy, editorialSection, mediaInboxItem, mediaSourceSubscription, platformEditorialConfig, rawArticle, source, sourceAccessRequest } from "@/db/schema";
import { db } from "./database";
import { recordAuditEvent } from "./audit";
import { EditorialError } from "./editorial-errors";
import type { EditorialSettingsSnapshot, SectionSettings } from "@media/contracts/editorial-settings";
import { defaultEditorialInstructions, defaultSocialInstructions, defaultSocialOutput, defaultAutomaticFreshness } from "@media/contracts/editorial-settings";
import { socialOutputSchema } from "./editorial-social-output";
import { categoryMappingReady, canonicalArticleCategories } from "./category-mappings";
import { automaticInputConditions, excludedAutomaticJob, resumedAutomaticSettings } from "./editorial-freshness";
import { editorialSourceCategoryAccess } from "./media-source-category-access";

const id = z.string().trim().min(1).max(128);
const range = z.number().int().min(0).max(100);
export const sectionSettingsSchema = z.object({ sourceAttribution: z.object({ website: z.enum(["named", "omit"]), social: z.enum(["named", "omit"]) }).strict().optional(), language: z.enum(["fa", "en", "ar", "tr", "fr", "de", "es", "ru"]).default("fa"), socialOutput: socialOutputSchema.optional(), autoReceivedSince: z.iso.datetime({ offset: true }).nullable().optional(), autoFreshness: z.object({ maxAgeHours: z.number().int().min(1).max(720).nullable(), unknownDatePolicy: z.enum(["skip", "received"]), resumeMode: z.enum(["new_only", "continue"]) }).strict().optional(), instructions: z.string().trim().min(20).max(10000).optional(), socialInstructions: z.string().trim().min(20).max(5000).optional(), factionId: id.nullable(), viewpointStrength: range, humor: range, formality: range, sourceIds: z.array(id).max(100), sourceUrls: z.array(z.string().url().max(2048)).max(100).optional(), categories: z.array(z.string().trim().min(1).max(200)).max(100) }).strict();
export const managedSectionInput = z.object({ name: z.string().trim().min(2).max(80), startAutoNow: z.boolean().optional(), parentId: id.nullable().optional(), settings: sectionSettingsSchema, autoEnabled: z.boolean().default(false), autoIntervalMinutes: z.number().int().min(1).max(1440).default(10), autoBatchSize: z.number().int().min(1).max(10).default(3) }).strict();
export const updateSectionInput = managedSectionInput.extend({ expectedRevision: z.number().int().min(1), archived: z.boolean(), paused: z.boolean().optional() });
export const platformConfigInput = z.object({ expectedRevision: z.number().int().min(0), instructions: z.string().trim().min(20).max(10000), factions: z.array(z.object({ id, name: z.string().trim().min(2).max(80), viewpoint: z.string().trim().min(20).max(5000), enabled: z.boolean() }).strict()).max(30) }).strict().refine(v => new Set(v.factions.map(f => f.id)).size === v.factions.length && new Set(v.factions.map(f => f.name)).size === v.factions.length);
type Actor = { mediaId: string; actorUserId: string; correlationId: string };
type Executor = Pick<typeof db, "select" | "insert">;
function conflict(error: unknown): never {
  const value = error as { code?: string; cause?: { code?: string } };
  if ((value?.code ?? value?.cause?.code) === "23505") throw new EditorialError("نام سرویس تکراری است یا تنظیمات هم‌زمان تغییر کرده؛ دوباره بارگذاری کنید.");
  throw error;
}
export async function getPlatformEditorialConfig(executor: Pick<typeof db, "select"> = db) {
  const [config] = await executor.select().from(platformEditorialConfig).orderBy(desc(platformEditorialConfig.revision)).limit(1);
  return config ?? null;
}
export async function savePlatformEditorialConfig(actorUserId: string, correlationId: string, input: z.infer<typeof platformConfigInput>) {
  return db.transaction(async tx => {
    const latest = await getPlatformEditorialConfig(tx);
    if ((latest?.revision ?? 0) !== input.expectedRevision) throw new EditorialError("تنظیمات ادمین تغییر کرده؛ دوباره بارگذاری کنید.");
    const [config] = await tx.insert(platformEditorialConfig).values({ id: randomUUID(), revision: input.expectedRevision + 1, instructions: input.instructions, factions: input.factions, actorUserId }).returning();
    await recordAuditEvent({ actorUserId, correlationId, action: "platform.editorial.config.created", targetType: "editorial_config", targetId: config.id, metadata: { revision: config.revision } }, tx);
    return config;
  }).catch(conflict);
}
export async function editorialInputOptions(mediaId: string, executor: Pick<typeof db, "select"> = db) {
  const inbox = await executor.select({ id: source.id, name: source.name, url: source.url, categories: canonicalArticleCategories }).from(mediaInboxItem)
    .innerJoin(rawArticle, eq(rawArticle.id, mediaInboxItem.rawArticleId)).innerJoin(source, eq(source.id, rawArticle.sourceId)).where(eq(mediaInboxItem.mediaId, mediaId));
  const subscriptions = await executor.select({ id: source.id, name: source.name, url: source.url }).from(mediaSourceSubscription).innerJoin(source, eq(source.id, mediaSourceSubscription.sourceId))
    .where(and(eq(mediaSourceSubscription.mediaId, mediaId), eq(mediaSourceSubscription.enabled, true)));
  const sources = [...new Map([...subscriptions, ...inbox].map(s => [s.id, { id: s.id, name: s.name, url: s.url }])).values()].sort((a, b) => a.name.localeCompare(b.name));
  return { sources, categories: [...new Set(inbox.flatMap(s => s.categories))].sort() };
}
export async function validateSectionSettings(mediaId: string, settings: SectionSettings, executor: Pick<typeof db, "select"> = db) {
  const config = await getPlatformEditorialConfig(executor);
  if (settings.factionId && !config?.factions.some(f => f.id === settings.factionId && f.enabled)) throw new EditorialError("جناح انتخاب‌شده فعال نیست یا ادمین آن را تعریف نکرده است.");
  const options = await editorialInputOptions(mediaId, executor);
  if (settings.sourceIds.some(id => !options.sources.some(s => s.id === id))) throw new EditorialError("منبع انتخاب‌شده در دسترس این رسانه نیست.");
  const sourceUrls = settings.sourceUrls ?? [];
  if (sourceUrls.length) {
    const requests = await executor.select({ url: sourceAccessRequest.url }).from(sourceAccessRequest).where(and(eq(sourceAccessRequest.mediaId, mediaId), inArray(sourceAccessRequest.url, sourceUrls), inArray(sourceAccessRequest.status, ["pending", "crawler_queued", "crawler_failed", "access_granted"])));
    if (requests.length !== new Set(sourceUrls).size) throw new EditorialError("یکی از لینک‌های منبع برای این رسانه درخواست نشده است.");
  }
  if (new Set(settings.sourceIds).size !== settings.sourceIds.length || new Set(sourceUrls).size !== sourceUrls.length || new Set(settings.categories).size !== settings.categories.length) throw new EditorialError("ورودی تکراری معتبر نیست.");
}
export async function createManagedSection(actor: Actor, input: z.infer<typeof managedSectionInput>) {
  return db.transaction(async tx => {
    await validateSectionParent(actor.mediaId, null, input.parentId ?? null, false, tx);
    await validateSectionSettings(actor.mediaId, input.settings, tx);
    const { startAutoNow, ...values } = input;
    const settings = { ...input.settings, autoFreshness: input.settings.autoFreshness ?? defaultAutomaticFreshness, autoReceivedSince: startAutoNow ? new Date().toISOString() : input.settings.autoReceivedSince ?? null };
    const [section] = await tx.insert(editorialSection).values({ id: randomUUID(), mediaId: actor.mediaId, ...values, settings, autoActorUserId: input.autoEnabled ? actor.actorUserId : null }).returning();
    await recordAuditEvent({ ...actor, action: "editorial.section.created", targetType: "section", targetId: section.id, metadata: { autoReceivedSince: settings.autoReceivedSince } }, tx);
    return section;
  }).catch(conflict);
}
export async function updateManagedSection(actor: Actor, id: string, input: z.infer<typeof updateSectionInput>) {
  return db.transaction(async tx => {
    const lockedSections = await tx.select().from(editorialSection).where(eq(editorialSection.mediaId, actor.mediaId)).orderBy(editorialSection.id).for("update");
    // Archiving/restoring must remain possible if a previously selected faction/source becomes unavailable.
    const [previous] = await tx.select().from(editorialSection).where(and(eq(editorialSection.id, id), eq(editorialSection.mediaId, actor.mediaId)));
    if (!previous) throw new EditorialError("سرویس پیدا نشد.", 404);
    await validateSectionParent(actor.mediaId, id, input.parentId === undefined ? previous.parentId : input.parentId, input.archived, tx, lockedSections);
    if (!isDeepStrictEqual(previous.settings, input.settings)) await validateSectionSettings(actor.mediaId, input.settings, tx);
    let settings = { ...input.settings, autoFreshness: input.settings.autoFreshness ?? previous.settings.autoFreshness, autoReceivedSince: input.startAutoNow ? new Date().toISOString() : input.settings.autoReceivedSince === undefined ? previous.settings.autoReceivedSince ?? null : input.settings.autoReceivedSince };
    if ((!previous.autoEnabled && input.autoEnabled) || (previous.paused && input.paused === false)) settings = resumedAutomaticSettings(settings) as typeof settings;
    const startChanged = (previous.settings.autoReceivedSince ?? null) !== settings.autoReceivedSince;
    const freshnessChanged = !isDeepStrictEqual(previous.settings.autoFreshness, settings.autoFreshness);
    const [section] = await tx.update(editorialSection).set({ ...(startChanged ? { lastEnqueuedAt: null, autoErrorCode: null } : {}), name: input.name, parentId: input.parentId === undefined ? previous.parentId : input.parentId, settings, archived: input.archived, paused: input.paused ?? previous.paused, autoEnabled: input.archived ? false : input.autoEnabled, autoIntervalMinutes: input.autoIntervalMinutes, autoBatchSize: input.autoBatchSize, autoActorUserId: input.autoEnabled ? actor.actorUserId : null, revision: sql`${editorialSection.revision} + 1` })
      .where(and(eq(editorialSection.id, id), eq(editorialSection.mediaId, actor.mediaId), eq(editorialSection.revision, input.expectedRevision))).returning();
    if (!section) throw new EditorialError("سرویس تغییر کرده؛ تنظیمات تازه را باز کنید.");
    if (input.archived || section.paused || !section.autoEnabled) await tx.update(editorialJob).set({ status: "cancelled", claimToken: null, leaseUntil: null, finishedAt: new Date(), errorCode: "SERVICE_STOPPED" }).where(and(eq(editorialJob.sectionId, id), eq(editorialJob.mediaId, actor.mediaId), sql`${editorialJob.status} in ('queued','running')`, (input.archived || section.paused) ? sql`true` : eq(editorialJob.trigger, "automatic")));
    if (startChanged || freshnessChanged) {
      // The service row lock serializes this cancellation with enqueue and completion.
      await tx.update(editorialJob).set({ status: "cancelled", claimToken: null, leaseUntil: null, finishedAt: new Date(), errorCode: startChanged ? "AUTO_START_CHANGED" : "AUTO_FRESHNESS_CHANGED" }).where(and(
        eq(editorialJob.mediaId, actor.mediaId), eq(editorialJob.sectionId, id), eq(editorialJob.trigger, "automatic"), inArray(editorialJob.status, ["queued", "running"]),
        excludedAutomaticJob(settings)
      ));
    }
    await recordAuditEvent({ ...actor, action: input.archived ? "editorial.section.archived" : "editorial.section.updated", targetType: "section", targetId: id, metadata: { revision: section.revision, autoReceivedSince: settings.autoReceivedSince } }, tx);
    return section;
  }).catch(conflict);
}
export async function setSectionPaused(actor: Actor, id: string, expectedRevision: number, paused: boolean) {
  return db.transaction(async tx => {
    const [previous] = await tx.select().from(editorialSection).where(and(eq(editorialSection.id, id), eq(editorialSection.mediaId, actor.mediaId), eq(editorialSection.archived, false))).for("update");
    if (!previous) throw new EditorialError("سرویس تغییر کرده یا حذف شده؛ دوباره بارگذاری کنید.");
    const settings = previous.paused && !paused ? resumedAutomaticSettings(previous.settings) : previous.settings;
    const [section] = await tx.update(editorialSection).set({ paused, settings, revision: sql`${editorialSection.revision} + 1`, ...(paused ? {} : { lastEnqueuedAt: null, autoErrorCode: null }) })
      .where(and(eq(editorialSection.id, id), eq(editorialSection.mediaId, actor.mediaId), eq(editorialSection.archived, false), eq(editorialSection.revision, expectedRevision))).returning();
    if (!section) throw new EditorialError("سرویس تغییر کرده یا حذف شده؛ دوباره بارگذاری کنید.");
    if (paused) await tx.update(editorialJob).set({ status: "cancelled", claimToken: null, leaseUntil: null, finishedAt: new Date(), errorCode: "SERVICE_STOPPED" })
      .where(and(eq(editorialJob.sectionId, id), eq(editorialJob.mediaId, actor.mediaId), inArray(editorialJob.status, ["queued", "running"])));
    await recordAuditEvent({ ...actor, action: paused ? "editorial.section.stopped" : "editorial.section.resumed", targetType: "section", targetId: id, metadata: { revision: section.revision } }, tx);
    return section;
  });
}
export function matchesSectionInputs(settings: SectionSettings, article: { sourceId: string; sourceUrl?: string; categories: string[] }) {
  const sourceIds = settings.sourceIds;
  const sourceUrls = settings.sourceUrls ?? [];
  const sourceMatches = (!sourceIds.length && !sourceUrls.length) || sourceIds.includes(article.sourceId) || Boolean(article.sourceUrl && sourceUrls.includes(article.sourceUrl));
  return sourceMatches && (!settings.categories.length || settings.categories.some(c => article.categories.includes(c)));
}
export async function getSectionCandidates(mediaId: string, sectionId: string, unprocessed = false) {
  const [section] = await db.select().from(editorialSection).where(and(eq(editorialSection.id, sectionId), eq(editorialSection.mediaId, mediaId), eq(editorialSection.archived, false)));
  if (!section) throw new EditorialError("سرویس فعال پیدا نشد.", 404);
  const conditions = [eq(mediaInboxItem.mediaId, mediaId), eq(rawArticle.status, "new"), sql`length(trim(${rawArticle.content})) >= 80`, categoryMappingReady, editorialSourceCategoryAccess(mediaId)];
  if (unprocessed) {
    conditions.push(automaticInputConditions(section.settings));
    conditions.push(sql`NOT EXISTS (SELECT 1 FROM ${editorialJob} WHERE ${editorialJob.mediaId} = ${mediaInboxItem.mediaId} AND ${editorialJob.sectionId} = ${sectionId} AND ${editorialJob.inputKey} = ${rawArticle.id})`);
    conditions.push(sql`NOT EXISTS (SELECT 1 FROM ${storySource} JOIN ${articleVersion} ON ${articleVersion.storyId} = ${storySource.storyId} WHERE ${storySource.mediaId} = ${mediaInboxItem.mediaId} AND ${storySource.rawArticleId} = ${rawArticle.id} AND ${articleVersion.sectionId} = ${sectionId})`);
  }
  const sourceUrls = section.settings.sourceUrls ?? [];
  if (section.settings.sourceIds.length || sourceUrls.length) {
    const urlSources = sourceUrls.length ? await db.select({ id: source.id }).from(source).where(inArray(source.url, sourceUrls)) : [];
    const selectedSourceIds = [...new Set([...section.settings.sourceIds, ...urlSources.map(row => row.id)])];
    conditions.push(selectedSourceIds.length ? inArray(rawArticle.sourceId, selectedSourceIds) : sql`false`);
  }
  if (section.settings.categories.length) conditions.push(sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(${canonicalArticleCategories}) AS category(value) WHERE category.value IN (${sql.join(section.settings.categories.map(c => sql`${c}`), sql`, `)}))`);
  return db.select({ id: rawArticle.id, title: rawArticle.title, sourceName: source.name, categories: canonicalArticleCategories, ingestedAt: rawArticle.ingestedAt }).from(mediaInboxItem)
    .innerJoin(rawArticle, eq(rawArticle.id, mediaInboxItem.rawArticleId)).innerJoin(source, eq(source.id, rawArticle.sourceId)).where(and(...conditions)).orderBy(desc(rawArticle.ingestedAt), desc(rawArticle.id)).limit(50);
}
export async function captureEditorialPolicy(actor: Actor, section: typeof editorialSection.$inferSelect, executor: Executor) {
  if (section.archived || section.paused) throw new EditorialError("سرویس حذف یا متوقف شده است؛ یک سرویس فعال انتخاب کنید.");
  const config = await getPlatformEditorialConfig(executor);
  const effectiveConfig = config ?? { id: "builtin-default", revision: 0, instructions: defaultEditorialInstructions, factions: [] };
  const faction = section.settings.factionId ? effectiveConfig.factions.find(f => f.id === section.settings.factionId && f.enabled) : null;
  if (section.settings.factionId && !faction) throw new EditorialError("جناح این سرویس غیرفعال شده؛ جهت نگارش را دوباره انتخاب کنید.");
  const settings = { ...section.settings, socialInstructions: section.settings.socialInstructions?.trim() || defaultSocialInstructions };
  delete settings.instructions;
  const effectiveInstructions = section.settings.instructions?.trim() || defaultEditorialInstructions;
  const snapshot: EditorialSettingsSnapshot = { platformConfigId: effectiveConfig.id, platformRevision: effectiveConfig.revision, instructions: effectiveInstructions, sectionName: section.name, sectionRevision: section.revision, settings: { ...settings, socialOutput: section.settings.socialOutput ?? { ...defaultSocialOutput } }, faction: faction ?? null };
  const [policy] = await executor.insert(editorialPolicy).values({ id: randomUUID(), mediaId: actor.mediaId, actorUserId: actor.actorUserId, instructions: effectiveInstructions, settingsSnapshot: snapshot }).returning();
  return policy;
}

async function validateSectionParent(mediaId: string, id: string | null, parentId: string | null, archived: boolean, executor: Pick<typeof db, "select">, existing?: typeof editorialSection.$inferSelect[]) {
  const sections = existing ?? await executor.select().from(editorialSection).where(eq(editorialSection.mediaId, mediaId));
  if (archived && sections.some(s => s.parentId === id && !s.archived)) throw new EditorialError("ابتدا بخش‌های فرعی را منتقل یا حذف کنید.");
  const seen = new Set(id ? [id] : []); let next = parentId;
  while (next) {
    if (seen.has(next)) throw new EditorialError("بخش نمی‌تواند زیرمجموعهٔ خودش یا فرزندش باشد.");
    seen.add(next); const parent = sections.find(s => s.id === next);
    if (!parent || (!archived && parent.archived)) throw new EditorialError("بخش بالادست فعال در این رسانه پیدا نشد.");
    next = parent.parentId;
  }
}
