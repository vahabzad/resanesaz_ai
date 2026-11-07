import { and, asc, count, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { mediaInboxItem, rawArticle, source } from "@/db/schema";
import type { InboxArticle, InboxArticleDetail, InboxWorkspace } from "@media/contracts/inbox";
import { db } from "@/src/server/database";
import { mediaSourceCategoryAccess } from "./media-source-category-access";

export const inboxListInput = z.object({
  query: z.string().trim().max(200).default(""), sourceId: z.string().trim().max(128).default(""),
  category: z.string().trim().max(200).default(""), status: z.enum(["", "new", "quarantined"]).default(""),
  period: z.enum(["", "24h", "7d", "30d"]).default(""),
  sort: z.enum(["received", "published", "oldest"]).default("received"),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
}).strict();

function inboxAccess(mediaId: string, allowedSourceIds?: string[]) {
  return and(eq(mediaInboxItem.mediaId, mediaId), allowedSourceIds === undefined ? undefined : allowedSourceIds.length ? and(inArray(rawArticle.sourceId, allowedSourceIds), mediaSourceCategoryAccess(mediaId)) : sql`false`);
}

export async function getInboxWorkspace(mediaId: string, allowedSourceIds?: string[], input = inboxListInput.parse({})): Promise<InboxWorkspace> {
  const access = inboxAccess(mediaId, allowedSourceIds);
  const term = input.query.replace(/[يك]/g, value => value === "ي" ? "ی" : "ک").replace(/[\\%_]/g, "\\$&");
  const search = (column: typeof rawArticle.title | typeof rawArticle.summary | typeof rawArticle.content | typeof source.name) => sql`replace(replace(${column}, 'ي', 'ی'), 'ك', 'ک') ilike ${`%${term}%`}`;
  const hours = input.period === "24h" ? 24 : input.period === "7d" ? 168 : 720;
  const filter = and(access,
    term ? or(search(rawArticle.title), search(rawArticle.summary), search(rawArticle.content), search(source.name)) : undefined,
    input.sourceId ? eq(rawArticle.sourceId, input.sourceId) : undefined,
    input.category ? sql`${rawArticle.categories} @> ${JSON.stringify([input.category])}::jsonb` : undefined,
    input.status ? eq(rawArticle.status, input.status) : undefined,
    input.period ? gte(rawArticle.ingestedAt, new Date(Date.now() - hours * 3_600_000)) : undefined,
  );
  const [[matched], sources, categoryRows] = await Promise.all([
    db.select({ total: count() }).from(mediaInboxItem).innerJoin(rawArticle, eq(rawArticle.id, mediaInboxItem.rawArticleId)).innerJoin(source, eq(source.id, rawArticle.sourceId)).where(filter),
    db.selectDistinct({ id: source.id, name: source.name }).from(mediaInboxItem).innerJoin(rawArticle, eq(rawArticle.id, mediaInboxItem.rawArticleId)).innerJoin(source, eq(source.id, rawArticle.sourceId)).where(access).orderBy(source.name),
    db.selectDistinct({ category: sql<string>`jsonb_array_elements_text(${rawArticle.categories})` }).from(mediaInboxItem).innerJoin(rawArticle, eq(rawArticle.id, mediaInboxItem.rawArticleId)).where(access),
  ]);
  const total = Number(matched.total), pageSize = 20, pageCount = Math.max(1, Math.ceil(total / pageSize)), page = Math.min(input.page, pageCount);
  const order = input.sort === "oldest" ? asc(rawArticle.ingestedAt) : input.sort === "published" ? sql`${rawArticle.publishedAt} desc nulls last` : desc(rawArticle.ingestedAt);
  const articles = await db
    .select({
      id: rawArticle.id,
      sourceId: rawArticle.sourceId,
      sourceName: source.name,
      title: rawArticle.title,
      summary: rawArticle.summary,
      categories: rawArticle.categories,
      canonicalUrl: rawArticle.canonicalUrl,
      status: rawArticle.status,
      quarantineReason: rawArticle.quarantineReason,
      publishedAt: rawArticle.publishedAt,
      ingestedAt: rawArticle.ingestedAt,
    })
    .from(mediaInboxItem)
    .innerJoin(rawArticle, eq(rawArticle.id, mediaInboxItem.rawArticleId))
    .innerJoin(source, eq(source.id, rawArticle.sourceId))
    .where(filter)
    .orderBy(order, desc(rawArticle.id))
    .limit(pageSize).offset((page - 1) * pageSize);

  const [summary] = await db
    .select({
      total: count(),
      quarantined: sql<number>`count(*) filter (where ${rawArticle.status} = 'quarantined')`,
      newCount: sql<number>`count(*) filter (where ${rawArticle.status} = 'new')`,
      sources: sql<number>`count(distinct ${rawArticle.sourceId})`,
    })
    .from(mediaInboxItem)
    .innerJoin(rawArticle, eq(rawArticle.id, mediaInboxItem.rawArticleId))
    .where(access);

  const safeArticles: InboxArticle[] = articles.map((item) => ({
    ...item,
    status: item.status as InboxArticle["status"],
    publishedAt: item.publishedAt?.toISOString() ?? null,
    ingestedAt: item.ingestedAt.toISOString(),
  }));

  return {
    articles: safeArticles,
    total, page, pageSize, pageCount, sources,
    categories: categoryRows.map(row => row.category).filter(Boolean).sort((a, b) => a.localeCompare(b, "fa")),
    stats: {
      total: Number(summary?.total ?? 0),
      newCount: Number(summary?.newCount ?? 0),
      quarantined: Number(summary?.quarantined ?? 0),
      sources: Number(summary?.sources ?? 0),
    },
  };
}

export async function getInboxArticle(mediaId: string, id: string, allowedSourceIds?: string[]): Promise<InboxArticleDetail | null> {
  const [item] = await db.select({
    id: rawArticle.id, sourceId: rawArticle.sourceId, sourceName: source.name,
    title: rawArticle.title, summary: rawArticle.summary, categories: rawArticle.categories,
    canonicalUrl: rawArticle.canonicalUrl, status: rawArticle.status, quarantineReason: rawArticle.quarantineReason,
    publishedAt: rawArticle.publishedAt, ingestedAt: rawArticle.ingestedAt, content: rawArticle.content, author: rawArticle.author,
  }).from(mediaInboxItem).innerJoin(rawArticle, eq(rawArticle.id, mediaInboxItem.rawArticleId)).innerJoin(source, eq(source.id, rawArticle.sourceId))
    .where(and(inboxAccess(mediaId, allowedSourceIds), eq(rawArticle.id, id))).limit(1);
  return item ? { ...item, status: item.status as InboxArticle["status"], publishedAt: item.publishedAt?.toISOString() ?? null, ingestedAt: item.ingestedAt.toISOString() } : null;
}
