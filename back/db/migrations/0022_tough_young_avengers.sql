ALTER TABLE "media_source_subscription" ADD COLUMN "category_mode" text;--> statement-breakpoint
ALTER TABLE "media_source_subscription" ADD COLUMN "category_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "source_access_request" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "source_access_request" ADD CONSTRAINT "source_access_request_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_access_request_source_status_idx" ON "source_access_request" USING btree ("source_id","status");--> statement-breakpoint
UPDATE "source_access_request" SET "status" = 'pending' WHERE "status" = 'approved';
