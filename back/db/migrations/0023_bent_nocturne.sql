CREATE TABLE "source_category_mapping" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"raw_name" text NOT NULL,
	"platform_category_id" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"mapped_by" text,
	"mapped_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_category_mapping" ADD CONSTRAINT "source_category_mapping_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_category_mapping" ADD CONSTRAINT "source_category_mapping_platform_category_id_platform_category_id_fk" FOREIGN KEY ("platform_category_id") REFERENCES "public"."platform_category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_category_mapping" ADD CONSTRAINT "source_category_mapping_mapped_by_user_id_fk" FOREIGN KEY ("mapped_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "source_category_mapping_source_name_idx" ON "source_category_mapping" USING btree ("source_id","raw_name");--> statement-breakpoint
CREATE INDEX "source_category_mapping_target_idx" ON "source_category_mapping" USING btree ("platform_category_id");
--> statement-breakpoint
INSERT INTO source_category_mapping (id, source_id, raw_name, first_seen_at, last_seen_at)
SELECT 'scm_' || md5(source_id || E'\n' || trim(category.value)), source_id, trim(category.value), min(ingested_at), max(ingested_at)
FROM raw_article
CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_array_length(categories) = 0 THEN '[""]'::jsonb ELSE categories END) AS category(value)
GROUP BY source_id, trim(category.value)
ON CONFLICT (source_id, raw_name) DO NOTHING;
