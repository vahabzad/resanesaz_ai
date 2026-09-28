import { z } from "zod";
import { apiError, apiSuccess, correlationId } from "@/lib/api-response";
import { getDashboardContext } from "@/lib/server/context";
import { mediaRoles } from "@/lib/server/permissions";
import { enqueueSourceRun } from "@/lib/server/crawl-jobs";
import { getSourceExecutionPolicy } from "@/lib/server/sources";

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

    const policy = await getSourceExecutionPolicy(context.activeMedia.id, parsedSourceId.data);
    if (!policy) return apiError("INVALID_INPUT", "منبع فعال پیدا نشد.", requestId, 404);
    if (policy.blocked) {
      return apiError("CRAWLER_EXECUTION_DISABLED", "اجرای کراولر تا اصلاح بازوی CrawlerGenerator موقتاً متوقف است.", requestId, 503);
    }

    const result = await enqueueSourceRun({
      mediaId: context.activeMedia.id,
      sourceId: parsedSourceId.data,
      actorUserId: context.user.id,
      correlationId: requestId,
      trigger: "manual",
    });
    if (!result) return apiError("INVALID_INPUT", "منبع فعال پیدا نشد.", requestId, 404);
    return apiSuccess(result, requestId, 202);
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "ADAPTER_FAILED";
    console.error("run source endpoint failed", { requestId, errorCode });
    return apiError("INTERNAL_ERROR", "قرار دادن منبع در صف ناموفق بود.", requestId, 500);
  }
}
