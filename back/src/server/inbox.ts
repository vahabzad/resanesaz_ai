import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { mediaInboxItem, rawArticle, source } from "@/db/schema";
import type { InboxArticle, InboxWorkspace } from "@media/contracts/inbox";
import { db } from "@/src/server/database";
import { mediaSourceCategoryAccess } from "./media-source-category-access";

export async function getInboxWorkspace(mediaId: string, allowedSourceIds?: string[]): Promise<InboxWorkspace> {
  const filter = and(eq(mediaInboxItem.mediaId, mediaId), allowedSourceIds === undefined ? undefined : allowedSourceIds.length ? and(inArray(rawArticle.sourceId, allowedSourceIds), mediaSourceCategoryAccess(mediaId)) : sql`false`);
  const articles = await db
    .select({
      id: rawArticle.id,
      sourceId: rawArticle.sourceId,
      sourceName: source.name,
      title: rawArticle.title,
      summary: rawArticle.summary,
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
    .orderBy(desc(rawArticle.ingestedAt))
    .limit(50);

  const [summary] = await db
    .select({
      total: count(),
      quarantined: sql<number>`count(*) filter (where ${rawArticle.status} = 'quarantined')`,
      newCount: sql<number>`count(*) filter (where ${rawArticle.status} = 'new')`,
      sources: sql<number>`count(distinct ${rawArticle.sourceId})`,
    })
    .from(mediaInboxItem)
    .innerJoin(rawArticle, eq(rawArticle.id, mediaInboxItem.rawArticleId))
    .where(filter);

  const safeArticles: InboxArticle[] = articles.map((item) => ({
    ...item,
    status: item.status as InboxArticle["status"],
    publishedAt: item.publishedAt?.toISOString() ?? null,
    ingestedAt: item.ingestedAt.toISOString(),
  }));

  return {
    articles: safeArticles,
    stats: {
      total: Number(summary?.total ?? 0),
      newCount: Number(summary?.newCount ?? 0),
      quarantined: Number(summary?.quarantined ?? 0),
      sources: Number(summary?.sources ?? 0),
    },
  };
}
