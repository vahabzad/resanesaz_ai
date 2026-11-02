import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { crawlRun, crawlRunEvent } from "@/db/schema";
import { db } from "./database";
import { safeArticleLogUrl } from "./web-crawler";

// A final failed report can omit pages that passed in an earlier repair
// attempt. Retain their published addresses from successful validation events.
export async function validatedArticleUrls(sourceId: string, sourceUrl: string) {
  const rows = await db.selectDistinct({ url: crawlRunEvent.articleUrl }).from(crawlRunEvent)
    .innerJoin(crawlRun, eq(crawlRun.id, crawlRunEvent.runId))
    .where(and(eq(crawlRun.sourceId, sourceId), eq(crawlRunEvent.stage, "build-test"), eq(crawlRunEvent.status, "progress"), isNull(crawlRunEvent.errorCode), isNotNull(crawlRunEvent.articleUrl))).limit(1000);
  const origin = new URL(sourceUrl).origin;
  return rows.flatMap(row => {
    try {
      const url = new URL(row.url!);
      return url.origin === origin && !url.username && !url.password ? [safeArticleLogUrl(url.toString())] : [];
    } catch { return []; }
  });
}
