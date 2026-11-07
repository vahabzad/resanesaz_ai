import { and, eq, gte, sql } from "drizzle-orm";
import { editorialJob, mediaInboxItem, rawArticle } from "@/db/schema";
import type { SectionSettings } from "@media/contracts/editorial-settings";
import { automaticFreshness, automaticInputRejection } from "../editorial-freshness";
import { db } from "./database";

export { automaticInputRejection, resumedAutomaticSettings } from "../editorial-freshness";
export const automaticRejectionMessages = {
  AUTO_INPUT_OUTSIDE_START: "زمان دریافت خبر پیش از نقطهٔ شروع خودکار این سردبیر است.",
  AUTO_NEWS_EXPIRED: "سن خبر از سقف مجاز تحریر خودکار بیشتر است.",
  AUTO_DATE_UNKNOWN: "تاریخ انتشار خبر مشخص نیست و تنظیم سردبیر اجازهٔ تحریر خودکار نمی‌دهد.",
  AUTO_DATE_FUTURE: "زمان خبر در آینده است؛ هنوز برای تحریر خودکار واجد شرایط نیست.",
  AUTO_INPUT_UNAVAILABLE: "خبر دیگر در صندوق این رسانه در دسترس نیست.",
};
export function automaticInputConditions(settings: SectionSettings, now = new Date()) {
  const policy = automaticFreshness(settings);
  const timestamp = policy.unknownDatePolicy === "received" ? sql`coalesce(${rawArticle.publishedAt}, ${rawArticle.ingestedAt})` : rawArticle.publishedAt;
  return and(
    settings.autoReceivedSince ? gte(rawArticle.ingestedAt, new Date(settings.autoReceivedSince)) : undefined,
    sql`${timestamp} <= ${now.toISOString()}::timestamptz`,
    policy.maxAgeHours === null ? undefined : sql`${timestamp} >= ${new Date(now.getTime() - policy.maxAgeHours * 3600000).toISOString()}::timestamptz`,
  )!;
}
export async function queuedAutomaticRejection(job: { rawArticleId: string | null; mediaId: string }, settings: SectionSettings, executor: Pick<typeof db, "select"> = db) {
  const [article] = await executor.select({ ingestedAt: rawArticle.ingestedAt, publishedAt: rawArticle.publishedAt }).from(mediaInboxItem)
    .innerJoin(rawArticle, eq(rawArticle.id, mediaInboxItem.rawArticleId))
    .where(and(eq(mediaInboxItem.mediaId, job.mediaId), eq(rawArticle.id, job.rawArticleId ?? "")));
  return article ? automaticInputRejection(settings, article) : "AUTO_INPUT_UNAVAILABLE";
}
export function excludedAutomaticJob(settings: SectionSettings, now = new Date()) {
  return sql`NOT EXISTS (SELECT 1 FROM ${rawArticle} WHERE ${rawArticle.id} = ${editorialJob.rawArticleId} AND ${automaticInputConditions(settings, now)})`;
}
