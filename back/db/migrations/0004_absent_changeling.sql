CREATE TABLE "crawl_run_event" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"run_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"stage" text NOT NULL,
	"status" text NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crawl_run_event" ADD CONSTRAINT "crawl_run_event_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawl_run_event" ADD CONSTRAINT "crawl_run_event_run_id_crawl_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."crawl_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crawl_run_event_run_created_idx" ON "crawl_run_event" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "crawl_run_event_media_created_idx" ON "crawl_run_event" USING btree ("media_id","created_at");