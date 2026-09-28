import { z } from "zod";
import { apiError, apiSuccess, correlationId } from "@/lib/api-response";
import { getDashboardContext } from "@/lib/server/context";
import { mediaRoles } from "@/lib/server/permissions";
import { deleteSource } from "@/lib/server/sources";

const sourceIdSchema = z.string().trim().min(1).max(128);

export async function DELETE(request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const requestId = correlationId(request);
  try {
    const context = await getDashboardContext(request.headers);
    if (!context) return apiError("UNAUTHENTICATED", "برای ادامه وارد حساب شوید.", requestId, 401);
    if (!mediaRoles[context.activeMedia.role].authorize({ source: ["delete"] }).success) {
      return apiError("FORBIDDEN", "اجازهٔ حذف این منبع را ندارید.", requestId, 403);
    }
    const parsed = sourceIdSchema.safeParse((await params).sourceId);
    if (!parsed.success) return apiError("INVALID_INPUT", "شناسهٔ منبع معتبر نیست.", requestId, 400);
    const result = await deleteSource({ mediaId: context.activeMedia.id, sourceId: parsed.data, actorUserId: context.user.id, correlationId: requestId });
    if (!result) return apiError("INVALID_INPUT", "منبع پیدا نشد.", requestId, 404);
    return apiSuccess(result, requestId);
  } catch (error) {
    console.error("delete source endpoint failed", { requestId, error });
    return apiError("INTERNAL_ERROR", "حذف منبع ناموفق بود.", requestId, 500);
  }
}
