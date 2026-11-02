import { and, desc, eq, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { media, mediaAdmin, membership, platformAdmin, platformCategory, sourceAccessRequest, user } from "@/db/schema";
import { apiError, apiSuccess, correlationId } from "@/src/api-response";
import { recordAuditEvent } from "@/src/server/audit";
import { auth } from "@/src/server/auth";
import { getDashboardContext } from "@/src/server/context";
import { enqueueSourceRun } from "@/src/server/crawl-jobs";
import { db } from "@/src/server/database";
import { getCodexSdkStatus } from "@/src/server/codex-status";
import { getInboxWorkspace } from "@/src/server/inbox";
import { mediaRoles } from "@/src/server/permissions";
import {
  createPlatformSource,
  enqueueCrawlerBuild,
  getCrawlRunLiveLog,
  getSourcesWorkspace,
  getPlatformSourcesWorkspace,
  getPlatformCrawlRunLiveLog,
  pausePlatformSource,
  resumePlatformSource,
  updatePlatformSourceSchedule,
  updatePlatformSourceVisibility,
  archivePlatformSource,
  restorePlatformSource,
  subscribeSource,
  unsubscribeSource,
} from "@/src/server/sources";
import { UnsafeSourceUrlError } from "@/src/server/url-safety";
import { articleListSchema, articlePreviewSchema, ArticleDeletionExpired, deletePlatformArticles, getPlatformArticle, getPlatformArticles, previewArticleDeletion } from "@/src/server/platform-articles";
import { EditorialError, editorialWorkspace, editorialDetail, createStoryInput, versionInput, decisionInput, createEditorialStory, saveEditorialVersion, decideEditorialVersion, storySourceInput, changeStorySources, editorialPolicyPreviewInput, previewEditorialPolicy } from "@/src/server/editorial";
import { getPlatformEditorialConfig, savePlatformEditorialConfig, platformConfigInput, managedSectionInput, updateSectionInput, createManagedSection, updateManagedSection, setSectionPaused, getSectionCandidates } from "@/src/server/editorial-settings";
import { createPlatformMediaAdmin, deletePlatformMediaAdmin, listPlatformMediaAdmins, PlatformMediaAdminError, updatePlatformMediaAdmin } from "@/src/server/platform-admins";
import { getMediaSetupPreferences, MediaSetupError, saveMediaSetupPreferences } from "@/src/server/media-setup";
import { removeSourceDraft, updateSourceDraft, setupIsComplete } from "@/src/server/media-source-drafts";
import { CategoryMappingError, categoryMappingWorkspace, categoryMappingSummary, categoryMappingHistory, saveCategoryMapping, mappingListInput, mappingUpdateInput } from "@/src/server/category-mappings";
import { sourceRequestKey } from "@media/contracts/media-setup";
import { InvalidMediaLogoError, resolveMediaLogo } from "@/src/server/media-logo";
import { generateLogoPreview, LogoGenerationError, logoRequestSchema } from "@/src/server/branding";
import { listPlatformSourceAccessRequests, PlatformSourceRequestError, reviewPlatformSourceAccessRequest } from "@/src/server/platform-source-requests";
import { editorialListInput } from "@/src/server/editorial-list";
import { enqueueEditorialJob, editorialQueue, changeEditorialJob, queueListInput } from "@/src/server/editorial-jobs";
import { authenticatedSiteRequest, publicSiteRequest } from "./site-router";
import { SiteError } from "./server/sites";
import { MediaRequestError, listMediaRequests, mediaRequestsInput, mediaReviewInput, reviewMediaRequest, mediaRequestStatus } from "./server/media-requests";
import { mediaOverview, grantedMediaSourceIds } from "./server/media-overview";
import { additionalCategoriesInput, requestAdditionalCategories, removeMediaSource } from "./server/media-source-management";

const idSchema = z.string().trim().min(1).max(128);
const createSourceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  url: z.url().max(2_048),
  scheduleMinutes: z.number().int().min(5).max(1_440).default(15),
  adapterKey: z.enum(["web", "rss"]).default("web"),
}).strict();
const selectMediaSchema = z.object({ mediaId: idSchema }).strict();
const subscriptionSchema = z.object({ sourceId: idSchema }).strict();
const scheduleSchema = z.object({ scheduleMinutes: z.number().int().min(5).max(1_440) }).strict();
const visibilitySchema = z.object({ mode: z.enum(["public", "catalog_hidden", "media_disabled"]) }).strict();
const createPlatformMediaAdminSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  initialPassword: z.string().min(12).max(128),
}).strict();
const updatePlatformMediaAdminSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  initialPassword: z.string().min(12).max(128).optional(),
}).strict();
const createMediaSchema = z.object({
  name: z.string().trim().min(2).max(120),
  logoMode: z.enum(["generated", "upload"]),
  logoData: z.string().max(1_500_000).optional(),
  editorialViewpoint: z.string().trim().min(10).max(2_000),
}).strict().superRefine((input, context) => {
  if (input.logoMode === "upload" && !input.logoData) context.addIssue({ code: "custom", path: ["logoData"], message: "فایل لوگو لازم است." });
  if (input.logoMode === "generated" && input.logoData) context.addIssue({ code: "custom", path: ["logoData"], message: "برای لوگوی تولیدشده فایل ارسال نمی‌شود." });
});
const mediaSetupPreferencesSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  editorialViewpoint: z.string().trim().min(10).max(2_000),
  sourceSelections: z.array(z.object({
    sourceId: idSchema,
    categoryMode: z.enum(["all", "selected"]),
    categories: z.array(z.string().trim().min(1).max(200)).max(100),
  }).strict()).max(200),
  socialPlatforms: z.array(z.enum(["bale", "telegram"])).max(2),
  setupCompleted: z.boolean(),
  setupStep: z.number().int().min(1).max(4).optional(),
}).strict();
const sourceAccessRequestInput = z.object({
  sourceType: z.enum(["website", "social"]),
  url: z.url().max(2_048).refine((value) => new URL(value).protocol === "https:", "آدرس باید HTTPS باشد."),
  categoryMode: z.enum(["all", "selected"]).optional(),
  categoryIds: z.array(idSchema).max(100).optional(),
}).strict().superRefine((value, context) => {
  if (value.sourceType === "website" && !value.categoryMode) context.addIssue({ code: "custom", path: ["categoryMode"], message: "انتخاب همهٔ دسته‌ها یا دسته‌های مشخص لازم است." });
  if (value.sourceType === "website" && value.categoryMode === "selected" && !value.categoryIds?.length) context.addIssue({ code: "custom", path: ["categoryIds"], message: "حداقل یک دسته انتخاب کنید." });
  if (value.sourceType === "website" && value.categoryMode === "all" && value.categoryIds?.length) context.addIssue({ code: "custom", path: ["categoryIds"], message: "برای دریافت همهٔ دسته‌ها، شناسهٔ دسته ارسال نکنید." });
  if (value.sourceType === "social" && (value.categoryMode || value.categoryIds?.length)) context.addIssue({ code: "custom", path: ["categoryMode"], message: "تنظیم دسته فقط برای وب‌سایت است." });
});
const createPlatformCategorySchema = z.object({ nameFa: z.string().trim().min(2).max(100), nameEn: z.string().trim().min(2).max(100), nameAr: z.string().trim().min(2).max(100) }).strict();
const updatePlatformCategorySchema = createPlatformCategorySchema.extend({ active: z.boolean() }).strict();

