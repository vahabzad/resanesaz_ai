CREATE TABLE "article_version" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"story_id" text NOT NULL,
	"revision" integer NOT NULL,
	"policy_id" text NOT NULL,
	"section_id" text NOT NULL,
	"title" text NOT NULL,
	"lead" text NOT NULL,
	"body" text NOT NULL,
	"image_url" text,
	"actor_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editorial_approval" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"version_id" text NOT NULL,
	"decision" text NOT NULL,
	"note" text NOT NULL,
	"actor_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editorial_policy" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"instructions" text NOT NULL,
	"actor_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editorial_section" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editorial_story" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_source" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"story_id" text NOT NULL,
	"raw_article_id" text,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "article_version" ADD CONSTRAINT "article_version_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_version" ADD CONSTRAINT "article_version_story_id_editorial_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."editorial_story"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_version" ADD CONSTRAINT "article_version_policy_id_editorial_policy_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."editorial_policy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_version" ADD CONSTRAINT "article_version_section_id_editorial_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."editorial_section"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_version" ADD CONSTRAINT "article_version_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_approval" ADD CONSTRAINT "editorial_approval_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_approval" ADD CONSTRAINT "editorial_approval_version_id_article_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."article_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_approval" ADD CONSTRAINT "editorial_approval_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_policy" ADD CONSTRAINT "editorial_policy_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_policy" ADD CONSTRAINT "editorial_policy_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_section" ADD CONSTRAINT "editorial_section_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_story" ADD CONSTRAINT "editorial_story_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_source" ADD CONSTRAINT "story_source_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_source" ADD CONSTRAINT "story_source_story_id_editorial_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."editorial_story"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_source" ADD CONSTRAINT "story_source_raw_article_id_raw_article_id_fk" FOREIGN KEY ("raw_article_id") REFERENCES "public"."raw_article"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "article_version_revision_idx" ON "article_version" USING btree ("story_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "editorial_section_name_idx" ON "editorial_section" USING btree ("media_id","name");--> statement-breakpoint
CREATE INDEX "editorial_story_media_idx" ON "editorial_story" USING btree ("media_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "story_source_raw_idx" ON "story_source" USING btree ("media_id","story_id","raw_article_id");