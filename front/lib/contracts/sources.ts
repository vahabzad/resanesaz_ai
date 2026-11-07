import type { SourceAdapter } from "./social-platforms";
export type SourceStatus = "active" | "degraded" | "failed" | "paused" | "building";

export type SourceSummary = {
  id: string;
  name: string;
  url: string;
  adapterKey: SourceAdapter;
  status: SourceStatus;
  enabled: boolean;
  executionBlocked: boolean;
  scheduleMinutes: number;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
  articleCount: number;
};

export type CrawlRunSummary = {
  id: string;
  sourceId: string;
  sourceName: string;
  status: "queued" | "running" | "succeeded" | "failed";
  trigger: "manual" | "schedule" | "build" | "debug";
  discoveredCount: number;
  insertedCount: number;
  duplicateCount: number;
  quarantinedCount: number;
  failedCount: number | null;
  errorCode: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type SourcesWorkspace = {
  sources: SourceSummary[];
  availableSources: Array<Pick<SourceSummary, "id" | "name" | "url" | "adapterKey"> & { categories: string[] }>;
  recentRuns: CrawlRunSummary[];
  stats: {
    total: number;
    healthy: number;
    failed: number;
    articles: number;
  };
};

export type CrawlRunLiveEvent = {
  id: string;
  sequence: number;
  stage: string;
  status: string;
  level: string;
  message: string;
  articleUrl: string | null;
  errorCode: string | null;
  durationMs: number | null;
  createdAt: string;
};

export type CrawlRunLiveLog = {
  runId: string;
  sourceName: string;
  status: CrawlRunSummary["status"];
  errorCode: string | null;
  events: CrawlRunLiveEvent[];
  eventCount: number;
};

export type PlatformSourcesWorkspace = {
  sources: Array<SourceSummary & { crawlerVersion: number | null; activeRunId: string | null; activeRun: { id: string; status: "queued" | "running"; trigger: CrawlRunSummary["trigger"]; createdAt: string; startedAt: string | null } | null; visibleToMedia: boolean; mediaDeliveryEnabled: boolean; archivedAt: string | null; buildStatus: string | null; buildMode: "build" | "debug" | null; buildReport: CrawlerValidationReport | null }>;
  recentRuns: CrawlRunSummary[];
};

export type CrawlerValidationReport = {
  passed: boolean; checkedAt: string; discovered: number; attempts: number;
  samples: Array<{ url: string; passed: boolean; title: string | null; contentLength: number; errorCode: string | null; categories?: string[]; categoryStatus?: "found" | "missing" | "not_exposed" }>;
};
