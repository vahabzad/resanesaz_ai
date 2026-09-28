import { z } from "zod";
import { apiError, apiSuccess, correlationId } from "@/lib/api-response";
import { getDashboardContext } from "@/lib/server/context";
import { mediaRoles } from "@/lib/server/permissions";
import { executeRssSource } from "@/lib/server/sources";

const sourceIdSchema = z.string().trim().min(1).max(128);

export async function POST(request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const requestId = correlationId(request);
  try {
    const context = await getDashboardContext(request.headers);
    if (!context) return apiError("UNAUTHENTICATED", "برای ادامه وارد حساب شوید.", requestId, 401);
    if (!mediaRoles[context.activeMedia.role].authorize({ source: ["run"] }).success) {
      return apiError("FORBIDDEN", "اجازهٔ اجرای این منبع را ندارید.", requestId, 403);
    }

    const parsedSourceId = sourceIdSchema.safeParse((await params).sourceId);
    if (!parsedSourceId.success) return apiError("INVALID_INPUT", "شناسهٔ منبع معتبر نیست.", requestId, 400);

    const result = await executeRssSource({
      mediaId: context.activeMedia.id,
      sourceId: parsedSourceId.data,
      actorUserId: context.user.id,
      correlationId: requestId,
    });
    if (!result) return apiError("INVALID_INPUT", "منبع فعال پیدا نشد.", requestId, 404);
    return apiSuccess(result, requestId);
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "ADAPTER_FAILED";
    console.error("run source endpoint failed", { requestId, errorCode });
    return apiError("INTERNAL_ERROR", "اجرای منبع ناموفق بود.", requestId, 502);
  }
}
