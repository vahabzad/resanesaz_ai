CREATE TABLE "platform_category" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name_fa" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_access_request" ADD COLUMN "category_mode" text;--> statement-breakpoint
ALTER TABLE "source_access_request" ADD COLUMN "category_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_category_key_unique" ON "platform_category" USING btree ("key");--> statement-breakpoint
CREATE INDEX "platform_category_active_order_idx" ON "platform_category" USING btree ("active","sort_order");--> statement-breakpoint
INSERT INTO "platform_category" ("id", "key", "name_fa", "name_en", "name_ar", "active", "sort_order") VALUES
  ('category_general', 'general', 'عمومی', 'General', 'عام', true, 10),
  ('category_politics', 'politics', 'سیاسی', 'Politics', 'سياسة', true, 20),
  ('category_economy', 'economy', 'اقتصادی', 'Economy', 'اقتصاد', true, 30),
  ('category_society', 'society', 'اجتماعی', 'Society', 'مجتمع', true, 40),
  ('category_culture', 'culture', 'فرهنگی', 'Culture', 'ثقافة', true, 50),
  ('category_sports', 'sports', 'ورزشی', 'Sports', 'رياضة', true, 60),
  ('category_world', 'world', 'بین‌الملل', 'World', 'العالم', true, 70),
  ('category_technology', 'technology', 'فناوری', 'Technology', 'تكنولوجيا', true, 80)
ON CONFLICT ("key") DO NOTHING;
