import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { media, user } from "./auth-schema";

export * from "./auth-schema";

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

export const source = pgTable(
  "source",
  {
    id: text("id").primaryKey(),
    mediaId: text("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    adapterKey: text("adapter_key").notNull().default("rss"),
    status: text("status").notNull().default("active"),
    enabled: boolean("enabled").notNull().default(true),
    scheduleMinutes: integer("schedule_minutes").notNull().default(15),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("source_media_url_unique").on(table.mediaId, table.url),
    index("source_media_status_idx").on(table.mediaId, table.status),
  ],
);

export const crawlerDefinition = pgTable(
  "crawler_definition",
  {
    id: text("id").primaryKey(),
    mediaId: text("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
    sourceId: text("source_id").notNull().references(() => source.id, { onDelete: "cascade" }),
    adapterKey: text("adapter_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("crawler_definition_source_unique").on(table.sourceId),
    index("crawler_definition_media_idx").on(table.mediaId),
  ],
);

export const crawlerVersion = pgTable(
  "crawler_version",
  {
    id: text("id").primaryKey(),
    mediaId: text("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
    definitionId: text("definition_id").notNull().references(() => crawlerDefinition.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status").notNull().default("active"),
    config: jsonb("config").$type<Record<string, unknown>>().default({}).notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("crawler_version_definition_version_unique").on(table.definitionId, table.version),
    index("crawler_version_media_status_idx").on(table.mediaId, table.status),
  ],
);

export const crawlRun = pgTable(
  "crawl_run",
  {
    id: text("id").primaryKey(),
    mediaId: text("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
    sourceId: text("source_id").notNull().references(() => source.id, { onDelete: "cascade" }),
    crawlerVersionId: text("crawler_version_id").notNull().references(() => crawlerVersion.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("queued"),
    trigger: text("trigger").notNull().default("manual"),
    correlationId: text("correlation_id").notNull(),
    discoveredCount: integer("discovered_count").notNull().default(0),
    insertedCount: integer("inserted_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    quarantinedCount: integer("quarantined_count").notNull().default(0),
    errorCode: text("error_code"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("crawl_run_media_created_idx").on(table.mediaId, table.createdAt),
    index("crawl_run_source_created_idx").on(table.sourceId, table.createdAt),
    uniqueIndex("crawl_run_source_active_unique")
      .on(table.sourceId)
      .where(sql`${table.status} in ('queued', 'running')`),
    uniqueIndex("crawl_run_correlation_unique").on(table.correlationId),
  ],
);

export const rawArticle = pgTable(
  "raw_article",
  {
    id: text("id").primaryKey(),
    mediaId: text("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
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
    uniqueIndex("raw_article_media_source_hash_unique").on(table.mediaId, table.sourceId, table.contentHash),
    index("raw_article_media_ingested_idx").on(table.mediaId, table.ingestedAt),
    index("raw_article_source_status_idx").on(table.sourceId, table.status),
  ],
);
