import { apiError, apiSuccess, correlationId } from "@/lib/api-response";
import { getDashboardContext } from "@/lib/server/context";
import { getInboxWorkspace } from "@/lib/server/inbox";
import { mediaRoles } from "@/lib/server/permissions";

export async function GET(request: Request) {
  const requestId = correlationId(request);
  const context = await getDashboardContext(request.headers);
  if (!context) return apiError("UNAUTHENTICATED", "برای ادامه وارد حساب شوید.", requestId, 401);
  if (!mediaRoles[context.activeMedia.role].authorize({ source: ["read"] }).success) {
    return apiError("FORBIDDEN", "به اخبار ورودی این رسانه دسترسی ندارید.", requestId, 403);
  }
  return apiSuccess(await getInboxWorkspace(context.activeMedia.id), requestId);
}
