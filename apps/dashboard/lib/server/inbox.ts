import "server-only";

import { count, desc, eq, sql } from "drizzle-orm";
import { rawArticle, source } from "@/db/schema";
import type { InboxArticle, InboxWorkspace } from "@/lib/contracts/inbox";
import { db } from "@/lib/server/database";

export async function getInboxWorkspace(mediaId: string): Promise<InboxWorkspace> {
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
    .from(rawArticle)
    .innerJoin(source, eq(source.id, rawArticle.sourceId))
    .where(eq(rawArticle.mediaId, mediaId))
    .orderBy(desc(rawArticle.ingestedAt))
    .limit(50);

  const [summary] = await db
    .select({
      total: count(),
      quarantined: sql<number>`count(*) filter (where ${rawArticle.status} = 'quarantined')`,
      newCount: sql<number>`count(*) filter (where ${rawArticle.status} = 'new')`,
      sources: sql<number>`count(distinct ${rawArticle.sourceId})`,
    })
    .from(rawArticle)
    .where(eq(rawArticle.mediaId, mediaId));

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
