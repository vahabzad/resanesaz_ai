CREATE TABLE "media_inbox_item" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"raw_article_id" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_source_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"source_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_admin" (
	"user_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "media_source_subscription" ("id", "media_id", "source_id", "enabled", "created_by", "created_at")
SELECT 'legacy_subscription_' || "id", "media_id", "id", true, "created_by", "created_at" FROM "source";
--> statement-breakpoint
INSERT INTO "media_inbox_item" ("id", "media_id", "raw_article_id", "status", "created_at")
SELECT 'legacy_inbox_' || "id", "media_id", "id", "status", "ingested_at" FROM "raw_article";
--> statement-breakpoint
UPDATE "source" SET "adapter_key" = 'web' WHERE "adapter_key" = 'crawler-generator';
--> statement-breakpoint
UPDATE "crawler_definition" SET "adapter_key" = 'web' WHERE "adapter_key" = 'crawler-generator';
--> statement-breakpoint
ALTER TABLE "crawl_run" DROP CONSTRAINT "crawl_run_media_id_media_id_fk";
--> statement-breakpoint
ALTER TABLE "crawl_run_event" DROP CONSTRAINT "crawl_run_event_media_id_media_id_fk";
--> statement-breakpoint
ALTER TABLE "crawler_definition" DROP CONSTRAINT "crawler_definition_media_id_media_id_fk";
--> statement-breakpoint
ALTER TABLE "crawler_version" DROP CONSTRAINT "crawler_version_media_id_media_id_fk";
--> statement-breakpoint
ALTER TABLE "raw_article" DROP CONSTRAINT "raw_article_media_id_media_id_fk";
--> statement-breakpoint
ALTER TABLE "source" DROP CONSTRAINT "source_media_id_media_id_fk";
--> statement-breakpoint
DROP INDEX "crawl_run_media_created_idx";--> statement-breakpoint
DROP INDEX "crawl_run_event_media_created_idx";--> statement-breakpoint
DROP INDEX "crawler_definition_media_idx";--> statement-breakpoint
DROP INDEX "crawler_version_media_status_idx";--> statement-breakpoint
DROP INDEX "raw_article_media_source_hash_unique";--> statement-breakpoint
DROP INDEX "raw_article_media_ingested_idx";--> statement-breakpoint
DROP INDEX "source_media_url_unique";--> statement-breakpoint
DROP INDEX "source_media_status_idx";--> statement-breakpoint
ALTER TABLE "media_inbox_item" ADD CONSTRAINT "media_inbox_item_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_inbox_item" ADD CONSTRAINT "media_inbox_item_raw_article_id_raw_article_id_fk" FOREIGN KEY ("raw_article_id") REFERENCES "public"."raw_article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_source_subscription" ADD CONSTRAINT "media_source_subscription_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_source_subscription" ADD CONSTRAINT "media_source_subscription_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_source_subscription" ADD CONSTRAINT "media_source_subscription_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_admin" ADD CONSTRAINT "platform_admin_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_inbox_item_unique" ON "media_inbox_item" USING btree ("media_id","raw_article_id");--> statement-breakpoint
CREATE INDEX "media_inbox_item_media_created_idx" ON "media_inbox_item" USING btree ("media_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_source_subscription_unique" ON "media_source_subscription" USING btree ("media_id","source_id");--> statement-breakpoint
CREATE INDEX "media_source_subscription_media_idx" ON "media_source_subscription" USING btree ("media_id","enabled");--> statement-breakpoint
CREATE INDEX "crawler_definition_adapter_idx" ON "crawler_definition" USING btree ("adapter_key");--> statement-breakpoint
CREATE INDEX "crawler_version_status_idx" ON "crawler_version" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_article_source_hash_unique" ON "raw_article" USING btree ("source_id","content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "source_url_unique" ON "source" USING btree ("url");--> statement-breakpoint
CREATE INDEX "source_status_idx" ON "source" USING btree ("status");--> statement-breakpoint
ALTER TABLE "crawl_run" DROP COLUMN "media_id";--> statement-breakpoint
ALTER TABLE "crawl_run_event" DROP COLUMN "media_id";--> statement-breakpoint
ALTER TABLE "crawler_definition" DROP COLUMN "media_id";--> statement-breakpoint
ALTER TABLE "crawler_version" DROP COLUMN "media_id";--> statement-breakpoint
ALTER TABLE "raw_article" DROP COLUMN "media_id";--> statement-breakpoint
ALTER TABLE "source" DROP COLUMN "media_id";
