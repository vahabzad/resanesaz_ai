import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { articleVersion, editorialPolicy, editorialSection, editorialStory, storySource } from "@/db/schema";
import { db } from "./database";

export const editorialListInput = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().pipe(z.union([z.literal(10), z.literal(20), z.literal(50)])).default(20),
  query: z.string().trim().max(200).default(""),
  status: z.enum(["draft", "ready", "approved", "rejected", "changes_requested"]).optional(),
  sectionId: z.string().max(128).optional(), sourceId: z.string().max(128).optional(),
  language: z.enum(["fa", "en", "ar", "tr", "fr", "de", "es", "ru"]).optional(),
  from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional(),
}).strict().refine(v => !v.from || !v.to || Date.parse(v.from) <= Date.parse(v.to));
export type EditorialListInput = z.infer<typeof editorialListInput>;
export async function listEditorialStories(mediaId: string, readyOnly: boolean, input: EditorialListInput) {
  const language = sql<string>`coalesce(${editorialPolicy.settingsSnapshot}->'settings'->>'language', 'fa')`;
  const conditions = [eq(editorialStory.mediaId, mediaId)];
  if (readyOnly) conditions.push(inArray(editorialStory.status, ["ready", "approved"]));
  if (input.status) conditions.push(eq(editorialStory.status, input.status));
  if (input.query) {
    const pattern = `%${input.query.replace(/[يك]/g, c => c === "ي" ? "ی" : "ک").replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(sql`translate(${articleVersion.title}, 'يك', 'یک') ILIKE ${pattern}`);
  }
  if (input.sectionId) conditions.push(sql`(${articleVersion.sectionId} = ${input.sectionId} OR ${articleVersion.secondarySectionIds} @> ${JSON.stringify([input.sectionId])}::jsonb)`);
  if (input.language) conditions.push(sql`${language} = ${input.language}`);
  if (input.from) conditions.push(sql`${editorialStory.updatedAt} >= ${input.from}::timestamptz`);
  if (input.to) conditions.push(sql`${editorialStory.updatedAt} <= ${input.to}::timestamptz`);
  if (input.sourceId) conditions.push(sql`EXISTS (SELECT 1 FROM ${storySource} WHERE ${storySource.storyId} = ${editorialStory.id} AND ${storySource.mediaId} = ${mediaId} AND ${storySource.snapshot}->>'sourceId' = ${input.sourceId} AND (${articleVersion.sourceIds} IS NULL OR ${articleVersion.sourceIds} ? ${storySource.id}))`);
  const joins = () => db.select({ count: sql<number>`count(*)::int` }).from(editorialStory)
    .innerJoin(articleVersion, and(eq(articleVersion.storyId, editorialStory.id), eq(articleVersion.revision, editorialStory.revision)))
    .innerJoin(editorialPolicy, eq(editorialPolicy.id, articleVersion.policyId));
  const [count] = await joins().where(and(...conditions));
  const pageCount = Math.max(1, Math.ceil(count.count / input.pageSize)); const page = Math.min(input.page, pageCount);
  const sourceNames = sql<string[]>`coalesce((SELECT jsonb_agg(DISTINCT ${storySource.snapshot}->>'sourceName' ORDER BY ${storySource.snapshot}->>'sourceName') FROM ${storySource} WHERE ${storySource.storyId} = ${editorialStory.id} AND ${storySource.mediaId} = ${mediaId} AND (${articleVersion.sourceIds} IS NULL OR ${articleVersion.sourceIds} ? ${storySource.id}) AND nullif(trim(${storySource.snapshot}->>'sourceName'), '') IS NOT NULL), '[]'::jsonb)`;
  const stories = await db.select({ id: editorialStory.id, status: editorialStory.status, revision: editorialStory.revision, title: articleVersion.title, sectionName: editorialSection.name, language, sourceNames, updatedAt: editorialStory.updatedAt })
    .from(editorialStory).innerJoin(articleVersion, and(eq(articleVersion.storyId, editorialStory.id), eq(articleVersion.revision, editorialStory.revision)))
    .innerJoin(editorialSection, eq(editorialSection.id, articleVersion.sectionId)).innerJoin(editorialPolicy, eq(editorialPolicy.id, articleVersion.policyId))
    .where(and(...conditions)).orderBy(desc(editorialStory.updatedAt), desc(editorialStory.id)).limit(input.pageSize).offset((page - 1) * input.pageSize);
  return { stories, pagination: { page, pageSize: input.pageSize, total: count.count, pageCount } };
}
