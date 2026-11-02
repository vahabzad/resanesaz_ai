CREATE TABLE "media_creation_request" (
	"media_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"requested_by" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text
);
--> statement-breakpoint
ALTER TABLE "media_creation_request" ADD CONSTRAINT "media_creation_request_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_creation_request" ADD CONSTRAINT "media_creation_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_creation_request" ADD CONSTRAINT "media_creation_request_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_creation_request_status_idx" ON "media_creation_request" USING btree ("status","submitted_at");
--> statement-breakpoint
INSERT INTO media_creation_request (media_id, requested_by, submitted_at)
SELECT m.id, owner.user_id, now()
FROM media m
LEFT JOIN LATERAL (SELECT user_id FROM membership WHERE organization_id = m.id AND role = 'owner' ORDER BY created_at, id LIMIT 1) owner ON true
WHERE m.metadata IS NOT NULL AND m.metadata::jsonb #>> '{setupPreferences,setupCompleted}' = 'true'
ON CONFLICT (media_id) DO NOTHING;
