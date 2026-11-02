ALTER TABLE "article_version" ADD COLUMN "secondary_section_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "article_version" ADD COLUMN "source_ids" jsonb;--> statement-breakpoint
ALTER TABLE "article_version" ADD COLUMN "renditions" jsonb;--> statement-breakpoint
ALTER TABLE "editorial_section" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "editorial_section" ADD CONSTRAINT "editorial_section_parent_id_editorial_section_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."editorial_section"("id") ON DELETE no action ON UPDATE no action;