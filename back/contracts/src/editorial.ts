import type { ManagedSection, PlatformEditorialConfig, EditorialSettingsSnapshot } from "./editorial-settings.js";
export type EditorialStatus = "draft" | "ready" | "approved" | "rejected" | "changes_requested";
export type EditorialRenditions = { social: { text: string; imageUrl: string | null }; webCard: { title: string; summary: string; imageUrl: string | null }; webFull: { title: string; lead: string; body: string; imageUrl: string | null } };
export type EditorialWorkspace = {
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
  stories: { id: string; title: string; revision: number; status: EditorialStatus; language: string; sectionName: string; sourceNames: string[]; updatedAt: string }[];
  sections: ManagedSection[];
  policies: { id: string; instructions: string; settingsSnapshot: EditorialSettingsSnapshot | null; actorUserId: string | null; createdAt: string }[];
  platformConfig: PlatformEditorialConfig | null;
  inputOptions: { sources: { id: string; name: string; url?: string }[]; categories: string[] };
};
export type EditorialQueueWorkspace = {
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
  jobs: Array<{ id: string; sectionId: string; sectionName: string; serviceStopped: boolean; title: string; status: string; attempts: number; errorCode: string | null; storyId: string | null; trigger: string; createdAt: string; finishedAt: string | null }>;
  counts: Array<{ status: string; count: number }>;
  activity: Array<{ sectionId: string; queued: number; running: number; succeeded: number; failed: number; reviewRequired: number; cancelled: number; lastJobAt: string | null; lastFinishedAt: string | null }>;
};
export type EditorialJobDetail = {
  id: string; title: string; sectionName: string; status: string; errorCode: string | null; attempts: number; createdAt: string; finishedAt: string | null;
  diagnosis: { title: string; explanation: string; action: string; reviewRequired: boolean; canRetry: boolean };
  input: { title: string; content: string; sourceName: string };
};
export type EditorialVersion = { id: string; revision: number; title: string; lead: string; body: string; sectionId: string; secondarySectionIds: string[]; sourceIds: string[]; renditions: EditorialRenditions; policyId: string; imageUrl: string | null; actorUserId: string | null; createdAt: string };
export type EditorialDetail = {
  story: { id: string; revision: number; status: EditorialStatus };
  versions: EditorialVersion[];
  sources: { id: string; rawArticleId: string | null; snapshot: { title: string; content: string; url: string; sourceName: string; imageUrl: string | null } }[];
  policies: EditorialWorkspace["policies"];
  approvals: { id: string; versionId: string; decision: EditorialStatus; note: string; actorUserId: string | null; createdAt: string }[];
};
