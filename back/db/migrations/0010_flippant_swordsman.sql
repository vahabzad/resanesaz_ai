CREATE TABLE "platform_editorial_config" (
	"id" text PRIMARY KEY NOT NULL,
	"revision" integer NOT NULL,
	"instructions" text NOT NULL,
	"factions" jsonb NOT NULL,
	"actor_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "editorial_policy" ADD COLUMN "settings_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "editorial_section" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "editorial_section" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "editorial_section" ADD COLUMN "settings" jsonb DEFAULT '{"factionId":null,"viewpointStrength":0,"humor":0,"formality":70,"sourceIds":[],"categories":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_editorial_config" ADD CONSTRAINT "platform_editorial_config_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_editorial_config_revision_idx" ON "platform_editorial_config" USING btree ("revision");