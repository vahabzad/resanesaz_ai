import type { ManualBrowserLoginDefinition } from '../_shared/ManualBrowserLogin';
import type { PlatformDefinition } from '../../../platform/registry/PlatformRegistry';

export const FACEBOOK_BROWSER_DEFINITION = {
  key: 'facebook',
  title: 'Facebook',
  sessionDir: 'facebook',
  webUrl: 'https://www.facebook.com/login/',
} as const satisfies ManualBrowserLoginDefinition;

export const FACEBOOK_CRAWLER_DEFINITION = {
  sessionDir: FACEBOOK_BROWSER_DEFINITION.sessionDir,
  webUrl: 'https://www.facebook.com/',
  channelTimeoutMs: 240_000,
  navigationTimeoutMs: 60_000,
  timelineScrollCount: 5,
  maxPosts: 100,
  scrollDelayMs: 2500,
} as const;

export const FACEBOOK_PLATFORM_DEFINITION = {
  key: 'facebook',
  title: 'فیسبوک',
  crawlerKey: 'facebook',
  crawlerResourceLifecycle: 'cycle',
  image: '/images/facebook.svg',
  messageTrackingWindowHours: null,
  crawlerIntervalMinutes: 60,
  fastCrawlerIntervalMinutes: null,
  channelInput: {
    label: 'آدرس صفحهٔ فیسبوک',
    placeholder: 'https://www.facebook.com/AlArabiya.Farsi',
    helpText:
      'لینک مستقیم صفحه یا نام کاربری عمومی فیسبوک را وارد کنید؛ لینک جست‌وجو قابل استفاده نیست.',
    example: 'https://www.facebook.com/AlArabiya.Farsi',
  },
} as const satisfies PlatformDefinition;
