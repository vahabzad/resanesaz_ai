import type { PlatformDefinition } from '../../../platform/registry/PlatformRegistry';

export const X_CRAWLER_DEFINITION = {
  webUrl: 'https://x.com/home',
  loginUrl: 'https://x.com/i/flow/login',
  sessionDir: 'x',
  channelTimeoutMs: 300_000,
  navigationTimeoutMs: 90_000,
  authenticationPollIntervalMs: 1_500,
  profileLoadWaitMs: 5_000,
  timelineScrollCount: 5,
  timelineScrollDelayMs: 2_000,
} as const;

export const X_PLATFORM_DEFINITION = {
  key: 'x',
  title: 'X',
  crawlerKey: 'x',
  image: '/images/x.svg',
  messageTrackingWindowHours: null,
  crawlerIntervalMinutes: 60,
  fastCrawlerIntervalMinutes: null,
  channelInput: {
    label: 'شناسه حساب X',
    placeholder: '@username',
    helpText: 'نام کاربری حساب X را با @ وارد کنید.',
    example: '@OpenAI',
  },
} as const satisfies PlatformDefinition;
