import "server-only";

import { randomUUID } from "node:crypto";
import { auditEvent } from "@/db/schema";
import { db } from "@/lib/server/database";

type AuditInput = {
  mediaId?: string | null;
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  correlationId: string;
  metadata?: Record<string, unknown>;
};

export async function recordAuditEvent(input: AuditInput) {
  await db.insert(auditEvent).values({
    id: randomUUID(),
    mediaId: input.mediaId ?? null,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    correlationId: input.correlationId,
    metadata: input.metadata ?? {},
  });
}
