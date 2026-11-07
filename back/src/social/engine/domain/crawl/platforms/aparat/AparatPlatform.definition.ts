import type { PlatformDefinition } from '../../../platform/registry/PlatformRegistry';

export const APARAT_CRAWLER_DEFINITION = {
  maxVideos: 100,
  maxShorts: 100,
  maxPages: 10,
  pageSize: 20,
  requestTimeoutMs: 20_000,
  requestIntervalMs: 1000,
} as const;

export const APARAT_PLATFORM_DEFINITION = {
  key: 'aparat',
  title: 'آپارات',
  crawlerKey: 'aparat',
  image: '/images/aparat.ico',
  messageTrackingWindowHours: null,
  crawlerIntervalMinutes: 60,
  fastCrawlerIntervalMinutes: null,
  crawlerResourceLifecycle: 'cycle',
  channelInput: {
    label: 'نشانی کانال آپارات',
    placeholder: 'aparat یا https://www.aparat.com/aparat',
    helpText: 'نام کاربری یا لینک عمومی کانال آپارات را وارد کنید؛ لینک ویدیو، کانال نیست.',
    example: 'https://www.aparat.com/aparat',
  },
} as const satisfies PlatformDefinition;
