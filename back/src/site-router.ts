import { apiError, apiSuccess } from "./api-response";
import type { DashboardContext } from "../contracts/src/context";
import { mediaRoles } from "./server/permissions";
import { changeSite, saveSite, siteActionInput, siteInput, sitePage, sitePageInput, sitesWorkspace, siteUpdateInput, siteSitemap } from "./server/sites";
import { changeWebPublication, enqueueWebPublication, publicationInput, publicationListInput, publicationRescheduleInput, publicationWorkspace } from "./server/web-publications";
import { distributionWorkspace, previewRule, ruleInput, ruleWorkspace, saveRule, withdrawArticle } from "./server/publication-rules";

export async function publicSiteRequest(request: Request, requestId: string): Promise<Response | null> {
  const url = new URL(request.url);
  const sitemap = url.pathname.match(/^\/api\/v1\/public\/sites\/([a-z0-9-]+)\/sitemap$/);
  if (sitemap && request.method === "GET") return apiSuccess(await siteSitemap(sitemap[1]), requestId);
  const match = url.pathname.match(/^\/api\/v1\/public\/sites\/([a-z0-9-]+)(?:\/stories\/([^/]+))?$/);
  if (!match || request.method !== "GET") return null;
  const parsed = sitePageInput.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return apiError("INVALID_INPUT", "فیلتر سایت معتبر نیست.", requestId, 400);
  return apiSuccess(await sitePage({ slug: match[1], storyId: match[2], ...parsed.data }), requestId);
}

export async function authenticatedSiteRequest(request: Request, requestId: string, context: DashboardContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (!/^\/api\/v1\/(sites|publications|publication-rules)(\/|$)/.test(url.pathname)) return null;
  const actor = { mediaId: context.activeMedia.id, actorUserId: context.user.id, correlationId: requestId };
  const permissions = mediaRoles[context.activeMedia.role];
  const forbidden = () => apiError("FORBIDDEN", "مجوز این عملیات سایت یا انتشار را ندارید.", requestId, 403);
  const invalid = () => apiError("INVALID_INPUT", "تنظیمات، زمان یا نسخهٔ ارسالی معتبر نیست.", requestId, 400);
  const distribution = url.pathname.match(/^\/api\/v1\/publications\/distribution\/([^/]+)$/);
  if (distribution && request.method === "GET") {
    if (!permissions.authorize({ publication: ["read"] }).success) return forbidden();
    return apiSuccess(await distributionWorkspace(actor.mediaId, distribution[1]), requestId);
  }
  const rule = url.pathname.match(/^\/api\/v1\/publication-rules(?:\/([^/]+))?$/);
  if (rule) {
    if (request.method === "GET" && !rule[1]) {
      if (!permissions.authorize({ publication: ["read"] }).success) return forbidden();
      return apiSuccess(await ruleWorkspace(actor.mediaId), requestId);
    }
    if ((request.method === "POST" && (!rule[1] || rule[1] === "preview")) || (request.method === "PATCH" && rule[1])) {
      if (!permissions.authorize({ publication: ["create"] }).success) return forbidden();
      const parsed = ruleInput.safeParse(await request.json().catch(() => null)); if (!parsed.success) return invalid();
      if (rule[1] === "preview") return apiSuccess(await previewRule(actor.mediaId, parsed.data), requestId);
      return apiSuccess(await saveRule(actor, parsed.data, rule[1]), requestId, rule[1] ? 200 : 201);
    }
  }
  const withdrawal = url.pathname.match(/^\/api\/v1\/sites\/([^/]+)\/stories\/([^/]+)\/withdraw$/);
  if (withdrawal && request.method === "POST") {
    if (!permissions.authorize({ publication: ["cancel"] }).success) return forbidden();
    const body = await request.json().catch(() => null);
    if (!body || typeof body.versionId !== "string" || Object.keys(body).length !== 1) return invalid();
    return apiSuccess(await withdrawArticle(actor, withdrawal[1], withdrawal[2], body.versionId), requestId);
  }
  if (url.pathname === "/api/v1/sites" && request.method === "GET") {
    if (!permissions.authorize({ destination: ["read"] }).success) return forbidden();
    return apiSuccess(await sitesWorkspace(actor.mediaId), requestId);
  }
  if (url.pathname === "/api/v1/sites" && request.method === "POST") {
    if (!permissions.authorize({ destination: ["create"] }).success) return forbidden();
    const parsed = siteInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalid();
    return apiSuccess(await saveSite(actor, parsed.data), requestId, 201);
  }
  const site = url.pathname.match(/^\/api\/v1\/sites\/([^/]+)(?:\/(lifecycle|preview)(?:\/stories\/([^/]+))?)?$/);
  if (site) {
    if (request.method === "GET" && site[2] === "preview") {
      if (!permissions.authorize({ destination: ["read"] }).success) return forbidden();
      const parsed = sitePageInput.safeParse(Object.fromEntries(url.searchParams));
      if (!parsed.success) return invalid();
      return apiSuccess(await sitePage({ preview: true, mediaId: actor.mediaId, siteId: site[1], storyId: site[3], ...parsed.data }), requestId);
    }
    if (request.method === "PATCH" && !site[2]) {
      if (!permissions.authorize({ destination: ["update"] }).success) return forbidden();
      const parsed = siteUpdateInput.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return invalid();
      return apiSuccess(await saveSite(actor, parsed.data, site[1]), requestId);
    }
    if (request.method === "POST" && site[2] === "lifecycle") {
      const parsed = siteActionInput.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return invalid();
      if (!permissions.authorize({ destination: [parsed.data.action === "archive" ? "delete" : "update"] }).success) return forbidden();
      return apiSuccess(await changeSite(actor, site[1], parsed.data), requestId);
    }
  }
  if (url.pathname === "/api/v1/publications") {
    if (request.method === "GET") {
      if (!permissions.authorize({ publication: ["read"] }).success) return forbidden();
      const parsed = publicationListInput.safeParse(Object.fromEntries(url.searchParams));
      if (!parsed.success) return invalid();
      return apiSuccess(await publicationWorkspace(actor.mediaId, parsed.data), requestId);
    }
    if (request.method === "POST") {
      if (!permissions.authorize({ publication: ["create"] }).success) return forbidden();
      const parsed = publicationInput.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return invalid();
      return apiSuccess(await enqueueWebPublication(actor, parsed.data), requestId, 202);
    }
  }
  const job = url.pathname.match(/^\/api\/v1\/publications\/([^/]+)\/(retry|cancel|reschedule)$/);
  if (job && request.method === "POST") {
    const action = job[2] as "retry" | "cancel" | "reschedule";
    if (!permissions.authorize({ publication: [action === "reschedule" ? "create" : action] }).success) return forbidden();
    const body = await request.json().catch(() => null);
    if (action === "reschedule") {
      const parsed = publicationRescheduleInput.safeParse(body);
      if (!parsed.success) return invalid();
      return apiSuccess(await changeWebPublication(actor, job[1], action, parsed.data), requestId);
    }
    if (!body || typeof body !== "object" || Object.keys(body).length) return invalid();
    return apiSuccess(await changeWebPublication(actor, job[1], action), requestId);
  }
  return apiError("NOT_FOUND", "مسیر سایت یا انتشار پیدا نشد.", requestId, 404);
}
