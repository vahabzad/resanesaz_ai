import { z } from "zod";
import { apiError, apiSuccess, correlationId } from "@/lib/api-response";
import { getDashboardContext } from "@/lib/server/context";
import { mediaRoles } from "@/lib/server/permissions";
import { createSource, getSourcesWorkspace } from "@/lib/server/sources";
import { enqueueSourceRun } from "@/lib/server/crawl-jobs";
import { UnsafeSourceUrlError } from "@/lib/server/url-safety";

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  url: z.url().max(2_048),
  scheduleMinutes: z.number().int().min(5).max(1_440).default(15),
  adapterKey: z.enum(["crawler-generator", "rss"]).default("crawler-generator"),
}).strict();

export async function GET(request: Request) {
  const requestId = correlationId(request);
  const context = await getDashboardContext(request.headers);
  if (!context) return apiError("UNAUTHENTICATED", "برای ادامه وارد حساب شوید.", requestId, 401);
  if (!mediaRoles[context.activeMedia.role].authorize({ source: ["read"] }).success) {
    return apiError("FORBIDDEN", "به منابع این رسانه دسترسی ندارید.", requestId, 403);
  }

  return apiSuccess(await getSourcesWorkspace(context.activeMedia.id), requestId);
}

export async function POST(request: Request) {
  const requestId = correlationId(request);
  try {
    const context = await getDashboardContext(request.headers);
    if (!context) return apiError("UNAUTHENTICATED", "برای ادامه وارد حساب شوید.", requestId, 401);
    if (!mediaRoles[context.activeMedia.role].authorize({ source: ["create"] }).success) {
      return apiError("FORBIDDEN", "اجازهٔ افزودن منبع را ندارید.", requestId, 403);
    }

    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("INVALID_INPUT", "مشخصات منبع معتبر نیست.", requestId, 400);

    const sourceId = await createSource({
      mediaId: context.activeMedia.id,
      actorUserId: context.user.id,
      correlationId: requestId,
      ...parsed.data,
    });
    const run = await enqueueSourceRun({
      mediaId: context.activeMedia.id,
      sourceId,
      actorUserId: context.user.id,
      correlationId: `${requestId}:initial`,
      trigger: "manual",
    });
    return apiSuccess({ sourceId, run }, requestId, 201);
  } catch (error) {
    if (error instanceof UnsafeSourceUrlError) return apiError("INVALID_INPUT", "آدرس منبع عمومی و امن نیست.", requestId, 400);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "23505") return apiError("INVALID_INPUT", "این منبع قبلاً ثبت شده است.", requestId, 409);
    console.error("create source endpoint failed", { requestId, error });
    return apiError("INTERNAL_ERROR", "ثبت منبع ناموفق بود.", requestId, 500);
  }
}
