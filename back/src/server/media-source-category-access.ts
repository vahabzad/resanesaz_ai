import { sql } from "drizzle-orm";
import { mediaSourceSubscription, platformCategory, rawArticle, sourceCategoryMapping } from "@/db/schema";
// Used with an outer raw_article query. Raw labels are never compared to platform IDs.
export function mediaSourceCategoryAccess(mediaId: string) {
  return sql`EXISTS (SELECT 1 FROM ${mediaSourceSubscription} WHERE ${mediaSourceSubscription.mediaId} = ${mediaId} AND ${mediaSourceSubscription.sourceId} = ${rawArticle.sourceId} AND ${mediaSourceSubscription.enabled} = true AND (${mediaSourceSubscription.categoryMode} IS DISTINCT FROM 'selected' OR EXISTS (
    SELECT 1 FROM ${sourceCategoryMapping} JOIN ${platformCategory} ON ${platformCategory.id} = ${sourceCategoryMapping.platformCategoryId} AND ${platformCategory.active} = true
    WHERE ${sourceCategoryMapping.sourceId} = ${rawArticle.sourceId} AND ${mediaSourceSubscription.categoryIds} ? ${platformCategory.id} AND (${sourceCategoryMapping.rawName} IN (SELECT trim(value) FROM jsonb_array_elements_text(${rawArticle.categories})) OR (${sourceCategoryMapping.rawName} = '' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(${rawArticle.categories}) c(value) WHERE trim(c.value) <> '')))
  )))`;
}

// Editorial records predating subscriptions keep their historical behavior.
// An existing subscription always controls eligibility, including after removal.
export function editorialSourceCategoryAccess(mediaId: string) {
  return sql`(NOT EXISTS (SELECT 1 FROM ${mediaSourceSubscription} WHERE ${mediaSourceSubscription.mediaId} = ${mediaId} AND ${mediaSourceSubscription.sourceId} = ${rawArticle.sourceId}) OR ${mediaSourceCategoryAccess(mediaId)})`;
}
