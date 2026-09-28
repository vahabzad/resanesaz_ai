export type SourceStatus = "active" | "degraded" | "failed" | "paused";

export type SourceSummary = {
  id: string;
  name: string;
  url: string;
  adapterKey: "crawler-generator" | "rss";
  status: SourceStatus;
  enabled: boolean;
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
  trigger: "manual" | "schedule";
  discoveredCount: number;
  insertedCount: number;
  duplicateCount: number;
  quarantinedCount: number;
  errorCode: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type SourcesWorkspace = {
  sources: SourceSummary[];
  recentRuns: CrawlRunSummary[];
  stats: {
    total: number;
    healthy: number;
    failed: number;
    articles: number;
  };
};
