import { createHmac, timingSafeEqual } from "node:crypto";
import { and, count, desc, eq, ilike, lte, sql } from "drizzle-orm";
import { z } from "zod";
import * as cheerio from "cheerio";
import { mediaInboxItem, rawArticle, source } from "@/db/schema";
import { db } from "@/src/server/database";
import { recordAuditEvent } from "@/src/server/audit";
import type { ArticleDeletionPreview, PlatformArticleDetail, PlatformArticleFilters, PlatformArticlesWorkspace } from "@media/contracts/platform-articles";
import { assertPublicHttpsUrl } from "@/src/server/url-safety";

export const articleFiltersSchema = z.object({
  query: z.string().trim().max(200).default(""),
  sourceId: z.string().trim().max(128).default(""),
  category: z.string().trim().max(200).default(""),
  status: z.enum(["", "new", "quarantined"]).default(""),
}).strict();
export const articleListSchema = articleFiltersSchema.extend({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().refine((value) => [10, 20, 50].includes(value)).default(20),
});
export const articlePreviewSchema = z.object({
  mode: z.enum(["all", "filtered"]), filters: articleFiltersSchema,
}).strict();
const ticketSchema = z.object({
  actor: z.string(), cutoff: z.iso.datetime(), expiresAt: z.number(),
  mode: z.enum(["all", "filtered"]), filters: articleFiltersSchema,
}).strict();
export class ArticleDeletionExpired extends Error {}

function articleConditions(filters: PlatformArticleFilters, cutoff?: Date) {
  const query = filters.query.replace(/[\\%_]/g, "\\$&");
  return and(
    filters.query ? ilike(rawArticle.title, `%${query}%`) : undefined,
    filters.sourceId ? eq(rawArticle.sourceId, filters.sourceId) : undefined,
    filters.category ? sql`${rawArticle.categories} @> ${JSON.stringify([filters.category])}::jsonb` : undefined,
    filters.status ? eq(rawArticle.status, filters.status) : undefined,
    cutoff ? lte(rawArticle.ingestedAt, cutoff) : undefined,
  );
}

export async function getPlatformArticles(input: z.infer<typeof articleListSchema>): Promise<PlatformArticlesWorkspace> {
  const where = articleConditions(input);
  const [[summary], sources, categories] = await Promise.all([
    db.select({ total: count() }).from(rawArticle).where(where),
    db.select({ id: source.id, name: source.name }).from(source).orderBy(source.name),
    db.execute<{ category: string }>(sql`select distinct jsonb_array_elements_text(categories) as category from raw_article order by category`),
  ]);
  const total = Number(summary.total);
  const pageCount = Math.max(1, Math.ceil(total / input.pageSize));
  const page = Math.min(input.page, pageCount);
  const articles = await db.select({
    id: rawArticle.id, sourceId: rawArticle.sourceId, sourceName: source.name,
    title: rawArticle.title, canonicalUrl: rawArticle.canonicalUrl, categories: rawArticle.categories,
    status: rawArticle.status, quarantineReason: rawArticle.quarantineReason,
    publishedAt: rawArticle.publishedAt, ingestedAt: rawArticle.ingestedAt,
  }).from(rawArticle).innerJoin(source, eq(source.id, rawArticle.sourceId)).where(where)
    .orderBy(desc(rawArticle.ingestedAt), desc(rawArticle.id)).limit(input.pageSize).offset((page - 1) * input.pageSize);
  return { articles: articles.map((item) => ({ ...item, publishedAt: item.publishedAt?.toISOString() ?? null, ingestedAt: item.ingestedAt.toISOString() })),
    total, page, pageSize: input.pageSize, pageCount, sources, categories: categories.rows.map((item) => item.category) };
}

