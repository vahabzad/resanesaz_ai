import { sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { media, user } from "./auth-schema";
import type { EditorialFaction, SectionSettings, EditorialSettingsSnapshot } from "../contracts/src/editorial-settings";

import type { EditorialRenditions } from "../contracts/src/editorial";
import type { SiteSpec, WebSnapshot, PublicationRuleSettings } from "../contracts/src/sites";
export * from "./auth-schema";

export const mediaCreationRequest = pgTable("media_creation_request", {
  mediaId: text("media_id").primaryKey().references(() => media.id, { onDelete: "cascade" }),
  status: text("status").$type<"pending" | "approved" | "rejected">().default("pending").notNull(),
  revision: integer("revision").default(1).notNull(),
  requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
  reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNote: text("review_note"),
}, t => [index("media_creation_request_status_idx").on(t.status, t.submittedAt)]);

export const mediaSite = pgTable("media_site", {
  id: text("id").primaryKey(),
  mediaId: text("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
  name: text("name").notNull(), slug: text("slug").notNull(), revision: integer("revision").default(1).notNull(),
  status: text("status").default("draft").notNull(),
  spec: jsonb("spec").$type<SiteSpec>().notNull(), liveSpec: jsonb("live_spec").$type<SiteSpec>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [uniqueIndex("media_site_slug_idx").on(t.slug), index("media_site_media_idx").on(t.mediaId)]);

export const webPublicationJob = pgTable("web_publication_job", {
  ruleId: text("rule_id").references(() => publicationRule.id),
  id: text("id").primaryKey(), mediaId: text("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
  siteId: text("site_id").notNull().references(() => mediaSite.id),
  storyId: text("story_id").notNull().references(() => editorialStory.id),
  versionId: text("version_id").notNull().references(() => articleVersion.id),
  snapshot: jsonb("snapshot").$type<WebSnapshot>().notNull(),
  status: text("status").default("queued").notNull(), attempts: integer("attempts").default(0).notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).defaultNow().notNull(),
  requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
  errorCode: text("error_code"), resultPath: text("result_path"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), finishedAt: timestamp("finished_at", { withTimezone: true }),
}, t => [uniqueIndex("web_publication_input_idx").on(t.mediaId, t.siteId, t.versionId), index("web_publication_due_idx").on(t.status, t.scheduledAt)]);

export const siteArticle = pgTable("site_article", {
  modifiedAt: timestamp("modified_at", { withTimezone: true }),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  id: text("id").primaryKey(), mediaId: text("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
  siteId: text("site_id").notNull().references(() => mediaSite.id), storyId: text("story_id").notNull().references(() => editorialStory.id),
  versionId: text("version_id").notNull().references(() => articleVersion.id), snapshot: jsonb("snapshot").$type<WebSnapshot>().notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [uniqueIndex("site_article_story_idx").on(t.siteId, t.storyId), index("site_article_page_idx").on(t.siteId, t.publishedAt)]);

export const publicationRule = pgTable("publication_rule", {
  lastErrorCode: text("last_error_code"),
  id: text("id").primaryKey(), mediaId: text("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
  siteId: text("site_id").notNull().references(() => mediaSite.id), name: text("name").notNull(),
  revision: integer("revision").default(1).notNull(), enabled: boolean("enabled").default(false).notNull(),
  settings: jsonb("settings").$type<PublicationRuleSettings>().notNull(),
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [index("publication_rule_media_idx").on(t.mediaId)]);

export const storyPublicationPolicy = pgTable("story_publication_policy", {
  storyId: text("story_id").primaryKey().references(() => editorialStory.id),
  mediaId: text("media_id").notNull().references(() => media.id),
  primarySiteId: text("primary_site_id").notNull().references(() => mediaSite.id),
});

export const platformEditorialConfig = pgTable("platform_editorial_config", {
  id: text("id").primaryKey(),
  revision: integer("revision").notNull(),
  instructions: text("instructions").notNull(),
  factions: jsonb("factions").$type<EditorialFaction[]>().notNull(),
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [uniqueIndex("platform_editorial_config_revision_idx").on(t.revision)]);

export const editorialSection = pgTable("editorial_section", {
  id: text("id").primaryKey(),
  mediaId: text("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  revision: integer("revision").default(1).notNull(),
  archived: boolean("archived").default(false).notNull(),
  parentId: text("parent_id").references((): AnyPgColumn => editorialSection.id),
  paused: boolean("paused").default(false).notNull(),
  settings: jsonb("settings").$type<SectionSettings>().default({ language: "fa", factionId: null, viewpointStrength: 0, humor: 0, formality: 70, sourceIds: [], categories: [] }).notNull(),
  autoEnabled: boolean("auto_enabled").default(false).notNull(),
  autoIntervalMinutes: integer("auto_interval_minutes").default(10).notNull(),
  autoBatchSize: integer("auto_batch_size").default(3).notNull(),
  autoActorUserId: text("auto_actor_user_id").references(() => user.id, { onDelete: "set null" }),
  lastEnqueuedAt: timestamp("last_enqueued_at", { withTimezone: true }),
  autoErrorCode: text("auto_error_code"),
}, (t) => [uniqueIndex("editorial_section_name_idx").on(t.mediaId, t.name)]);

export const editorialPolicy = pgTable("editorial_policy", {
  id: text("id").primaryKey(),
  mediaId: text("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
  instructions: text("instructions").notNull(),
  settingsSnapshot: jsonb("settings_snapshot").$type<EditorialSettingsSnapshot>(),
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const editorialStory = pgTable("editorial_story", {
  id: text("id").primaryKey(),
  mediaId: text("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
  revision: integer("revision").default(1).notNull(),
  status: text("status").default("draft").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("editorial_story_media_idx").on(t.mediaId, t.updatedAt)]);

export const storySource = pgTable("story_source", {
  id: text("id").primaryKey(),
  mediaId: text("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
  storyId: text("story_id").notNull().references(() => editorialStory.id, { onDelete: "cascade" }),
  rawArticleId: text("raw_article_id").references(() => rawArticle.id, { onDelete: "set null" }),
  snapshot: jsonb("snapshot").$type<{ title: string; content: string; url: string; sourceId: string; sourceName: string; imageUrl: string | null; provenance: Record<string, unknown> }>().notNull(),
}, (t) => [uniqueIndex("story_source_raw_idx").on(t.mediaId, t.storyId, t.rawArticleId)]);

export const articleVersion = pgTable("article_version", {
  id: text("id").primaryKey(),
  mediaId: text("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
  storyId: text("story_id").notNull().references(() => editorialStory.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull(),
  policyId: text("policy_id").notNull().references(() => editorialPolicy.id),
  sectionId: text("section_id").notNull().references(() => editorialSection.id),
  secondarySectionIds: jsonb("secondary_section_ids").$type<string[]>().default([]).notNull(),
  sourceIds: jsonb("source_ids").$type<string[]>(),
  renditions: jsonb("renditions").$type<EditorialRenditions>(),
  title: text("title").notNull(),
  lead: text("lead").notNull(),
  body: text("body").notNull(),
  imageUrl: text("image_url"),
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("article_version_revision_idx").on(t.storyId, t.revision)]);

export const editorialApproval = pgTable("editorial_approval", {
  id: text("id").primaryKey(),
  mediaId: text("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
  versionId: text("version_id").notNull().references(() => articleVersion.id, { onDelete: "cascade" }),
  decision: text("decision").notNull(),
  note: text("note").notNull(),
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const editorialJob = pgTable("editorial_job", {
  id: text("id").primaryKey(),
  mediaId: text("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
  sectionId: text("section_id").notNull().references(() => editorialSection.id),
  rawArticleId: text("raw_article_id").references(() => rawArticle.id, { onDelete: "set null" }),
  inputKey: text("input_key").notNull(),
  trigger: text("trigger").default("manual").notNull(),
  policyId: text("policy_id").notNull().references(() => editorialPolicy.id),
  input: jsonb("input").$type<{ title: string; content: string; url: string; sourceId: string; sourceName: string; imageUrl: string | null; provenance: Record<string, unknown> }>().notNull(),
  status: text("status").default("queued").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  claimToken: text("claim_token"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  storyId: text("story_id").references(() => editorialStory.id, { onDelete: "set null" }),
  requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
  errorCode: text("error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, t => [uniqueIndex("editorial_job_input_idx").on(t.mediaId, t.sectionId, t.inputKey), index("editorial_job_status_idx").on(t.status, t.createdAt)]);

export const auditEvent = pgTable(
  "audit_event",
  {
    id: text("id").primaryKey(),
    mediaId: text("media_id").references(() => media.id, { onDelete: "set null" }),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    correlationId: text("correlation_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_event_media_created_idx").on(table.mediaId, table.createdAt),
    index("audit_event_actor_created_idx").on(table.actorUserId, table.createdAt),
    index("audit_event_correlation_idx").on(table.correlationId),
  ],
);

export const platformAdmin = pgTable("platform_admin", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const mediaAdmin = pgTable("media_admin", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("media_admin_created_idx").on(table.createdAt),
]);

export const sourceAccessRequest = pgTable("source_access_request", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull().default("source_access"),
  subscriptionId: text("subscription_id").references(() => mediaSourceSubscription.id, { onDelete: "set null" }),
  mediaId: text("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
  requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
  sourceType: text("source_type").notNull(),
  platform: text("platform"),
  categoryMode: text("category_mode"),
  categoryIds: jsonb("category_ids").$type<string[]>().default([]).notNull(),
  sourceId: text("source_id").references(() => source.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  status: text("status").notNull().default("pending"),
  reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("source_access_request_status_created_idx").on(table.status, table.createdAt), index("source_access_request_media_idx").on(table.mediaId), index("source_access_request_source_status_idx").on(table.sourceId, table.status)]);

export const platformCategory = pgTable("platform_category", {
  id: text("id").primaryKey(),
  key: text("key").notNull(),
  nameFa: text("name_fa").notNull(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("platform_category_key_unique").on(table.key), index("platform_category_active_order_idx").on(table.active, table.sortOrder)]);

export const source = pgTable(
  "source",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    adapterKey: text("adapter_key").notNull().default("rss"),
    status: text("status").notNull().default("active"),
    enabled: boolean("enabled").notNull().default(true),
    visibleToMedia: boolean("visible_to_media").notNull().default(true),
    mediaDeliveryEnabled: boolean("media_delivery_enabled").notNull().default(true),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    scheduleMinutes: integer("schedule_minutes").notNull().default(15),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("source_url_unique").on(table.url),
    index("source_status_idx").on(table.status),
  ],
);

export const sourceCategoryMapping = pgTable("source_category_mapping", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull().references(() => source.id, { onDelete: "cascade" }),
  rawName: text("raw_name").notNull(),
  platformCategoryId: text("platform_category_id").references(() => platformCategory.id, { onDelete: "set null" }),
  revision: integer("revision").default(1).notNull(),
  mappedBy: text("mapped_by").references(() => user.id, { onDelete: "set null" }),
  mappedAt: timestamp("mapped_at", { withTimezone: true }),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex("source_category_mapping_source_name_idx").on(table.sourceId, table.rawName), index("source_category_mapping_target_idx").on(table.platformCategoryId)]);

export const mediaSourceSubscription = pgTable(
  "media_source_subscription",
  {
    id: text("id").primaryKey(),
    mediaId: text("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
    sourceId: text("source_id").notNull().references(() => source.id, { onDelete: "cascade" }),
    categoryMode: text("category_mode"),
    categoryIds: jsonb("category_ids").$type<string[]>().default([]).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("media_source_subscription_unique").on(table.mediaId, table.sourceId),
    index("media_source_subscription_media_idx").on(table.mediaId, table.enabled),
  ],
);

export const crawlerDefinition = pgTable(
  "crawler_definition",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull().references(() => source.id, { onDelete: "cascade" }),
    adapterKey: text("adapter_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("crawler_definition_source_unique").on(table.sourceId),
    index("crawler_definition_adapter_idx").on(table.adapterKey),
  ],
);

export const crawlerVersion = pgTable(
  "crawler_version",
  {
    id: text("id").primaryKey(),
    definitionId: text("definition_id").notNull().references(() => crawlerDefinition.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status").notNull().default("active"),
    config: jsonb("config").$type<Record<string, unknown>>().default({}).notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("crawler_version_definition_version_unique").on(table.definitionId, table.version),
    index("crawler_version_status_idx").on(table.status),
  ],
);

export const crawlRun = pgTable(
  "crawl_run",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull().references(() => source.id, { onDelete: "cascade" }),
    crawlerVersionId: text("crawler_version_id").notNull().references(() => crawlerVersion.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("queued"),
    trigger: text("trigger").notNull().default("manual"),
    correlationId: text("correlation_id").notNull(),
    discoveredCount: integer("discovered_count").notNull().default(0),
    insertedCount: integer("inserted_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    quarantinedCount: integer("quarantined_count").notNull().default(0),
    failedCount: integer("failed_count"),
    errorCode: text("error_code"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("crawl_run_source_created_idx").on(table.sourceId, table.createdAt),
    uniqueIndex("crawl_run_source_active_unique")
      .on(table.sourceId)
      .where(sql`${table.status} in ('queued', 'running')`),
    uniqueIndex("crawl_run_correlation_unique").on(table.correlationId),
  ],
);

export const crawlRunEvent = pgTable(
  "crawl_run_event",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull().references(() => crawlRun.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    stage: text("stage").notNull(),
    status: text("status").notNull(),
    level: text("level").notNull().default("info"),
    message: text("message").notNull(),
    articleUrl: text("article_url"),
    errorCode: text("error_code"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("crawl_run_event_run_created_idx").on(table.runId, table.createdAt),
  ],
);

export const rawArticle = pgTable(
  "raw_article",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull().references(() => source.id, { onDelete: "cascade" }),
    crawlRunId: text("crawl_run_id").notNull().references(() => crawlRun.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    canonicalUrl: text("canonical_url").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    content: text("content"),
    contentHtml: text("content_html"),
    imageUrl: text("image_url"),
    categories: jsonb("categories").$type<string[]>().default([]).notNull(),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    author: text("author"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    contentHash: text("content_hash").notNull(),
    status: text("status").notNull().default("new"),
    quarantineReason: text("quarantine_reason"),
    provenance: jsonb("provenance").$type<Record<string, unknown>>().default({}).notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("raw_article_source_hash_unique").on(table.sourceId, table.contentHash),
    index("raw_article_source_status_idx").on(table.sourceId, table.status),
  ],
);

export const mediaInboxItem = pgTable(
  "media_inbox_item",
  {
    id: text("id").primaryKey(),
    mediaId: text("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
    rawArticleId: text("raw_article_id").notNull().references(() => rawArticle.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("media_inbox_item_unique").on(table.mediaId, table.rawArticleId),
    index("media_inbox_item_media_created_idx").on(table.mediaId, table.createdAt),
  ],
);
