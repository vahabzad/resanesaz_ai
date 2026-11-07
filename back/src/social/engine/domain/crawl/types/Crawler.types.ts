import { PlatformKey } from "../../platform/registry/PlatformRegistry";

export interface CrawlerChannel {
  retryBoundary?: { stopMsgId?: string | null; sinceDate?: string; initialFullCrawl?: boolean };
  rememberBoundary?: (boundary: NonNullable<CrawlerChannel['retryBoundary']>) => Promise<void>;
  id?: string;
  brandId?: string;
  brandTitle?: string | null;
  platformKey: PlatformKey;
  address: string;
  title?: string | null;
  metadata?: Record<string, unknown> | null;
  onProfileCaptured?: (profile: CrawlerChannelProfile) => Promise<void>;
  reportProgress?: (event: { eventCode: string; stage: string; message: string; level?: 'info' | 'warning' | 'error'; context?: Record<string, unknown> }) => Promise<void>;
}

export interface CrawlerMessage {
  platformKey: PlatformKey;
  externalId: string;
  text?: string | null;
  publishedAt?: Date | string | null;
  raw?: Record<string, unknown> | null;
}

export interface CrawlerChannelProfile {
  platformKey: PlatformKey;
  address: string;
  title?: string | null;
  description?: string | null;
  avatarUrl?: string | null;
  raw?: Record<string, unknown> | null;
}

export interface CrawlerStory {
  platformKey: PlatformKey;
  externalId: string;
  mediaType?: string | null;
  mediaUrl?: string | null;
  screenshotPath?: string | null;
  takenAt?: Date | string | null;
  expiresAt?: Date | string | null;
  raw?: Record<string, unknown> | null;
}

export interface CrawlerChannelCrawlResult {
  extractionIncomplete?: boolean;
  profile?: CrawlerChannelProfile | null;
  messages: CrawlerMessage[];
  stories?: CrawlerStory[];
}

export interface CrawlerMessageMetrics {
  views?: number | null;
  reactions?: number | null;
  comments?: number | null;
  shares?: number | null;
  raw?: Record<string, unknown> | null;
}

export interface PlatformCrawler {
  readonly platformKey: PlatformKey;
  readonly cyclesEnabled?: boolean;
  initialize?(): Promise<void>;
  crawlChannel?(channel: CrawlerChannel): Promise<CrawlerChannelCrawlResult>;
  fetchChannelProfile(channel: CrawlerChannel): Promise<CrawlerChannelProfile>;
  fetchNewMessages(channel: CrawlerChannel): Promise<CrawlerMessage[]>;
  fetchMessageMetrics(message: CrawlerMessage): Promise<CrawlerMessageMetrics>;
  fetchFastNewMessages?(channel: CrawlerChannel, latestRegisteredId: string | null): Promise<CrawlerMessage[]>;
  crawlFastChannel?(channel: CrawlerChannel, latestRegisteredId: string | null): Promise<CrawlerChannelCrawlResult>;
  close?(): Promise<void>;
}
