ALTER TABLE "source" ADD COLUMN "visible_to_media" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "source" ADD COLUMN "archived_at" timestamp with time zone;