import type { PlatformDefinition } from '../../../platform/registry/PlatformRegistry';

const configuredDetailLimit = Number.parseInt(
  process.env.INSTAGRAM_MAX_REEL_DETAIL_FETCHES ?? '',
  10
);
const configuredMaxTabScrolls = Number.parseInt(
  process.env.INSTAGRAM_MAX_TAB_SCROLLS ?? '',
  10
);
const configuredChannelTimeout = Number(process.env.INSTAGRAM_CHANNEL_TIMEOUT_MS);

export const INSTAGRAM_CRAWLER_DEFINITION = {
  webUrl: 'https://www.instagram.com/',
  sessionDir: 'instagram',
  maxTabScrolls:
    Number.isFinite(configuredMaxTabScrolls) && configuredMaxTabScrolls > 0
      ? configuredMaxTabScrolls
      : 5,
  noNewItemsLimit: 5,
  scrollDelayMs: 2_000,
  reelDetailTimeoutMs: 20_000,
  apiRequestTimeoutMs: 20_000,
  responseBodyTimeoutMs: 20_000,
  protocolTimeoutMs: 35_000,
  channelTimeoutMs: Number.isFinite(configuredChannelTimeout) && configuredChannelTimeout > 0 ? Math.max(30_000, configuredChannelTimeout) : 300_000,
  reelDetailDelayMs: 1_500,
  storyLoadDelayMs: 2_000,
  storyNavigationTimeoutMs: 30_000,
  maxReelDetailFetches:
    Number.isFinite(configuredDetailLimit) && configuredDetailLimit >= 0
      ? configuredDetailLimit
      : Number.POSITIVE_INFINITY,
};

export const INSTAGRAM_PLATFORM_DEFINITION = {
  key: 'instagram',
  title: 'Instagram',
  crawlerKey: 'instagram',
  crawlerResourceLifecycle: 'cycle',
  image: '/public/images/instagram.png',
  messageTrackingWindowHours: null,
  crawlerIntervalMinutes: 60,
  fastCrawlerIntervalMinutes: null,
  channelInput: {
    label: 'شناسه صفحه اینستاگرام',
    placeholder: '@instagram_username',
    helpText: 'نام کاربری صفحه را با @ وارد کنید.',
    example: '@instagram',
  },
} as const satisfies PlatformDefinition;
