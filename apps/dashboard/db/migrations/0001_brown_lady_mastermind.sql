CREATE TABLE "crawl_run" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"source_id" text NOT NULL,
	"crawler_version_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"correlation_id" text NOT NULL,
	"discovered_count" integer DEFAULT 0 NOT NULL,
	"inserted_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"quarantined_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"requested_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crawler_definition" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"source_id" text NOT NULL,
	"adapter_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crawler_version" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"definition_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_article" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"source_id" text NOT NULL,
	"crawl_run_id" text NOT NULL,
	"external_id" text,
	"canonical_url" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"published_at" timestamp with time zone,
	"content_hash" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"quarantine_reason" text,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"adapter_key" text DEFAULT 'rss' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"schedule_minutes" integer DEFAULT 15 NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error_code" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crawl_run" ADD CONSTRAINT "crawl_run_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_run" ADD CONSTRAINT "crawl_run_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_run" ADD CONSTRAINT "crawl_run_crawler_version_id_crawler_version_id_fk" FOREIGN KEY ("crawler_version_id") REFERENCES "public"."crawler_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_run" ADD CONSTRAINT "crawl_run_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawler_definition" ADD CONSTRAINT "crawler_definition_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawler_definition" ADD CONSTRAINT "crawler_definition_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawler_version" ADD CONSTRAINT "crawler_version_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawler_version" ADD CONSTRAINT "crawler_version_definition_id_crawler_definition_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."crawler_definition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawler_version" ADD CONSTRAINT "crawler_version_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_article" ADD CONSTRAINT "raw_article_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_article" ADD CONSTRAINT "raw_article_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_article" ADD CONSTRAINT "raw_article_crawl_run_id_crawl_run_id_fk" FOREIGN KEY ("crawl_run_id") REFERENCES "public"."crawl_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crawl_run_media_created_idx" ON "crawl_run" USING btree ("media_id","created_at");--> statement-breakpoint
CREATE INDEX "crawl_run_source_created_idx" ON "crawl_run" USING btree ("source_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crawl_run_correlation_unique" ON "crawl_run" USING btree ("correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crawler_definition_source_unique" ON "crawler_definition" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "crawler_definition_media_idx" ON "crawler_definition" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crawler_version_definition_version_unique" ON "crawler_version" USING btree ("definition_id","version");--> statement-breakpoint
CREATE INDEX "crawler_version_media_status_idx" ON "crawler_version" USING btree ("media_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_article_media_source_hash_unique" ON "raw_article" USING btree ("media_id","source_id","content_hash");--> statement-breakpoint
CREATE INDEX "raw_article_media_ingested_idx" ON "raw_article" USING btree ("media_id","ingested_at");--> statement-breakpoint
CREATE INDEX "raw_article_source_status_idx" ON "raw_article" USING btree ("source_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "source_media_url_unique" ON "source" USING btree ("media_id","url");--> statement-breakpoint
CREATE INDEX "source_media_status_idx" ON "source" USING btree ("media_id","status");