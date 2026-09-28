import { z } from "zod";
import { apiError, apiSuccess, correlationId } from "@/lib/api-response";
import { getDashboardContext } from "@/lib/server/context";
import { mediaRoles } from "@/lib/server/permissions";
import { getCrawlRunLiveLog } from "@/lib/server/sources";

const runIdSchema = z.string().trim().min(1).max(128);

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const requestId = correlationId(request);
  try {
    const context = await getDashboardContext(request.headers);
    if (!context) return apiError("UNAUTHENTICATED", "برای ادامه وارد حساب شوید.", requestId, 401);
    if (!mediaRoles[context.activeMedia.role].authorize({ source: ["read"] }).success) {
      return apiError("FORBIDDEN", "به گزارش اجرای منابع دسترسی ندارید.", requestId, 403);
    }
    const parsed = runIdSchema.safeParse((await params).runId);
    if (!parsed.success) return apiError("INVALID_INPUT", "شناسهٔ اجرا معتبر نیست.", requestId, 400);
    const log = await getCrawlRunLiveLog(context.activeMedia.id, parsed.data);
    if (!log) return apiError("INVALID_INPUT", "اجرای موردنظر پیدا نشد.", requestId, 404);
    return apiSuccess(log, requestId);
  } catch (error) {
    console.error("crawl run events endpoint failed", { requestId, error });
    return apiError("INTERNAL_ERROR", "دریافت گزارش زنده ناموفق بود.", requestId, 500);
  }
}
