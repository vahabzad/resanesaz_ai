import { randomUUID } from "node:crypto";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { auditEvent, platformCategory, rawArticle, source, sourceCategoryMapping, user } from "@/db/schema";
import { db } from "./database";
import { recordAuditEvent } from "./audit";

export class CategoryMappingError extends Error { constructor(message: string, readonly status = 409) { super(message); } }
export const mappingListInput = z.object({ status: z.enum(["pending", "mapped", "all"]).default("pending"), q: z.string().trim().max(200).default(""), page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
const categoryNames = z.object({ nameFa: z.string().trim().min(2).max(100), nameEn: z.string().trim().min(2).max(100), nameAr: z.string().trim().min(2).max(100) }).strict();
export const mappingUpdateInput = z.union([
  z.object({ expectedRevision: z.number().int().min(1), categoryId: z.string().min(1).max(128) }).strict(),
  z.object({ expectedRevision: z.number().int().min(1), newCategory: categoryNames }).strict(),
]);

export async function registerSourceCategories(sourceId: string, names: string[]) {
  const labels = [...new Set(names.map(name => name.trim()).filter(Boolean))];
  if (!labels.length) labels.push("");
  await db.insert(sourceCategoryMapping).values(labels.map(rawName => ({ id: randomUUID(), sourceId, rawName })))
    .onConflictDoUpdate({ target: [sourceCategoryMapping.sourceId, sourceCategoryMapping.rawName], set: { lastSeenAt: new Date() } });
}

// A raw category is still preserved on the article. Eligibility is derived separately.
const matchesRaw = sql`(${sourceCategoryMapping.rawName} IN (SELECT trim(value) FROM jsonb_array_elements_text(${rawArticle.categories})) OR (${sourceCategoryMapping.rawName} = '' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(${rawArticle.categories}) AS c(value) WHERE trim(c.value) <> '')))`;
export const categoryMappingReady = sql`NOT EXISTS (SELECT 1 FROM ${sourceCategoryMapping} LEFT JOIN ${platformCategory} ON ${platformCategory.id} = ${sourceCategoryMapping.platformCategoryId} WHERE ${sourceCategoryMapping.sourceId} = ${rawArticle.sourceId} AND ${matchesRaw} AND (${sourceCategoryMapping.platformCategoryId} IS NULL OR ${platformCategory.active} IS NOT TRUE))`;
export const canonicalArticleCategories = sql<string[]>`CASE WHEN EXISTS (SELECT 1 FROM ${sourceCategoryMapping} WHERE ${sourceCategoryMapping.sourceId} = ${rawArticle.sourceId}) THEN COALESCE((SELECT jsonb_agg(DISTINCT ${platformCategory.nameFa}) FROM ${sourceCategoryMapping} JOIN ${platformCategory} ON ${platformCategory.id} = ${sourceCategoryMapping.platformCategoryId} AND ${platformCategory.active} = true WHERE ${sourceCategoryMapping.sourceId} = ${rawArticle.sourceId} AND ${matchesRaw}), '[]'::jsonb) ELSE ${rawArticle.categories} END`;

const mapped = sql`(${sourceCategoryMapping.platformCategoryId} IS NOT NULL AND ${platformCategory.active} = true)`;
export async function categoryMappingSummary() {
  const [row] = await db.select({ total: count(), mapped: sql<number>`count(*) FILTER (WHERE ${mapped})` }).from(sourceCategoryMapping).leftJoin(platformCategory, eq(platformCategory.id, sourceCategoryMapping.platformCategoryId));
  return { total: Number(row.total), mapped: Number(row.mapped), pending: Number(row.total) - Number(row.mapped) };
}

export async function categoryMappingWorkspace(input: z.infer<typeof mappingListInput>) {
  const conditions = [input.status === "all" ? sql`true` : input.status === "mapped" ? mapped : sql`NOT COALESCE(${mapped}, false)`];
  if (input.q) {
    const search = `%${input.q.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    conditions.push(or(ilike(source.name, search), ilike(sourceCategoryMapping.rawName, search), ilike(platformCategory.nameFa, search))!);
  }
  const [total] = await db.select({ total: count() }).from(sourceCategoryMapping).innerJoin(source, eq(source.id, sourceCategoryMapping.sourceId)).leftJoin(platformCategory, eq(platformCategory.id, sourceCategoryMapping.platformCategoryId)).where(and(...conditions));
  const rows = await db.select({ id: sourceCategoryMapping.id, sourceId: source.id, sourceName: source.name, sourceUrl: source.url, rawName: sourceCategoryMapping.rawName, categoryId: sourceCategoryMapping.platformCategoryId, categoryName: platformCategory.nameFa, mapped: sql<boolean>`COALESCE(${mapped}, false)`, revision: sourceCategoryMapping.revision, mappedAt: sourceCategoryMapping.mappedAt, lastSeenAt: sourceCategoryMapping.lastSeenAt,
    articleCount: sql<number>`(SELECT count(*) FROM ${rawArticle} WHERE ${rawArticle.sourceId} = ${sourceCategoryMapping.sourceId} AND ${matchesRaw})`,
  }).from(sourceCategoryMapping).innerJoin(source, eq(source.id, sourceCategoryMapping.sourceId)).leftJoin(platformCategory, eq(platformCategory.id, sourceCategoryMapping.platformCategoryId)).where(and(...conditions)).orderBy(sql`COALESCE(${mapped}, false)`, desc(sourceCategoryMapping.lastSeenAt), sourceCategoryMapping.id).limit(20).offset((input.page - 1) * 20);
  const categories = await db.select({ id: platformCategory.id, nameFa: platformCategory.nameFa, nameEn: platformCategory.nameEn, nameAr: platformCategory.nameAr }).from(platformCategory).where(eq(platformCategory.active, true)).orderBy(platformCategory.sortOrder, platformCategory.nameFa);
  return { rows: rows.map(row => ({ ...row, articleCount: Number(row.articleCount), mappedAt: row.mappedAt?.toISOString() ?? null, lastSeenAt: row.lastSeenAt.toISOString() })), summary: await categoryMappingSummary(), total: Number(total.total), page: input.page, pageCount: Math.max(1, Math.ceil(Number(total.total) / 20)), categories };
}

export async function saveCategoryMapping(id: string, actorUserId: string, correlationId: string, input: z.infer<typeof mappingUpdateInput>) {
  return db.transaction(async tx => {
    const [previous] = await tx.select().from(sourceCategoryMapping).where(eq(sourceCategoryMapping.id, id)).for("update");
    if (!previous) throw new CategoryMappingError("دستهٔ منبع پیدا نشد.", 404);
    if (previous.revision !== input.expectedRevision) throw new CategoryMappingError("این معادل‌سازی تغییر کرده است؛ فهرست را تازه‌سازی کنید.");
    let target;
    if ("newCategory" in input) {
      // Serialize quick creation across rows to avoid duplicate platform categories.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(78124031)`);
      [target] = await tx.select().from(platformCategory).where(and(eq(platformCategory.active, true), sql`lower(trim(${platformCategory.nameFa})) = lower(${input.newCategory.nameFa})`)).limit(1);
      if (!target) {
        [target] = await tx.insert(platformCategory).values({ id: `category_${randomUUID()}`, key: `category_${randomUUID()}`, ...input.newCategory }).returning();
        await recordAuditEvent({ actorUserId, correlationId, action: "platform.category.created", targetType: "platform_category", targetId: target.id }, tx);
      }
    } else [target] = await tx.select().from(platformCategory).where(and(eq(platformCategory.id, input.categoryId), eq(platformCategory.active, true))).limit(1);
    if (!target) throw new CategoryMappingError("دستهٔ فعال پلتفرم را انتخاب کنید.", 400);
    const [old] = previous.platformCategoryId ? await tx.select({ name: platformCategory.nameFa }).from(platformCategory).where(eq(platformCategory.id, previous.platformCategoryId)) : [];
    await tx.update(sourceCategoryMapping).set({ platformCategoryId: target.id, revision: previous.revision + 1, mappedBy: actorUserId, mappedAt: new Date() }).where(eq(sourceCategoryMapping.id, id));
    await recordAuditEvent({ actorUserId, correlationId, action: "source.category.mapped", targetType: "source_category_mapping", targetId: id, metadata: { sourceId: previous.sourceId, rawName: previous.rawName, from: old?.name ?? null, to: target.nameFa, fromId: previous.platformCategoryId, toId: target.id } }, tx);
    return { id, categoryId: target.id, categoryName: target.nameFa, revision: previous.revision + 1 };
  });
}

export async function categoryMappingHistory(id: string) {
  const rows = await db.select({ id: auditEvent.id, actor: user.name, createdAt: auditEvent.createdAt, metadata: auditEvent.metadata }).from(auditEvent).leftJoin(user, eq(user.id, auditEvent.actorUserId)).where(and(eq(auditEvent.action, "source.category.mapped"), eq(auditEvent.targetId, id))).orderBy(desc(auditEvent.createdAt)).limit(20);
  return rows.map(row => ({ id: row.id, actor: row.actor, createdAt: row.createdAt.toISOString(), from: typeof row.metadata.from === "string" ? row.metadata.from : null, to: typeof row.metadata.to === "string" ? row.metadata.to : null }));
}
