CREATE TABLE "source_access_request" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"requested_by" text,
	"source_type" text NOT NULL,
	"platform" text,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_access_request" ADD CONSTRAINT "source_access_request_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_access_request" ADD CONSTRAINT "source_access_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_access_request" ADD CONSTRAINT "source_access_request_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_access_request_status_created_idx" ON "source_access_request" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "source_access_request_media_idx" ON "source_access_request" USING btree ("media_id");