function can(role: keyof typeof mediaRoles, permission: Parameters<(typeof mediaRoles)[keyof typeof mediaRoles]["authorize"]>[0]) {
  return mediaRoles[role].authorize(permission).success;
}

async function authenticated(request: Request, requestId: string) {
  const context = await getDashboardContext(request.headers);
  if (!context) return { ok: false as const, response: apiError("UNAUTHENTICATED", "برای ادامه وارد حساب شوید.", requestId, 401) };
  return { ok: true as const, context };
}

async function platformSession(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  const [admin] = await db.select({ userId: platformAdmin.userId }).from(platformAdmin).where(eq(platformAdmin.userId, session.user.id)).limit(1);
  return admin ? session : null;
}

export async function handleApiRequest(request: Request): Promise<Response> {
  const requestId = correlationId(request);
  const { pathname } = new URL(request.url);

  try {
    const publicSite = await publicSiteRequest(request, requestId);
    if (publicSite) return publicSite;
    if (request.method === "GET" && pathname === "/health") {
      return apiSuccess({ status: "ok", service: "media-api" }, requestId);
    }

    if (request.method === "GET" && pathname === "/api/v1/context") {
      const context = await getDashboardContext(request.headers);
      return context
        ? apiSuccess(context, requestId)
        : apiError("UNAUTHENTICATED", "نشست معتبر یا رسانهٔ قابل دسترس پیدا نشد.", requestId, 401);
    }

    if (request.method === "GET" && pathname === "/api/v1/media/onboarding") {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return apiError("UNAUTHENTICATED", "برای ادامه وارد حساب شوید.", requestId, 401);
      const [admin] = await db.select({ userId: mediaAdmin.userId }).from(mediaAdmin).where(eq(mediaAdmin.userId, session.user.id)).limit(1);
      if (!admin) return apiSuccess({ canCreateMedia: false, name: session.user.name, hasMedia: false, impersonated: Boolean(session.session.impersonatedBy) }, requestId);
      const [mediaMembership] = await db.select({ id: membership.id }).from(membership).where(eq(membership.userId, session.user.id)).limit(1);
      return apiSuccess({ canCreateMedia: true, name: session.user.name, hasMedia: Boolean(mediaMembership), impersonated: Boolean(session.session.impersonatedBy) }, requestId);
    }

    if (request.method === "POST" && pathname === "/api/v1/media/logo-preview") {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return apiError("UNAUTHENTICATED", "برای ادامه وارد حساب شوید.", requestId, 401);
      const [admin] = await db.select({ userId: mediaAdmin.userId }).from(mediaAdmin).where(eq(mediaAdmin.userId, session.user.id)).limit(1);
      if (!admin) return apiError("FORBIDDEN", "طراحی لوگو فقط برای ادمین مجاز است.", requestId, 403);
      const parsed = logoRequestSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return apiError("INVALID_INPUT", "نام، توضیح سبک و رنگ‌های معتبر را برای طراحی لوگو وارد کنید.", requestId, 400);
      const preview = await generateLogoPreview(session.user.id, parsed.data, request.signal);
      await recordAuditEvent({ actorUserId: session.session.impersonatedBy ?? session.user.id, action: "media.logo.previewed", targetType: "logo_preview", correlationId: requestId });
      return apiSuccess(preview, requestId);
    }
    if (request.method === "POST" && pathname === "/api/v1/media") {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return apiError("UNAUTHENTICATED", "برای ادامه وارد حساب شوید.", requestId, 401);
      const [admin] = await db.select({ userId: mediaAdmin.userId }).from(mediaAdmin).where(eq(mediaAdmin.userId, session.user.id)).limit(1);
      if (!admin) return apiError("FORBIDDEN", "ساخت رسانه فقط برای ادمین مجاز است.", requestId, 403);
      const parsed = createMediaSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return apiError("INVALID_INPUT", "نام و دیدگاه رسانه و انتخاب روش ساخت لوگو لازم است.", requestId, 400);
      const mediaId = `media_${crypto.randomUUID()}`;
      const mediaName = parsed.data.name.trim();
      const mediaLogo = resolveMediaLogo(mediaName, parsed.data.logoMode, parsed.data.logoData);
      const mediaSlug = `media-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
      const createdAt = new Date();
      const actorUserId = session.session.impersonatedBy ?? session.user.id;
      await db.transaction(async (tx) => {
        await tx.insert(media).values({
          id: mediaId,
          name: mediaName,
          slug: mediaSlug,
          logo: mediaLogo,
          createdAt,
          metadata: JSON.stringify({ setupPreferences: { editorialViewpoint: parsed.data.editorialViewpoint.trim(), sourceSelections: [], socialPlatforms: [], setupCompleted: false } }),
        });
        await tx.insert(membership).values({ id: `membership_${crypto.randomUUID()}`, organizationId: mediaId, userId: session.user.id, role: "owner", createdAt });
        await recordAuditEvent({
          mediaId,
          actorUserId,
          action: "media.created",
          targetType: "media",
          targetId: mediaId,
          correlationId: requestId,
          metadata: { name: mediaName, performedAsUserId: actorUserId === session.user.id ? null : session.user.id },
        }, tx);
      });
      const authResponse = await auth.api.setActiveOrganization({ headers: request.headers, body: { organizationId: mediaId }, returnHeaders: true });
      const response = apiSuccess({ id: mediaId, name: mediaName }, requestId, 201);
      for (const cookie of authResponse.headers.getSetCookie()) response.headers.append("set-cookie", cookie);
      return response;
    }

    if (request.method === "GET" && pathname === "/api/v1/platform/context") {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return apiError("UNAUTHENTICATED", "برای ادامه وارد حساب شوید.", requestId, 401);
      const [admin] = await db.select({ id: platformAdmin.userId }).from(platformAdmin).where(eq(platformAdmin.userId, session.user.id)).limit(1);
      return apiSuccess({ user: { id: session.user.id, name: session.user.name, email: session.user.email, image: session.user.image }, isPlatformAdmin: Boolean(admin) }, requestId);
    }

    if (pathname === "/api/v1/platform/admins") {
      const session = await platformSession(request);
      if (!session) return apiError("FORBIDDEN", "این عملیات فقط برای سوپر ادمین مجاز است.", requestId, 403);
      if (request.method === "GET") return apiSuccess(await listPlatformMediaAdmins(), requestId);
      if (request.method === "POST") {
        const parsed = createPlatformMediaAdminSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return apiError("INVALID_INPUT", "نام، ایمیل و گذرواژهٔ اولیهٔ معتبر لازم است.", requestId, 400);
        return apiSuccess(await createPlatformMediaAdmin(parsed.data, session.user.id, requestId), requestId, 201);
      }
    }

    if (pathname === "/api/v1/platform/categories") {
      const session = await platformSession(request);
      if (!session) return apiError("FORBIDDEN", "این عملیات فقط برای سوپر ادمین مجاز است.", requestId, 403);
      if (request.method === "GET") return apiSuccess(await db.select().from(platformCategory).orderBy(platformCategory.sortOrder, platformCategory.nameFa), requestId);
      if (request.method === "POST") {
        const parsed = createPlatformCategorySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return apiError("INVALID_INPUT", "ترجمهٔ فارسی، انگلیسی و عربی دسته‌بندی را وارد کنید.", requestId, 400);
        const [created] = await db.insert(platformCategory).values({ id: `category_${randomUUID()}`, key: `category_${randomUUID()}`, ...parsed.data, sortOrder: Date.now() }).returning();
        await recordAuditEvent({ actorUserId: session.user.id, action: "platform.category.created", targetType: "platform_category", targetId: created.id, correlationId: requestId });
        return apiSuccess(created, requestId, 201);
      }
    }
    const platformCategoryMatch = pathname.match(/^\/api\/v1\/platform\/categories\/([^/]+)$/);
    if (platformCategoryMatch && request.method === "PATCH") {
      const session = await platformSession(request);
      if (!session) return apiError("FORBIDDEN", "این عملیات فقط برای سوپر ادمین مجاز است.", requestId, 403);
      const parsed = updatePlatformCategorySchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return apiError("INVALID_INPUT", "ترجمه‌های فارسی، انگلیسی و عربی و وضعیت دسته‌بندی معتبر نیست.", requestId, 400);
      const [updated] = await db.update(platformCategory).set({ ...parsed.data, updatedAt: new Date() }).where(eq(platformCategory.id, decodeURIComponent(platformCategoryMatch[1]))).returning();
      if (!updated) return apiError("NOT_FOUND", "دسته‌بندی پیدا نشد.", requestId, 404);
      await recordAuditEvent({ actorUserId: session.user.id, action: "platform.category.updated", targetType: "platform_category", targetId: updated.id, correlationId: requestId });
      return apiSuccess(updated, requestId);
    }

    if (pathname === "/api/v1/platform/media-requests" || pathname.startsWith("/api/v1/platform/media-requests/")) {
      const session = await platformSession(request);
      if (!session) return apiError("FORBIDDEN", "بررسی درخواست رسانه فقط برای سوپر ادمین مجاز است.", requestId, 403);
      if (request.method === "GET" && pathname === "/api/v1/platform/media-requests") {
        const parsed = mediaRequestsInput.safeParse(Object.fromEntries(new URL(request.url).searchParams));
        if (!parsed.success) return apiError("INVALID_INPUT", "فیلتر درخواست‌ها معتبر نیست.", requestId, 400);
        return apiSuccess(await listMediaRequests(parsed.data), requestId);
      }
      const match = pathname.match(/^\/api\/v1\/platform\/media-requests\/([^/]+)$/);
      if (request.method === "PATCH" && match) {
        const parsed = mediaReviewInput.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return apiError("INVALID_INPUT", "اقدام، نسخه و دلیل رد درخواست را بررسی کنید.", requestId, 400);
        return apiSuccess(await reviewMediaRequest(match[1], session.user.id, requestId, parsed.data), requestId);
      }
    }
    if (pathname === "/api/v1/platform/category-mappings" || pathname.startsWith("/api/v1/platform/category-mappings/")) {
      const session = await platformSession(request);
      if (!session) return apiError("FORBIDDEN", "معادل‌سازی دسته‌ها فقط برای سوپر ادمین مجاز است.", requestId, 403);
      if (request.method === "GET" && pathname === "/api/v1/platform/category-mappings/summary") return apiSuccess(await categoryMappingSummary(), requestId);
      if (request.method === "GET" && pathname === "/api/v1/platform/category-mappings") {
        const parsed = mappingListInput.safeParse(Object.fromEntries(new URL(request.url).searchParams));
        if (!parsed.success) return apiError("INVALID_INPUT", "فیلتر معادل‌سازی معتبر نیست.", requestId, 400);
        return apiSuccess(await categoryMappingWorkspace(parsed.data), requestId);
      }
      const match = pathname.match(/^\/api\/v1\/platform\/category-mappings\/([^/]+)(\/history)?$/);
      if (match && request.method === "GET" && match[2]) return apiSuccess(await categoryMappingHistory(match[1]), requestId);
      if (match && request.method === "PATCH" && !match[2]) {
        const parsed = mappingUpdateInput.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return apiError("INVALID_INPUT", "دستهٔ پلتفرم یا نام‌های دستهٔ جدید را کامل کنید.", requestId, 400);
        return apiSuccess(await saveCategoryMapping(match[1], session.user.id, requestId, parsed.data), requestId);
      }
    }
    if (pathname === "/api/v1/platform/source-access-requests") {
      const session = await platformSession(request);
      if (!session) return apiError("FORBIDDEN", "این عملیات فقط برای سوپر ادمین مجاز است.", requestId, 403);
      if (request.method === "GET") return apiSuccess(await listPlatformSourceAccessRequests(), requestId);
    }
    const sourceAccessReviewMatch = pathname.match(/^\/api\/v1\/platform\/source-access-requests\/([^/]+)$/);
    if (sourceAccessReviewMatch && request.method === "PATCH") {
      const session = await platformSession(request);
      if (!session) return apiError("FORBIDDEN", "این عملیات فقط برای سوپر ادمین مجاز است.", requestId, 403);
      const body = z.object({ action: z.enum(["reject", "grant_existing", "queue_crawler"]) }).strict().safeParse(await request.json().catch(() => null));
      if (!body.success) return apiError("INVALID_INPUT", "وضعیت بررسی معتبر نیست.", requestId, 400);
      try {
        const result = await reviewPlatformSourceAccessRequest({ requestId: decodeURIComponent(sourceAccessReviewMatch[1]), action: body.data.action, actorUserId: session.user.id, correlationId: requestId });
        return apiSuccess(result, requestId, body.data.action === "queue_crawler" ? 202 : 200);
      } catch (error) {
        if (error instanceof PlatformSourceRequestError) return apiError(error.status === 404 ? "NOT_FOUND" : error.status === 409 ? "CONFLICT" : "INVALID_INPUT", error.message, requestId, error.status);
        throw error;
      }
    }

    const platformAdminMatch = pathname.match(/^\/api\/v1\/platform\/admins\/([^/]+)$/);
    if (platformAdminMatch) {
      const session = await platformSession(request);
      if (!session) return apiError("FORBIDDEN", "این عملیات فقط برای سوپر ادمین مجاز است.", requestId, 403);
      const userId = decodeURIComponent(platformAdminMatch[1]);
      if (request.method === "PATCH") {
        const parsed = updatePlatformMediaAdminSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return apiError("INVALID_INPUT", "اطلاعات ویرایش ادمین معتبر نیست.", requestId, 400);
        return apiSuccess(await updatePlatformMediaAdmin(userId, parsed.data, session.user.id, requestId), requestId);
      }
      if (request.method === "DELETE") {
        await deletePlatformMediaAdmin(userId, session.user.id, requestId);
        return apiSuccess({ deleted: true }, requestId);
      }
    }

    const impersonateAdminMatch = pathname.match(/^\/api\/v1\/platform\/admins\/([^/]+)\/impersonate$/);
    if (request.method === "POST" && impersonateAdminMatch) {
      const session = await platformSession(request);
      if (!session) return apiError("FORBIDDEN", "این عملیات فقط برای سوپر ادمین مجاز است.", requestId, 403);
      const userId = decodeURIComponent(impersonateAdminMatch[1]);
      const adminResult = await db.select({ id: user.id }).from(mediaAdmin).innerJoin(user, eq(user.id, mediaAdmin.userId)).where(eq(mediaAdmin.userId, userId)).limit(1);
      if (!adminResult.length) return apiError("NOT_FOUND", "ادمین پیدا نشد.", requestId, 404);
      const response = await auth.api.impersonateUser({ headers: request.headers, body: { userId }, asResponse: true });
      if (response.ok) await recordAuditEvent({ actorUserId: session.user.id, action: "platform.media_admin.impersonated", targetType: "media_admin", targetId: userId, correlationId: requestId });
      return response;
    }

    if (request.method === "POST" && pathname === "/api/v1/platform/impersonation/stop") {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session?.session.impersonatedBy) return apiError("FORBIDDEN", "نشست ورود موقت فعال نیست.", requestId, 403);
      const [originalAdmin] = await db.select({ userId: platformAdmin.userId }).from(platformAdmin).where(eq(platformAdmin.userId, session.session.impersonatedBy)).limit(1);
      if (!originalAdmin) return apiError("FORBIDDEN", "نشست سوپر ادمین معتبر نیست.", requestId, 403);
      await recordAuditEvent({ actorUserId: session.session.impersonatedBy, action: "platform.media_admin.impersonation_stopped", targetType: "media_admin", targetId: session.user.id, correlationId: requestId });
      return auth.api.stopImpersonating({ headers: request.headers, asResponse: true });
    }

    if (request.method === "GET" && pathname === "/api/v1/platform/codex/status") {
      if (!await platformSession(request)) return apiError("FORBIDDEN", "این عملیات فقط برای مدیر پلتفرم مجاز است.", requestId, 403);
      return apiSuccess(await getCodexSdkStatus(), requestId);
    }

    if (request.method === "GET" && pathname === "/api/v1/platform/sources") {
      if (!await platformSession(request)) return apiError("FORBIDDEN", "این عملیات فقط برای مدیر پلتفرم مجاز است.", requestId, 403);
      return apiSuccess(await getPlatformSourcesWorkspace(), requestId);
    }

    const articleDetailMatch = pathname.match(/^\/api\/v1\/platform\/articles\/([^/]+)$/);
    if (articleDetailMatch && request.method === "GET") {
      if (!await platformSession(request)) return apiError("FORBIDDEN", "این عملیات فقط برای مدیر پلتفرم مجاز است.", requestId, 403);
      const parsed = idSchema.safeParse(decodeURIComponent(articleDetailMatch[1]));
      if (!parsed.success) return apiError("INVALID_INPUT", "شناسهٔ خبر معتبر نیست.", requestId, 400);
      const article = await getPlatformArticle(parsed.data);
      return article ? apiSuccess(article, requestId) : apiError("NOT_FOUND", "خبر پیدا نشد یا حذف شده است.", requestId, 404);
    }

    if (pathname === "/api/v1/platform/articles" && request.method === "GET") {
      if (!await platformSession(request)) return apiError("FORBIDDEN", "این عملیات فقط برای مدیر پلتفرم مجاز است.", requestId, 403);
      const params = new URL(request.url).searchParams;
      const parsed = articleListSchema.safeParse(Object.fromEntries(params));
      if (!parsed.success) return apiError("INVALID_INPUT", "فیلتر یا شمارهٔ صفحه معتبر نیست.", requestId, 400);
      return apiSuccess(await getPlatformArticles(parsed.data), requestId);
    }

    if (request.method === "POST" && ["/api/v1/platform/articles/delete-preview", "/api/v1/platform/articles/delete"].includes(pathname)) {
      const session = await platformSession(request);
      if (!session) return apiError("FORBIDDEN", "این عملیات فقط برای مدیر پلتفرم مجاز است.", requestId, 403);
      const body = await request.json().catch(() => null);
      if (pathname.endsWith("delete-preview")) {
        const parsed = articlePreviewSchema.safeParse(body);
        if (!parsed.success) return apiError("INVALID_INPUT", "محدودهٔ حذف معتبر نیست.", requestId, 400);
        return apiSuccess(await previewArticleDeletion(parsed.data, session.user.id), requestId);
      }
      const parsed = z.object({ token: z.string().min(1).max(4096), confirmed: z.literal(true) }).strict().safeParse(body);
      if (!parsed.success) return apiError("INVALID_INPUT", "پیش‌نمایش و تأیید حذف لازم است.", requestId, 400);
      try { return apiSuccess(await deletePlatformArticles(parsed.data.token, session.user.id, requestId), requestId); }
      catch (error) { if (error instanceof ArticleDeletionExpired) return apiError("INVALID_INPUT", "پیش‌نمایش حذف معتبر نیست یا منقضی شده؛ دوباره بررسی کنید.", requestId, 409); throw error; }
    }

    const platformEventsMatch = pathname.match(/^\/api\/v1\/platform\/crawl-runs\/([^/]+)\/events$/);
    if (request.method === "GET" && platformEventsMatch) {
      if (!await platformSession(request)) return apiError("FORBIDDEN", "این عملیات فقط برای مدیر پلتفرم مجاز است.", requestId, 403);
      const parsed = idSchema.safeParse(decodeURIComponent(platformEventsMatch[1]));
      if (!parsed.success) return apiError("INVALID_INPUT", "شناسهٔ اجرا معتبر نیست.", requestId, 400);
      const log = await getPlatformCrawlRunLiveLog(parsed.data);
      return log ? apiSuccess(log, requestId) : apiError("NOT_FOUND", "اجرا پیدا نشد.", requestId, 404);
    }

    if (request.method === "POST" && pathname === "/api/v1/media/select") {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return apiError("UNAUTHENTICATED", "برای ادامه وارد حساب شوید.", requestId, 401);
      const parsed = selectMediaSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return apiError("INVALID_INPUT", "رسانهٔ انتخاب‌شده معتبر نیست.", requestId, 400);
      const [allowed] = await db.select({ id: membership.id, role: membership.role }).from(membership)
        .where(and(eq(membership.userId, session.user.id), eq(membership.organizationId, parsed.data.mediaId))).limit(1);
      if (!allowed) return apiError("FORBIDDEN", "به این رسانه دسترسی ندارید.", requestId, 403);
      const authResponse = await auth.api.setActiveOrganization({
        headers: request.headers,
        body: { organizationId: parsed.data.mediaId },
        returnHeaders: true,
      });
      await recordAuditEvent({
        mediaId: parsed.data.mediaId,
        actorUserId: session.user.id,
        action: "media.active.changed",
        targetType: "media",
        targetId: parsed.data.mediaId,
        correlationId: requestId,
        metadata: { role: allowed.role },
      });
      const response = apiSuccess({ activeMediaId: parsed.data.mediaId }, requestId);
      const setCookie = authResponse.headers.get("set-cookie");
      if (setCookie) response.headers.set("set-cookie", setCookie);
      return response;
    }

    if (request.method === "POST" && pathname === "/api/v1/platform/sources") {
      const session = await platformSession(request);
      if (!session) return apiError("FORBIDDEN", "این عملیات فقط برای مدیر پلتفرم مجاز است.", requestId, 403);
      const parsed = createSourceSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return apiError("INVALID_INPUT", "مشخصات منبع معتبر نیست.", requestId, 400);
      const result = await createPlatformSource({ actorUserId: session.user.id, correlationId: requestId, ...parsed.data });
      return apiSuccess(result, requestId, 202);
    }

    const buildMatch = pathname.match(/^\/api\/v1\/platform\/sources\/([^/]+)\/(build|debug)$/);
    if (request.method === "POST" && buildMatch) {
      const session = await platformSession(request);
      if (!session) return apiError("FORBIDDEN", "این عملیات فقط برای مدیر پلتفرم مجاز است.", requestId, 403);
      const id = idSchema.safeParse(decodeURIComponent(buildMatch[1]));
      if (!id.success) return apiError("INVALID_INPUT", "شناسهٔ منبع معتبر نیست.", requestId, 400);
      const result = await enqueueCrawlerBuild({ sourceId: id.data, actorUserId: session.user.id, correlationId: requestId, mode: buildMatch[2] as "build" | "debug" });
      if (result && "errorCode" in result) return apiError("INVALID_INPUT", "دیباگ با Codex برای کراولر وب در دسترس است؛ RSS را با ساخت و آزمون مجدد بررسی کنید.", requestId, 409);
      return result ? apiSuccess(result, requestId, 202) : apiError("NOT_FOUND", "منبع پیدا نشد.", requestId, 404);
    }

    const platformLifecycleMatch = pathname.match(/^\/api\/v1\/platform\/sources\/([^/]+)(?:\/(visibility|restore))?$/);
    if (platformLifecycleMatch && ((request.method === "DELETE" && !platformLifecycleMatch[2]) || (request.method === "PATCH" && platformLifecycleMatch[2] === "visibility") || (request.method === "POST" && platformLifecycleMatch[2] === "restore"))) {
      const session = await platformSession(request);
      if (!session) return apiError("FORBIDDEN", "این عملیات فقط برای مدیر پلتفرم مجاز است.", requestId, 403);
      const id = idSchema.safeParse(decodeURIComponent(platformLifecycleMatch[1]));
      if (!id.success) return apiError("INVALID_INPUT", "شناسهٔ منبع معتبر نیست.", requestId, 400);
      const input = { sourceId: id.data, actorUserId: session.user.id, correlationId: requestId };
      let result;
      if (platformLifecycleMatch[2] === "visibility") {
        const parsed = visibilitySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return apiError("INVALID_INPUT", "حالت نمایش معتبر نیست.", requestId, 400);
        result = await updatePlatformSourceVisibility({ ...input, mode: parsed.data.mode });
      } else result = platformLifecycleMatch[2] === "restore" ? await restorePlatformSource(input) : await archivePlatformSource(input);
      return result ? apiSuccess(result, requestId) : apiError("NOT_FOUND", "منبع پیدا نشد یا وضعیت آن با عملیات سازگار نیست.", requestId, 404);
    }

    const platformScheduleMatch = pathname.match(/^\/api\/v1\/platform\/sources\/([^/]+)\/schedule$/);
    if (request.method === "PATCH" && platformScheduleMatch) {
      const session = await platformSession(request);
      if (!session) return apiError("FORBIDDEN", "این عملیات فقط برای مدیر پلتفرم مجاز است.", requestId, 403);
      const id = idSchema.safeParse(decodeURIComponent(platformScheduleMatch[1]));
      const parsed = scheduleSchema.safeParse(await request.json().catch(() => null));
      if (!id.success || !parsed.success) return apiError("INVALID_INPUT", "فاصلهٔ دریافت باید عدد صحیح بین ۵ و ۱۴۴۰ دقیقه باشد.", requestId, 400);
      const result = await updatePlatformSourceSchedule({ sourceId: id.data, scheduleMinutes: parsed.data.scheduleMinutes, actorUserId: session.user.id, correlationId: requestId });
      return result ? apiSuccess(result, requestId) : apiError("NOT_FOUND", "منبع پیدا نشد.", requestId, 404);
    }

    const platformSourceMatch = pathname.match(/^\/api\/v1\/platform\/sources\/([^/]+)\/(run|stop|resume)$/);
    if (request.method === "POST" && platformSourceMatch) {
      const session = await platformSession(request);
      if (!session) return apiError("FORBIDDEN", "این عملیات فقط برای مدیر پلتفرم مجاز است.", requestId, 403);
      const parsed = idSchema.safeParse(decodeURIComponent(platformSourceMatch[1]));
      if (!parsed.success) return apiError("INVALID_INPUT", "شناسهٔ منبع معتبر نیست.", requestId, 400);
      const action = platformSourceMatch[2];
      const result = action === "run"
        ? await enqueueSourceRun({ sourceId: parsed.data, actorUserId: session.user.id, correlationId: requestId, trigger: "manual" })
        : action === "stop"
          ? await pausePlatformSource({ sourceId: parsed.data, actorUserId: session.user.id, correlationId: requestId })
          : await resumePlatformSource({ sourceId: parsed.data, actorUserId: session.user.id, correlationId: requestId });
      return result ? apiSuccess(result, requestId, action === "run" ? 202 : 200) : apiError("NOT_FOUND", "منبع پیدا نشد.", requestId, 404);
    }

    if (pathname === "/api/v1/platform/editorial-config") {
      const session = await platformSession(request);
      if (!session) return apiError("FORBIDDEN", "تنظیمات پایه فقط برای ادمین پلتفرم مجاز است.", requestId, 403);
      if (request.method === "GET") return apiSuccess(await getPlatformEditorialConfig(), requestId);
      if (request.method === "POST") {
        const parsed = platformConfigInput.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return apiError("INVALID_INPUT", "تنظیمات پایه یا تعریف جناح‌ها معتبر نیست.", requestId, 400);
        return apiSuccess(await savePlatformEditorialConfig(session.user.id, requestId, parsed.data), requestId, 201);
      }
    }
    if (pathname === "/api/v1/media/source-categories" && request.method === "GET") {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return apiError("UNAUTHENTICATED", "برای ادامه وارد حساب شوید.", requestId, 401);
      const [admin] = await db.select({ userId: mediaAdmin.userId }).from(mediaAdmin).where(eq(mediaAdmin.userId, session.user.id)).limit(1);
      const categoryContext = admin ? null : await getDashboardContext(request.headers);
      if (!admin && (!categoryContext || !can(categoryContext.activeMedia.role, { source: ["read"] }))) return apiError("FORBIDDEN", "اجازهٔ مشاهدهٔ دسته‌بندی‌ها را ندارید.", requestId, 403);
      return apiSuccess(await db.select().from(platformCategory).where(eq(platformCategory.active, true)).orderBy(platformCategory.sortOrder, platformCategory.nameFa), requestId);
    }
    const authResult = await authenticated(request, requestId);
    if (!authResult.ok) return authResult.response;
    const { context } = authResult;
    if (pathname === "/api/v1/media/request" && request.method === "GET") return apiSuccess(await mediaRequestStatus(context.activeMedia.id), requestId);
    const mediaSourceAction = pathname.match(/^\/api\/v1\/media\/sources\/([^/]+)(\/categories)?$/);
    if (mediaSourceAction && request.method === "DELETE" && !mediaSourceAction[2]) {
      if (!can(context.activeMedia.role, { source: ["delete"] })) return apiError("FORBIDDEN", "اجازهٔ حذف منبع را ندارید.", requestId, 403);
      return apiSuccess(await removeMediaSource(context.activeMedia.id, mediaSourceAction[1], context.user.id, requestId), requestId);
    }
    if (mediaSourceAction && request.method === "POST" && mediaSourceAction[2]) {
      if (!can(context.activeMedia.role, { source: ["create"] })) return apiError("FORBIDDEN", "اجازهٔ درخواست دسته‌بندی را ندارید.", requestId, 403);
      const parsed = additionalCategoriesInput.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return apiError("INVALID_INPUT", "دسته‌های جدید را از کاتالوگ انتخاب کنید.", requestId, 400);
      return apiSuccess(await requestAdditionalCategories(context.activeMedia.id, mediaSourceAction[1], context.user.id, requestId, parsed.data.categoryIds), requestId, 201);
    }
    if (pathname === "/api/v1/media/overview" && request.method === "GET") {
      if (!can(context.activeMedia.role, { source: ["read"], destination: ["read"] })) return apiError("FORBIDDEN", "به وضعیت رسانه دسترسی ندارید.", requestId, 403);
      return apiSuccess(await mediaOverview(context.activeMedia.id), requestId);
    }
    if (pathname === "/api/v1/media/setup") {
      if (!can(context.activeMedia.role, { source: ["read"], destination: ["read"] })) return apiError("FORBIDDEN", "اجازهٔ تنظیم رسانه را ندارید.", requestId, 403);
      if (request.method === "GET") return apiSuccess(await getMediaSetupPreferences(context.activeMedia.id), requestId);
      if (request.method === "PATCH") {
        const parsed = mediaSetupPreferencesSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return apiError("INVALID_INPUT", "نام رسانه، انتخاب منابع، دسته‌بندی‌ها یا بات‌ها معتبر نیست.", requestId, 400);
        if (parsed.data.name !== undefined && !can(context.activeMedia.role, { organization: ["update"] })) return apiError("FORBIDDEN", "اجازهٔ تغییر نام رسانه را ندارید.", requestId, 403);
        const { name, ...preferences } = parsed.data;
        try {
          return apiSuccess(await saveMediaSetupPreferences(context.activeMedia.id, context.user.id, requestId, preferences, name), requestId);
        } catch (error) {
          if (error instanceof MediaSetupError) return apiError(error.status === 404 ? "NOT_FOUND" : "INVALID_INPUT", error.message, requestId, error.status);
          throw error;
        }
      }
    }
    if (pathname === "/api/v1/media/source-access-requests" && request.method === "GET") {
      if (!can(context.activeMedia.role, { source: ["read"] })) return apiError("FORBIDDEN", "اجازهٔ مشاهدهٔ درخواست‌های منبع را ندارید.", requestId, 403);
      const preferences = await getMediaSetupPreferences(context.activeMedia.id);
      const requests = await db.select({ id: sourceAccessRequest.id, sourceType: sourceAccessRequest.sourceType, url: sourceAccessRequest.url, categoryMode: sourceAccessRequest.categoryMode, categoryIds: sourceAccessRequest.categoryIds, sourceId: sourceAccessRequest.sourceId, status: sourceAccessRequest.status, createdAt: sourceAccessRequest.createdAt }).from(sourceAccessRequest).where(and(eq(sourceAccessRequest.mediaId, context.activeMedia.id), eq(sourceAccessRequest.kind, "source_access"), ne(sourceAccessRequest.status, "withdrawn"))).orderBy(desc(sourceAccessRequest.createdAt));
      return apiSuccess(requests.map(row => !preferences.setupCompleted && row.status === "pending" ? { ...row, status: "draft" } : row), requestId);
    }
    const sourceDraftMatch = pathname.match(/^\/api\/v1\/media\/source-access-requests\/([^/]+)$/);
    if (sourceDraftMatch && request.method === "PATCH") {
      if (!can(context.activeMedia.role, { source: ["update"] })) return apiError("FORBIDDEN", "اجازهٔ ویرایش پیش‌نویس منبع را ندارید.", requestId, 403);
      const parsed = sourceAccessRequestInput.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return apiError("INVALID_INPUT", "لینک، نوع منبع و دسته‌بندی‌های معتبر را انتخاب کنید.", requestId, 400);
      return apiSuccess(await updateSourceDraft(context.activeMedia.id, sourceDraftMatch[1], context.user.id, requestId, parsed.data), requestId);
    }
    if (sourceDraftMatch && request.method === "DELETE") {
      if (!can(context.activeMedia.role, { source: ["delete"] })) return apiError("FORBIDDEN", "اجازهٔ حذف پیش‌نویس منبع را ندارید.", requestId, 403);
      return apiSuccess(await removeSourceDraft(context.activeMedia.id, sourceDraftMatch[1], context.user.id, requestId), requestId);
    }
    if (pathname === "/api/v1/media/source-access-requests" && request.method === "POST") {
      if (!can(context.activeMedia.role, { source: ["create"] })) return apiError("FORBIDDEN", "اجازهٔ درخواست منبع را ندارید.", requestId, 403);
      const parsed = sourceAccessRequestInput.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return apiError("INVALID_INPUT", "نوع و لینک معتبر منبع لازم است.", requestId, 400);
      const categoryIds = parsed.data.categoryIds ?? [];
      if (parsed.data.sourceType === "website" && parsed.data.categoryMode === "selected") {
        const validCategories = await db.select({ id: platformCategory.id }).from(platformCategory).where(eq(platformCategory.active, true));
        if (categoryIds.some((id) => !validCategories.some((category) => category.id === id))) return apiError("INVALID_INPUT", "یکی از دسته‌بندی‌های انتخاب‌شده دیگر فعال نیست.", requestId, 400);
      }
      const normalizedUrl = new URL(parsed.data.url).toString();
      const created = await db.transaction(async tx => {
        const [owner] = await tx.select({ metadata: media.metadata }).from(media).where(eq(media.id, context.activeMedia.id)).for("update");
        if (!owner) throw new MediaSetupError("رسانه پیدا نشد.", 404);
        const existing = await tx.select({ url: sourceAccessRequest.url }).from(sourceAccessRequest).where(and(eq(sourceAccessRequest.mediaId, context.activeMedia.id), ne(sourceAccessRequest.status, "withdrawn")));
        if (existing.some(row => sourceRequestKey(row.url) === sourceRequestKey(normalizedUrl))) throw new MediaSetupError("این منبع را قبلاً به همین رسانه اضافه کرده‌اید؛ ثبت تکراری ممکن نیست.", 409);
        const status = setupIsComplete(owner.metadata) ? "pending" : "draft";
        const [row] = await tx.insert(sourceAccessRequest).values({ id: `sar_${randomUUID()}`, mediaId: context.activeMedia.id, requestedBy: context.user.id, status, sourceType: parsed.data.sourceType, platform: null, categoryMode: parsed.data.categoryMode ?? null, categoryIds, name: new URL(normalizedUrl).hostname, url: normalizedUrl }).returning();
        await recordAuditEvent({ mediaId: context.activeMedia.id, actorUserId: context.user.id, action: status === "draft" ? "source_access_request.draft_saved" : "source_access_request.created", targetType: "source_access_request", targetId: row.id, correlationId: requestId }, tx);
        return row;
      });
      return apiSuccess(created, requestId, 201);
    }
    const siteResponse = await authenticatedSiteRequest(request, requestId, context);
    if (siteResponse) return siteResponse;

    if (pathname === "/api/v1/editorial/jobs") {
      if (request.method === "GET") {
        if (!can(context.activeMedia.role, { story: ["read"] })) return apiError("FORBIDDEN", "به صف دسترسی ندارید.", requestId, 403);
        const parsed = queueListInput.safeParse(Object.fromEntries(new URL(request.url).searchParams));
        if (!parsed.success) return apiError("INVALID_INPUT", "صفحه یا وضعیت صف معتبر نیست.", requestId, 400);
        return apiSuccess(await editorialQueue(context.activeMedia.id, parsed.data), requestId);
      }
      if (request.method === "POST") {
        if (!can(context.activeMedia.role, { story: ["create"] })) return apiError("FORBIDDEN", "مجوز تحریر خبر را ندارید.", requestId, 403);
        const parsed = createStoryInput.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return apiError("INVALID_INPUT", "خبر و سرویس را انتخاب کنید.", requestId, 400);
        return apiSuccess(await enqueueEditorialJob({ mediaId: context.activeMedia.id, actorUserId: context.user.id, correlationId: requestId }, parsed.data.sectionId, parsed.data.rawArticleId), requestId, 202);
      }
    }
    if (pathname === "/api/v1/editorial/policy-preview" && request.method === "POST") {
      if (!can(context.activeMedia.role, { story: ["create"] })) return apiError("FORBIDDEN", "مجوز پیش‌نمایش تحریریه را ندارید.", requestId, 403);
      const parsed = editorialPolicyPreviewInput.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return apiError("INVALID_INPUT", "تنظیمات سیاست یا متن نمونه معتبر نیست.", requestId, 400);
      return apiSuccess(await previewEditorialPolicy({ mediaId: context.activeMedia.id, actorUserId: context.user.id, correlationId: requestId }, parsed.data, request.signal), requestId);
    }
    const jobMatch = pathname.match(/^\/api\/v1\/editorial\/jobs\/([^/]+)\/(cancel|retry)$/);
    if (request.method === "POST" && jobMatch) {
      if (!["owner", "admin", "editor"].includes(context.activeMedia.role)) return apiError("FORBIDDEN", "مدیریت صف فقط برای سردبیر و مدیر مجاز است.", requestId, 403);
      return apiSuccess(await changeEditorialJob({ mediaId: context.activeMedia.id, actorUserId: context.user.id, correlationId: requestId }, jobMatch[1], jobMatch[2] as "cancel" | "retry"), requestId);
    }

    if (pathname === "/api/v1/editorial/policies" && request.method === "POST") return apiError("FORBIDDEN", "سیاست پایه در پنل ادمین پلتفرم تنظیم می‌شود؛ جهت نگارش را در سرویس انتخاب کنید.", requestId, 403);
    const pauseMatch = pathname.match(/^\/api\/v1\/editorial\/sections\/([^/]+)\/(stop|resume)$/);
    if (request.method === "POST" && pauseMatch) {
      if (!["owner", "admin", "editor"].includes(context.activeMedia.role)) return apiError("FORBIDDEN", "توقف سرویس فقط برای سردبیر و مدیر مجاز است.", requestId, 403);
      const parsed = z.object({ expectedRevision: z.number().int().min(1) }).strict().safeParse(await request.json().catch(() => null));
      if (!parsed.success) return apiError("INVALID_INPUT", "نسخهٔ سرویس معتبر نیست.", requestId, 400);
      return apiSuccess(await setSectionPaused({ mediaId: context.activeMedia.id, actorUserId: context.user.id, correlationId: requestId }, pauseMatch[1], parsed.data.expectedRevision, pauseMatch[2] === "stop"), requestId);
    }
    const sectionMatch = pathname.match(/^\/api\/v1\/editorial\/sections(?:\/([^/]+))?(?:\/(articles))?$/);
    if (sectionMatch) {
      const [, sectionId, action] = sectionMatch;
      const actor = { mediaId: context.activeMedia.id, actorUserId: context.user.id, correlationId: requestId };
      if (request.method === "GET" && sectionId && action === "articles") {
        if (!can(context.activeMedia.role, { story: ["read"] })) return apiError("FORBIDDEN", "به تحریریه دسترسی ندارید.", requestId, 403);
        return apiSuccess(await getSectionCandidates(actor.mediaId, sectionId), requestId);
      }
      if ((request.method === "POST" && !sectionId) || (request.method === "PATCH" && sectionId && !action)) {
        if (!["owner", "admin", "editor"].includes(context.activeMedia.role)) return apiError("FORBIDDEN", "مدیریت سرویس برای سردبیر یا مدیر رسانه مجاز است.", requestId, 403);
        const body = await request.json().catch(() => null);
        if (sectionId) {
          const parsed = updateSectionInput.safeParse(body);
          if (!parsed.success) return apiError("INVALID_INPUT", "تنظیمات سرویس معتبر نیست.", requestId, 400);
          return apiSuccess(await updateManagedSection(actor, sectionId, parsed.data), requestId);
        }
        const parsed = managedSectionInput.safeParse(body);
        if (!parsed.success) return apiError("INVALID_INPUT", "نام و تنظیمات سرویس معتبر نیست.", requestId, 400);
        return apiSuccess(await createManagedSection(actor, parsed.data), requestId, 201);
      }
    }

    if (pathname === "/api/v1/editorial" && request.method === "GET") {
      if (!can(context.activeMedia.role, { story: ["read"] })) return apiError("FORBIDDEN", "به تحریریه دسترسی ندارید.", requestId, 403);
      const search = new URL(request.url).searchParams; const view = search.get("view");
      const params = Object.fromEntries(search); delete params.view;
      const parsed = editorialListInput.safeParse(params);
      if (!parsed.success || (view && view !== "ready")) return apiError("INVALID_INPUT", "فیلتر یا صفحه معتبر نیست.", requestId, 400);
      return apiSuccess(await editorialWorkspace(context.activeMedia.id, view === "ready", parsed.data), requestId);
    }
    const storySourceMatch = pathname.match(/^\/api\/v1\/editorial\/stories\/([^/]+)\/sources$/);
    if (storySourceMatch && request.method === "POST") {
      if (!can(context.activeMedia.role, { story: ["update"] })) return apiError("FORBIDDEN", "مجوز ویرایش منابع را ندارید.", requestId, 403);
      const parsed = storySourceInput.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return apiError("INVALID_INPUT", "منبع و نسخهٔ مورد انتظار را مشخص کنید.", requestId, 400);
      return apiSuccess(await changeStorySources({ mediaId: context.activeMedia.id, actorUserId: context.user.id, correlationId: requestId }, storySourceMatch[1], parsed.data), requestId, 201);
    }
    const editorialMatch = pathname.match(/^\/api\/v1\/editorial\/(stories|sections|policies)(?:\/([^/]+))?(?:\/(versions|decisions))?$/);
    if (editorialMatch) {
      const [, kind, storyId, action] = editorialMatch;
      if (request.method === "GET" && kind === "stories" && storyId && !action) {
        if (!can(context.activeMedia.role, { story: ["read"] })) return apiError("FORBIDDEN", "به تحریریه دسترسی ندارید.", requestId, 403);
        return apiSuccess(await editorialDetail(context.activeMedia.id, storyId), requestId);
      }
      if (request.method === "POST") {
        const actor = { mediaId: context.activeMedia.id, actorUserId: context.user.id, correlationId: requestId };
        if (kind === "stories" && ((!storyId && !action) || (storyId && action))) {
          const permission = action === "decisions" ? "approve" : action === "versions" ? "update" : "create";
          if (!can(context.activeMedia.role, { story: [permission] })) return apiError("FORBIDDEN", "مجوز این عملیات تحریریه را ندارید.", requestId, 403);
          const body = await request.json().catch(() => null);
          if (!storyId) {
            const parsed = createStoryInput.safeParse(body);
            if (!parsed.success) return apiError("INVALID_INPUT", "خبر و سرویس را انتخاب کنید.", requestId, 400);
            return apiSuccess(await createEditorialStory(actor, parsed.data), requestId, 201);
          }
          if (action === "versions") {
            const parsed = versionInput.safeParse(body);
            if (!parsed.success) return apiError("INVALID_INPUT", "عنوان، سرویس و متن کامل (حداقل ۸۰ نویسه) لازم است.", requestId, 400);
            return apiSuccess(await saveEditorialVersion(actor, storyId, parsed.data), requestId, 201);
          }
          const parsed = decisionInput.safeParse(body);
          if (!parsed.success) return apiError("INVALID_INPUT", "برای رد یا درخواست اصلاح، توضیح لازم است.", requestId, 400);
          return apiSuccess(await decideEditorialVersion(actor, storyId, parsed.data), requestId);
        }
      }
    }

    if (request.method === "GET" && pathname === "/api/v1/articles") {
      if (!can(context.activeMedia.role, { source: ["read"] })) return apiError("FORBIDDEN", "به اخبار ورودی این رسانه دسترسی ندارید.", requestId, 403);
      const allowed = context.isPlatformAdmin ? undefined : await grantedMediaSourceIds(context.activeMedia.id);
      if (allowed && !allowed.length) return apiError("FORBIDDEN", "اخبار ورودی پس از تأیید رسانه و دسترسی به حداقل یک منبع فعال می‌شود.", requestId, 403);
      return apiSuccess(await getInboxWorkspace(context.activeMedia.id, allowed), requestId);
    }

    if (pathname === "/api/v1/sources") {
      if (request.method === "GET") {
        if (!can(context.activeMedia.role, { source: ["read"] })) return apiError("FORBIDDEN", "به منابع این رسانه دسترسی ندارید.", requestId, 403);
        return apiSuccess(await getSourcesWorkspace(context.activeMedia.id), requestId);
      }
      if (request.method === "POST") {
        if (!can(context.activeMedia.role, { source: ["create"] })) return apiError("FORBIDDEN", "اجازهٔ افزودن منبع را ندارید.", requestId, 403);
        const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return apiError("INVALID_INPUT", "منبع انتخاب‌شده معتبر نیست.", requestId, 400);
        const result = await subscribeSource({ mediaId: context.activeMedia.id, sourceId: parsed.data.sourceId, actorUserId: context.user.id, correlationId: requestId });
        return result ? apiSuccess(result, requestId, 201) : apiError("NOT_FOUND", "منبع فعال در کاتالوگ پیدا نشد.", requestId, 404);
      }
    }

    const eventsMatch = pathname.match(/^\/api\/v1\/crawl-runs\/([^/]+)\/events$/);
    if (request.method === "GET" && eventsMatch) {
      if (!can(context.activeMedia.role, { source: ["read"] })) return apiError("FORBIDDEN", "به گزارش اجرای منابع دسترسی ندارید.", requestId, 403);
      const parsed = idSchema.safeParse(decodeURIComponent(eventsMatch[1]));
      if (!parsed.success) return apiError("INVALID_INPUT", "شناسهٔ اجرا معتبر نیست.", requestId, 400);
      const log = await getCrawlRunLiveLog(context.activeMedia.id, parsed.data);
      return log ? apiSuccess(log, requestId) : apiError("NOT_FOUND", "اجرای موردنظر پیدا نشد.", requestId, 404);
    }

    const sourceMatch = pathname.match(/^\/api\/v1\/sources\/([^/]+)(?:\/(run|stop|resume))?$/);
    if (sourceMatch) {
      const parsed = idSchema.safeParse(decodeURIComponent(sourceMatch[1]));
      if (!parsed.success) return apiError("INVALID_INPUT", "شناسهٔ منبع معتبر نیست.", requestId, 400);
      const sourceId = parsed.data;
      const action = sourceMatch[2];
      if (request.method === "DELETE" && !action) {
        if (!can(context.activeMedia.role, { source: ["delete"] })) return apiError("FORBIDDEN", "اجازهٔ حذف این منبع را ندارید.", requestId, 403);
        const result = await unsubscribeSource({ mediaId: context.activeMedia.id, sourceId, actorUserId: context.user.id, correlationId: requestId });
        return result ? apiSuccess(result, requestId) : apiError("NOT_FOUND", "منبع پیدا نشد.", requestId, 404);
      }
    }

    return apiError("NOT_FOUND", "مسیر API پیدا نشد.", requestId, 404);
  } catch (error) {
    if (error instanceof MediaRequestError) return apiError(error.status === 403 ? "FORBIDDEN" : error.status === 404 ? "NOT_FOUND" : "CONFLICT", error.message, requestId, error.status);
    if (error instanceof CategoryMappingError) return apiError(error.status === 404 ? "NOT_FOUND" : error.status === 400 ? "INVALID_INPUT" : "CONFLICT", error.message, requestId, error.status);
    if (error instanceof MediaSetupError) return apiError(error.status === 404 ? "NOT_FOUND" : "INVALID_INPUT", error.message, requestId, error.status);
    if (error instanceof LogoGenerationError) return apiError("INTERNAL_ERROR", error.message, requestId, error.status);
    if (error instanceof InvalidMediaLogoError) return apiError("INVALID_INPUT", error.message, requestId, 400);
    if (error instanceof PlatformMediaAdminError) return apiError(error.status === 404 ? "NOT_FOUND" : "INVALID_INPUT", error.message, requestId, error.status);
    if (error instanceof SiteError) return apiError(error.status === 404 ? "NOT_FOUND" : "INVALID_INPUT", error.message, requestId, error.status);
    if (error instanceof EditorialError) return apiError(error.status === 404 ? "NOT_FOUND" : "INVALID_INPUT", error.message, requestId, error.status);
    if (error instanceof UnsafeSourceUrlError) return apiError("INVALID_INPUT", "آدرس منبع عمومی و امن نیست.", requestId, 400);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "23505") return apiError("INVALID_INPUT", "این رکورد قبلاً ثبت شده است.", requestId, 409);
    console.error("api request failed", { requestId, pathname, error: error instanceof Error ? error.message : "unknown" });
    return apiError("INTERNAL_ERROR", "انجام درخواست ناموفق بود.", requestId, 500);
  }
}

