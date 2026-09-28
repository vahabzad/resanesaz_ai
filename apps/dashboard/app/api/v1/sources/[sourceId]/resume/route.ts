import { z } from "zod";
import { apiError, apiSuccess, correlationId } from "@/lib/api-response";
import { getDashboardContext } from "@/lib/server/context";
import { mediaRoles } from "@/lib/server/permissions";
import { resumeSource } from "@/lib/server/sources";

const sourceIdSchema = z.string().trim().min(1).max(128);

export async function POST(request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const requestId = correlationId(request);
  try {
    const context = await getDashboardContext(request.headers);
    if (!context) return apiError("UNAUTHENTICATED", "برای ادامه وارد حساب شوید.", requestId, 401);
    if (!mediaRoles[context.activeMedia.role].authorize({ source: ["update"] }).success) {
      return apiError("FORBIDDEN", "اجازهٔ فعال‌سازی این منبع را ندارید.", requestId, 403);
    }
    const parsed = sourceIdSchema.safeParse((await params).sourceId);
    if (!parsed.success) return apiError("INVALID_INPUT", "شناسهٔ منبع معتبر نیست.", requestId, 400);
    const result = await resumeSource({ mediaId: context.activeMedia.id, sourceId: parsed.data, actorUserId: context.user.id, correlationId: requestId });
    if (!result) return apiError("INVALID_INPUT", "منبع متوقف‌شده پیدا نشد.", requestId, 404);
    return apiSuccess(result, requestId);
  } catch (error) {
    console.error("resume source endpoint failed", { requestId, error });
    return apiError("INTERNAL_ERROR", "فعال‌سازی منبع ناموفق بود.", requestId, 500);
  }
}
