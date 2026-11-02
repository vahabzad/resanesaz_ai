import type { MediaRequest } from "./media-requests.js";
export type OverviewCategory = { id: string; key: string; nameFa: string; nameEn: string; nameAr: string; active: boolean; sortOrder: number; createdAt: string; updatedAt: string };
export type AdminSource = { id: string; name: string; url: string; sourceType: string; status: string; accessGranted: boolean; crawlerStatus: string | null; categories: string[]; categoryIds: string[]; allCategories: boolean; categoryRequests: Array<{ id: string; status: string; categoryIds: string[]; categories: string[] }> };
export type AdminSite = { id: string; name: string; status: "waiting_approval" | "not_started" | "live" | "paused" | "archived"; publicPath: string | null };
export type MediaOverview = { mediaId: string; request: MediaRequest; canReadInbox: boolean; sources: AdminSource[]; sites: AdminSite[]; categories: OverviewCategory[] };
