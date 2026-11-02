CREATE TABLE "media_site" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"spec" jsonb NOT NULL,
	"live_spec" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_article" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"site_id" text NOT NULL,
	"story_id" text NOT NULL,
	"version_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_publication_job" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"site_id" text NOT NULL,
	"story_id" text NOT NULL,
	"version_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requested_by" text,
	"error_code" text,
	"result_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "media_site" ADD CONSTRAINT "media_site_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_article" ADD CONSTRAINT "site_article_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_article" ADD CONSTRAINT "site_article_site_id_media_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."media_site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_article" ADD CONSTRAINT "site_article_story_id_editorial_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."editorial_story"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_article" ADD CONSTRAINT "site_article_version_id_article_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."article_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_publication_job" ADD CONSTRAINT "web_publication_job_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_publication_job" ADD CONSTRAINT "web_publication_job_site_id_media_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."media_site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_publication_job" ADD CONSTRAINT "web_publication_job_story_id_editorial_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."editorial_story"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_publication_job" ADD CONSTRAINT "web_publication_job_version_id_article_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."article_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_publication_job" ADD CONSTRAINT "web_publication_job_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_site_slug_idx" ON "media_site" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "media_site_media_idx" ON "media_site" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_article_story_idx" ON "site_article" USING btree ("site_id","story_id");--> statement-breakpoint
CREATE INDEX "site_article_page_idx" ON "site_article" USING btree ("site_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "web_publication_input_idx" ON "web_publication_job" USING btree ("media_id","site_id","version_id");--> statement-breakpoint
CREATE INDEX "web_publication_due_idx" ON "web_publication_job" USING btree ("status","scheduled_at");