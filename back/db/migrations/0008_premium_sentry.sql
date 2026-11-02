ALTER TABLE "crawl_run" ADD COLUMN "failed_count" integer;--> statement-breakpoint
ALTER TABLE "crawl_run_event" ADD COLUMN "article_url" text;--> statement-breakpoint
ALTER TABLE "crawl_run_event" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "crawl_run_event" ADD COLUMN "duration_ms" integer;