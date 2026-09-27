import { apiError, apiSuccess, correlationId } from "@/lib/api-response";
import { getDashboardContext } from "@/lib/server/context";

export async function GET(request: Request) {
  const requestId = correlationId(request);
  try {
    const context = await getDashboardContext(request.headers);
    if (!context) return apiError("UNAUTHENTICATED", "نشست معتبر یا رسانهٔ قابل دسترس پیدا نشد.", requestId, 401);
    return apiSuccess(context, requestId);
  } catch (error) {
    console.error("context endpoint failed", { requestId, error });
    return apiError("INTERNAL_ERROR", "دریافت اطلاعات فضای کار ناموفق بود.", requestId, 500);
  }
}
