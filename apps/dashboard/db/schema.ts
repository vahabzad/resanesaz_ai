import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { media, user } from "./auth-schema";

export * from "./auth-schema";

export const auditEvent = pgTable(
  "audit_event",
  {
    id: text("id").primaryKey(),
    mediaId: text("media_id").references(() => media.id, { onDelete: "set null" }),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    correlationId: text("correlation_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_event_media_created_idx").on(table.mediaId, table.createdAt),
    index("audit_event_actor_created_idx").on(table.actorUserId, table.createdAt),
    index("audit_event_correlation_idx").on(table.correlationId),
  ],
);
