import type { ManagedSection, PlatformEditorialConfig, EditorialSettingsSnapshot } from "./editorial-settings.js";
export type EditorialStatus = "draft" | "ready" | "approved" | "rejected" | "changes_requested";
export type EditorialRenditions = { social: { text: string; imageUrl: string | null }; webCard: { title: string; summary: string; imageUrl: string | null }; webFull: { title: string; lead: string; body: string; imageUrl: string | null } };
export type EditorialWorkspace = {
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
  stories: { id: string; title: string; revision: number; status: EditorialStatus; language: string; sectionName: string; sourceNames: string[]; updatedAt: string }[];
  sections: ManagedSection[];
  policies: { id: string; instructions: string; settingsSnapshot: EditorialSettingsSnapshot | null; actorUserId: string | null; createdAt: string }[];
  platformConfig: PlatformEditorialConfig | null;
  inputOptions: { sources: { id: string; name: string }[]; categories: string[] };
};
export type EditorialVersion = { id: string; revision: number; title: string; lead: string; body: string; sectionId: string; secondarySectionIds: string[]; sourceIds: string[]; renditions: EditorialRenditions; policyId: string; imageUrl: string | null; actorUserId: string | null; createdAt: string };
export type EditorialDetail = {
  story: { id: string; revision: number; status: EditorialStatus };
  versions: EditorialVersion[];
  sources: { id: string; rawArticleId: string | null; snapshot: { title: string; content: string; url: string; sourceName: string; imageUrl: string | null } }[];
  policies: EditorialWorkspace["policies"];
  approvals: { id: string; versionId: string; decision: EditorialStatus; note: string; actorUserId: string | null; createdAt: string }[];
};
