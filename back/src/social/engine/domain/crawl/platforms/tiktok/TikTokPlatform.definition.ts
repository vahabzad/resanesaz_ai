import type { ManualBrowserLoginDefinition } from '../_shared/ManualBrowserLogin';
import type { PlatformDefinition } from '../../../platform/registry/PlatformRegistry';

export const TIKTOK_BROWSER_DEFINITION = {
  key: 'tiktok',
  title: 'TikTok',
  sessionDir: 'tiktok',
  webUrl: 'https://www.tiktok.com/login',
} as const satisfies ManualBrowserLoginDefinition;

export const TIKTOK_CRAWLER_DEFINITION = {
  sessionDir: TIKTOK_BROWSER_DEFINITION.sessionDir,
  webUrl: 'https://www.tiktok.com/',
  channelTimeoutMs: 240_000,
  navigationTimeoutMs: 60_000,
  timelineScrollCount: 5,
  maxPosts: 100,
  scrollDelayMs: 2500,
} as const;
export const TIKTOK_PLATFORM_DEFINITION = {
  key: 'tiktok',
  title: 'تیک‌تاک',
  crawlerKey: 'tiktok',
  crawlerResourceLifecycle: 'cycle',
  image: '/images/tiktok.svg',
  messageTrackingWindowHours: null,
  crawlerIntervalMinutes: 60,
  fastCrawlerIntervalMinutes: null,
  channelInput: {
    label: 'آدرس پروفایل تیک‌تاک',
    placeholder: 'https://www.tiktok.com/@chrishelali',
    helpText:
      'نام کاربری یا لینک مستقیم پروفایل عمومی تیک‌تاک را وارد کنید؛ لینک ویدیو یا لینک کوتاه پذیرفته نمی‌شود.',
    example: 'https://www.tiktok.com/@chrishelali',
  },
} as const satisfies PlatformDefinition;
