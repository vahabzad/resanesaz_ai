import type { PlatformDefinition } from '../../../platform/registry/PlatformRegistry';

export const YOUTUBE_CRAWLER_DEFINITION = {
  webUrl: 'https://www.youtube.com/',
  loginUrl: 'https://www.youtube.com/',
  sessionDir: 'youtube',
  channelTimeoutMs: 900_000,
  navigationTimeoutMs: 90_000,
  authenticationPollIntervalMs: 1_500,
  profileLoadWaitMs: 2_000,
  timelineScrollCount: 3,
  timelineScrollDelayMs: 1_500,
  maxVideos: 100,
  maxShorts: 100,
  maxTabScrolls: 30,
  detailWaitMs: 10_000,
} as const;

export const YOUTUBE_PLATFORM_DEFINITION = {
  key: 'youtube',
  title: 'YouTube',
  crawlerKey: 'youtube',
  image: '/images/youtube.svg',
  messageTrackingWindowHours: null,
  crawlerIntervalMinutes: 60,
  fastCrawlerIntervalMinutes: null,
  crawlerResourceLifecycle: 'cycle',
  channelInput: {
    label: 'نشانی کانال یوتیوب',
    placeholder: '@channel یا https://youtube.com/@channel',
    helpText: 'نام کاربری کانال با @ یا لینک عمومی کانال یوتیوب را وارد کنید.',
    example: '@GoogleDevelopers',
  },
} as const satisfies PlatformDefinition;
