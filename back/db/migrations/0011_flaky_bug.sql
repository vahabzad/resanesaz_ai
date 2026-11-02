CREATE TABLE "editorial_job" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"section_id" text NOT NULL,
	"raw_article_id" text,
	"input_key" text NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"policy_id" text NOT NULL,
	"input" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claim_token" text,
	"lease_until" timestamp with time zone,
	"story_id" text,
	"requested_by" text,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "editorial_section" ADD COLUMN "auto_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "editorial_section" ADD COLUMN "auto_interval_minutes" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "editorial_section" ADD COLUMN "auto_batch_size" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "editorial_section" ADD COLUMN "auto_actor_user_id" text;--> statement-breakpoint
ALTER TABLE "editorial_section" ADD COLUMN "last_enqueued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "editorial_section" ADD COLUMN "auto_error_code" text;--> statement-breakpoint
ALTER TABLE "editorial_job" ADD CONSTRAINT "editorial_job_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_job" ADD CONSTRAINT "editorial_job_section_id_editorial_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."editorial_section"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_job" ADD CONSTRAINT "editorial_job_raw_article_id_raw_article_id_fk" FOREIGN KEY ("raw_article_id") REFERENCES "public"."raw_article"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_job" ADD CONSTRAINT "editorial_job_policy_id_editorial_policy_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."editorial_policy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_job" ADD CONSTRAINT "editorial_job_story_id_editorial_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."editorial_story"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_job" ADD CONSTRAINT "editorial_job_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "editorial_job_input_idx" ON "editorial_job" USING btree ("media_id","section_id","input_key");--> statement-breakpoint
CREATE INDEX "editorial_job_status_idx" ON "editorial_job" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "editorial_section" ADD CONSTRAINT "editorial_section_auto_actor_user_id_user_id_fk" FOREIGN KEY ("auto_actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;