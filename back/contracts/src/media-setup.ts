import type { SocialPlatform } from "./social-platforms.js";
export type MediaSourceSelection = {
  sourceId: string;
  categoryMode: "all" | "selected";
  categories: string[];
};

export type SourceAccessInput = {
  platform?: SocialPlatform;
  sourceType: "website" | "social";
  url: string;
  categoryMode?: "all" | "selected";
  categoryIds?: string[];
};

// Match equivalent addresses while keeping different paths/query values distinct.
export function sourceRequestKey(value: string) {
  try {
    const url = new URL(value.trim());
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!(url.hostname === "web.shad.ir" && /^#c=c[A-Za-z0-9]+$/.test(url.hash))) url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    url.searchParams.sort();
    return url.toString();
  } catch { return value.trim(); }
}

export type MediaSetupPreferences = {
  editorialViewpoint: string;
  sourceSelections: MediaSourceSelection[];
  socialPlatforms: Array<"bale" | "telegram">;
  setupCompleted: boolean;
  setupStep?: number;
};

export type MediaSourceAccessRequest = {
  id: string; sourceType: "website" | "social"; platform?: SocialPlatform | null; url: string; categoryMode: "all" | "selected" | null; categoryIds: string[]; sourceId: string | null;
  status: "draft" | "pending" | "rejected" | "crawler_queued" | "crawler_failed" | "access_granted"; createdAt: string;
};