export async function getPlatformArticle(id: string): Promise<PlatformArticleDetail | null> {
  const [article] = await db.select({
    id: rawArticle.id, sourceId: rawArticle.sourceId, sourceName: source.name,
    title: rawArticle.title, canonicalUrl: rawArticle.canonicalUrl, categories: rawArticle.categories,
    status: rawArticle.status, quarantineReason: rawArticle.quarantineReason,
    publishedAt: rawArticle.publishedAt, ingestedAt: rawArticle.ingestedAt,
    summary: rawArticle.summary, content: rawArticle.content, contentHtml: rawArticle.contentHtml,
    imageUrl: rawArticle.imageUrl, author: rawArticle.author, crawlRunId: rawArticle.crawlRunId,
  }).from(rawArticle).innerJoin(source, eq(source.id, rawArticle.sourceId)).where(eq(rawArticle.id, id)).limit(1);
  if (!article) return null;
  const $ = cheerio.load(article.contentHtml ?? "");
  const candidates = [article.imageUrl, ...$("img").map((_, node) => $(node).attr("data-src") ?? $(node).attr("data-original") ?? $(node).attr("data-lazy-src") ?? $(node).attr("src") ?? "").get()];
  const safeImages = await Promise.all([...new Set(candidates.filter((value): value is string => !!value))].slice(0, 12).map(async (value) => {
    try { return (await assertPublicHttpsUrl(new URL(value, article.canonicalUrl).toString())).toString(); } catch { return null; }
  }));
  const imageUrls = [...new Set(safeImages.filter((value): value is string => !!value))];
  // Raw HTML is never returned or rendered in the dashboard origin. Text is
  // React-escaped and only guarded public HTTPS image URLs are exposed.
  const { contentHtml: _html, imageUrl: _image, ...detail } = article;
  void _html; void _image;
  return { ...detail, publishedAt: article.publishedAt?.toISOString() ?? null, ingestedAt: article.ingestedAt.toISOString(), imageUrl: imageUrls[0] ?? null, inlineImageUrls: imageUrls.slice(1) };
}

function signature(payload: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("Deletion signing is not configured");
  return createHmac("sha256", secret).update(`platform-article-deletion:${payload}`).digest("base64url");
}

export async function previewArticleDeletion(input: z.infer<typeof articlePreviewSchema>, actor: string): Promise<ArticleDeletionPreview> {
  const filters = input.mode === "all" ? articleFiltersSchema.parse({}) : input.filters;
  const cutoff = new Date();
  const where = articleConditions(filters, cutoff);
  const [[articles], [inbox]] = await Promise.all([
    db.select({ total: count() }).from(rawArticle).where(where),
    db.select({ total: count() }).from(mediaInboxItem).innerJoin(rawArticle, eq(rawArticle.id, mediaInboxItem.rawArticleId)).where(where),
  ]);
  const payload = Buffer.from(JSON.stringify({ actor, mode: input.mode, filters, cutoff: cutoff.toISOString(), expiresAt: Date.now() + 10 * 60_000 })).toString("base64url");
  return { token: `${payload}.${signature(payload)}`, mode: input.mode, filters, cutoff: cutoff.toISOString(), articleCount: Number(articles.total), inboxCount: Number(inbox.total) };
}

export async function deletePlatformArticles(token: string, actor: string, correlationId: string) {
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) throw new ArticleDeletionExpired();
  const expected = Buffer.from(signature(payload));
  const supplied = Buffer.from(suppliedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new ArticleDeletionExpired();
  let decoded: unknown;
  try { decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { throw new ArticleDeletionExpired(); }
  const parsed = ticketSchema.safeParse(decoded);
  if (!parsed.success || parsed.data.actor !== actor || parsed.data.expiresAt < Date.now()) throw new ArticleDeletionExpired();
  const ticket = parsed.data;
  const where = articleConditions(ticket.filters, new Date(ticket.cutoff));
  return db.transaction(async (tx) => {
    // A single statement counts and deletes the same selected cohort. FK cascade
    // removes Inbox references; Source, subscriptions and run history survive.
    const result = await tx.execute<{ article_count: number; inbox_count: number }>(sql`
      with targets as materialized (select ${rawArticle.id} as id from ${rawArticle} where ${where}),
      inbox_total as materialized (select count(*)::int as total from ${mediaInboxItem} where ${mediaInboxItem.rawArticleId} in (select id from targets)),
      removed as (delete from ${rawArticle} where ${rawArticle.id} in (select id from targets) returning ${rawArticle.id})
      select (select count(*)::int from removed) as article_count, (select total from inbox_total) as inbox_count`);
    const counts = { deletedArticles: Number(result.rows[0].article_count), deletedInboxItems: Number(result.rows[0].inbox_count) };
    await recordAuditEvent({ actorUserId: actor, action: "platform.articles.deleted", targetType: "raw_article", correlationId,
      metadata: { ...counts, mode: ticket.mode, filters: ticket.filters, cutoff: ticket.cutoff } }, tx);
    return counts;
  });
}
