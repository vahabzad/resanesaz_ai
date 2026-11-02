import type { BrandIdentity, LogoDraft } from "./branding.js";

export type SiteDesignBrief = {
  mediaTopics: string[]; targetAudience: string[]; languages: string[]; categories: string[]; categoryIds?: string[]; contentTypes: string[]; homepageFocus: string[];
  design: { style: string; referenceWebsite: string; contentDensity: string; colorScheme: string; primaryColor: string; secondaryColor: string; backgroundColor: string; logoMode: "provided" | "generate" | "text-only"; visualIdentity: string; fontPreference: string; logoData?: string; logoInstructions?: string; logoDraft?: LogoDraft; identityDetails?: BrandIdentity };
  features: string[]; additionalNotes: string;
};
export type SiteSpec = {
  logo?: string | null;
  title: string; tagline: string; language: "fa" | "en" | "ar"; accent: string; layout: "lead" | "grid"; footer: string;
  blocks: { id: string; title: string; sectionIds: string[]; limit: number }[];
  designBrief?: SiteDesignBrief;
};
export type PublicSiteSpec = Omit<SiteSpec, "designBrief">;
export type MediaSite = { id: string; name: string; slug: string; revision: number; status: "draft" | "live" | "paused" | "archived"; spec: SiteSpec; liveSpec: SiteSpec | null; updatedAt: string };
export type WebSnapshot = {
  seo?: { role: PublicationRole; noindex: boolean; canonicalPath: string; primaryPath: string | null; modifiedAt: string | null };
  delivery?: { role: PublicationRole; primarySiteId: string | null };
  storyId: string; versionId: string; revision: number; language: string; sectionIds: string[]; sectionNames: string[]; sourceNames: string[];
  webCard: { title: string; summary: string; imageUrl: string | null };
  webFull: { title: string; lead: string; body: string; imageUrl: string | null };
};
export type PublicationRole = "primary" | "republication" | "summary";
export type PublicationRuleSettings = { serviceIds: string[]; sectionIds: string[]; language: string; mode: "manual" | "automatic"; role: PublicationRole; approvedSince: string };
export type PublicationRule = { id: string; name: string; siteId: string; revision: number; enabled: boolean; settings: PublicationRuleSettings; createdAt: string; lastErrorCode: string | null };
export type PublicationRuleWorkspace = { rules: PublicationRule[]; services: { id: string; name: string }[] };
export type RulePreview = { total: number; alreadyRegistered: number; samples: { versionId: string; title: string }[]; checkedAt: string };
export type DistributionWorkspace = { storyId: string; sites: { id: string; name: string; status: string; reason: string | null; suggestedRole: PublicationRole; rules: string[]; published: { versionId: string; revision: number; role: PublicationRole; withdrawn: boolean } | null; job: { id: string; status: string; role: PublicationRole; scheduledAt: string } | null }[] };
export type SiteWorkspace = { sites: MediaSite[]; sections: { id: string; name: string }[] };
export type Publication = { id: string; siteId: string; siteName: string; siteSlug: string; siteStatus: MediaSite["status"]; storyId: string; versionId: string; title: string; revision: number; status: "queued" | "succeeded" | "failed" | "cancelled"; attempts: number; scheduledAt: string; finishedAt: string | null; errorCode: string | null; resultPath: string | null; role: PublicationRole; ruleName: string | null; isWithdrawn: boolean; publishedVersionId: string | null };
export type PublicationWorkspace = { jobs: Publication[]; counts: { status: string; count: number }[]; pagination: { page: number; pageSize: number; pageCount: number; total: number } };
export type SitePage = { site: { name: string; slug: string; spec: PublicSiteSpec }; preview: boolean; articles: (WebSnapshot & { publishedAt: string | null })[]; blocks: { id: string; articles: (WebSnapshot & { publishedAt: string | null })[] }[]; pagination: { page: number; total: number; pageCount: number }; selectedSection: string | null; sectionOptions: { id: string; name: string }[] };
