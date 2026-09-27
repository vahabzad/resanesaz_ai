import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { membership } from "@/db/schema";
import { apiError, apiSuccess, correlationId } from "@/lib/api-response";
import { recordAuditEvent } from "@/lib/server/audit";
import { auth } from "@/lib/server/auth";
import { db } from "@/lib/server/database";

const inputSchema = z.object({ mediaId: z.string().trim().min(1).max(128) }).strict();

export async function POST(request: Request) {
  const requestId = correlationId(request);
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return apiError("UNAUTHENTICATED", "برای ادامه وارد حساب شوید.", requestId, 401);

    const parsed = inputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("INVALID_INPUT", "رسانهٔ انتخاب‌شده معتبر نیست.", requestId, 400);

    const allowed = await db
      .select({ id: membership.id, role: membership.role })
      .from(membership)
      .where(and(eq(membership.userId, session.user.id), eq(membership.organizationId, parsed.data.mediaId)))
      .limit(1);

    if (!allowed[0]) return apiError("FORBIDDEN", "به این رسانه دسترسی ندارید.", requestId, 403);

    await auth.api.setActiveOrganization({
      headers: request.headers,
      body: { organizationId: parsed.data.mediaId },
    });

    await recordAuditEvent({
      mediaId: parsed.data.mediaId,
      actorUserId: session.user.id,
      action: "media.active.changed",
      targetType: "media",
      targetId: parsed.data.mediaId,
      correlationId: requestId,
      metadata: { role: allowed[0].role },
    });

    return apiSuccess({ activeMediaId: parsed.data.mediaId }, requestId);
  } catch (error) {
    console.error("select media endpoint failed", { requestId, error });
    return apiError("INTERNAL_ERROR", "تغییر رسانه ناموفق بود.", requestId, 500);
  }
}
