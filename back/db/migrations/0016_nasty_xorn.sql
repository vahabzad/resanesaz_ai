CREATE TABLE "publication_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"site_id" text NOT NULL,
	"name" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"settings" jsonb NOT NULL,
	"actor_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_publication_policy" (
	"story_id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"primary_site_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_article" ADD COLUMN "modified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "site_article" ADD COLUMN "withdrawn_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "web_publication_job" ADD COLUMN "rule_id" text;--> statement-breakpoint
ALTER TABLE "publication_rule" ADD CONSTRAINT "publication_rule_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_rule" ADD CONSTRAINT "publication_rule_site_id_media_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."media_site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_rule" ADD CONSTRAINT "publication_rule_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_publication_policy" ADD CONSTRAINT "story_publication_policy_story_id_editorial_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."editorial_story"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_publication_policy" ADD CONSTRAINT "story_publication_policy_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_publication_policy" ADD CONSTRAINT "story_publication_policy_primary_site_id_media_site_id_fk" FOREIGN KEY ("primary_site_id") REFERENCES "public"."media_site"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publication_rule_media_idx" ON "publication_rule" USING btree ("media_id");--> statement-breakpoint
ALTER TABLE "web_publication_job" ADD CONSTRAINT "web_publication_job_rule_id_publication_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."publication_rule"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO story_publication_policy (story_id, media_id, primary_site_id)
SELECT DISTINCT ON (story_id) story_id, media_id, site_id FROM site_article ORDER BY story_id, published_at, id;
--> statement-breakpoint
UPDATE site_article SET modified_at = published_at;
