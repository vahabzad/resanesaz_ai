ALTER TABLE "raw_article" ADD COLUMN "content" text;--> statement-breakpoint
ALTER TABLE "raw_article" ADD COLUMN "content_html" text;--> statement-breakpoint
ALTER TABLE "raw_article" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "raw_article" ADD COLUMN "categories" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "raw_article" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "raw_article" ADD COLUMN "author" text;