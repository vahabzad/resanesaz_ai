import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { mediaSite, mediaSourceSubscription, platformCategory, source, sourceAccessRequest } from "@/db/schema";
import { db } from "./database";
import { mediaIsApproved, mediaRequestStatus } from "./media-requests";
import { sourceRequestKey } from "../../contracts/src/media-setup";
import type { MediaOverview, AdminSource, AdminSite } from "../../contracts/src/media-overview";

export async function grantedMediaSourceIds(mediaId: string) {
  if (!await mediaIsApproved(mediaId)) return [];
  const rows = await db.select({ id: source.id }).from(mediaSourceSubscription).innerJoin(source, eq(source.id, mediaSourceSubscription.sourceId)).where(and(eq(mediaSourceSubscription.mediaId, mediaId), eq(mediaSourceSubscription.enabled, true), eq(source.mediaDeliveryEnabled, true), isNull(source.archivedAt)));
  return rows.map(row => row.id);
}
export async function mediaOverview(mediaId: string): Promise<MediaOverview> {
  const [request, requests, subscriptions, sites, categories] = await Promise.all([
    mediaRequestStatus(mediaId),
    db.select().from(sourceAccessRequest).where(and(eq(sourceAccessRequest.mediaId, mediaId), ne(sourceAccessRequest.status, "withdrawn"))).orderBy(sourceAccessRequest.createdAt),
    db.select({ source, subscription: mediaSourceSubscription }).from(mediaSourceSubscription).innerJoin(source, eq(source.id, mediaSourceSubscription.sourceId)).where(eq(mediaSourceSubscription.mediaId, mediaId)),
    db.select({ id: mediaSite.id, name: mediaSite.name, slug: mediaSite.slug, status: mediaSite.status, hasLiveSpec: sql<boolean>`${mediaSite.liveSpec} IS NOT NULL` }).from(mediaSite).where(eq(mediaSite.mediaId, mediaId)).orderBy(mediaSite.createdAt),
    db.select().from(platformCategory).orderBy(platformCategory.sortOrder, platformCategory.nameFa),
  ]);
  const approved = request.status === "approved";
  const available = subscriptions.filter(row => approved && row.subscription.enabled && row.source.mediaDeliveryEnabled && !row.source.archivedAt);
  const rootRequests = requests.filter(row => row.kind === "source_access");
  const extensions = (subscriptionId?: string) => requests.filter(row => row.kind === "category_extension" && row.subscriptionId === subscriptionId && ["pending", "rejected"].includes(row.status)).map(row => ({ id: row.id, status: row.status, categoryIds: row.categoryIds, categories: categories.filter(category => row.categoryIds.includes(category.id)).map(category => category.nameFa) }));
  const sources: AdminSource[] = rootRequests.map(row => {
    const subscribed = subscriptions.find(item => item.source.id === row.sourceId || sourceRequestKey(item.source.url) === sourceRequestKey(row.url));
    const effective = subscribed?.subscription.enabled ? subscribed.subscription : null;
    const categoryIds = effective?.categoryIds ?? row.categoryIds;
    return { id: row.id, name: row.name, url: row.url, sourceType: row.sourceType, status: row.status, accessGranted: Boolean(subscribed && available.includes(subscribed)), crawlerStatus: subscribed?.source.status ?? null, categories: categories.filter(category => categoryIds.includes(category.id)).map(category => category.nameFa), categoryIds, allCategories: effective ? effective.categoryMode !== "selected" : row.categoryMode === "all", categoryRequests: extensions(subscribed?.subscription.id) };
  });
  for (const row of subscriptions) {
    if (!row.subscription.enabled || rootRequests.some(item => item.sourceId === row.source.id || sourceRequestKey(item.url) === sourceRequestKey(row.source.url))) continue;
    sources.push({ id: row.subscription.id, name: row.source.name, url: row.source.url, sourceType: "website", status: "access_granted", accessGranted: available.includes(row), crawlerStatus: row.source.status, categories: categories.filter(category => row.subscription.categoryIds.includes(category.id)).map(category => category.nameFa), categoryIds: row.subscription.categoryIds, allCategories: row.subscription.categoryMode !== "selected", categoryRequests: extensions(row.subscription.id) });
  }
  const siteRows: AdminSite[] = sites.map(site => ({ id: site.id, name: site.name, status: !approved ? "waiting_approval" : site.status === "live" && site.hasLiveSpec ? "live" : site.status === "paused" ? "paused" : site.status === "archived" ? "archived" : "not_started", publicPath: approved && site.status === "live" && site.hasLiveSpec ? `/s/${site.slug}` : null }));
  return { mediaId, request, canReadInbox: available.length > 0, sources, sites: siteRows, categories: categories.filter(category => category.active).map(category => ({ ...category, createdAt: category.createdAt.toISOString(), updatedAt: category.updatedAt.toISOString() })) };
}
