import { and, asc, eq, isNull } from "drizzle-orm";
import { siteArticle, storyPublicationPolicy } from "@/db/schema";
import { db } from "./database";
import { SiteError } from "./sites";
import type { PublicationRole } from "../../contracts/src/sites";

export type PublicationTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Caller holds the Story lock. Legacy articles get a deterministic primary owner.
export async function primarySite(mediaId: string, storyId: string, tx: Pick<typeof db, "select" | "insert"> = db) {
  const [policy] = await tx.select().from(storyPublicationPolicy).where(and(eq(storyPublicationPolicy.storyId, storyId), eq(storyPublicationPolicy.mediaId, mediaId)));
  if (policy) return policy.primarySiteId;
  const [oldest] = await tx.select().from(siteArticle).where(and(eq(siteArticle.mediaId, mediaId), eq(siteArticle.storyId, storyId))).orderBy(asc(siteArticle.publishedAt), asc(siteArticle.id)).limit(1);
  if (oldest) { await tx.insert(storyPublicationPolicy).values({ mediaId, storyId, primarySiteId: oldest.siteId }).onConflictDoNothing(); return oldest.siteId; }
  return null;
}

export async function resolveDelivery(mediaId: string, storyId: string, siteId: string, role: PublicationRole | undefined, tx: PublicationTransaction) {
  let owner = await primarySite(mediaId, storyId, tx);
  const selected = role ?? (!owner || owner === siteId ? "primary" : "republication");
  if (selected === "primary") {
    if (owner && owner !== siteId) throw new SiteError("این خبر سایت اصلی دیگری دارد؛ بازنشر یا خلاصه و لینک را انتخاب کنید.");
    if (!owner) { await tx.insert(storyPublicationPolicy).values({ mediaId, storyId, primarySiteId: siteId }); owner = siteId; }
  } else if (owner === siteId) throw new SiteError("این سایت مقصد اصلی خبر است؛ نقش انتشار اصلی را انتخاب کنید.");
  return { role: selected, primarySiteId: owner };
}

export async function publishedPrimary(mediaId: string, storyId: string, siteId: string | null, tx: Pick<typeof db, "select"> = db) {
  if (!siteId) return null;
  const [article] = await tx.select().from(siteArticle).where(and(eq(siteArticle.mediaId, mediaId), eq(siteArticle.storyId, storyId), eq(siteArticle.siteId, siteId), isNull(siteArticle.withdrawnAt))).limit(1);
  return article ?? null;
}
