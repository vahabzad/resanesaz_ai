import type { ManualBrowserLoginDefinition } from '../_shared/ManualBrowserLogin';
import type { PlatformDefinition } from '../../../platform/registry/PlatformRegistry';

export const SOROUSH_BROWSER_DEFINITION = {
  key: 'soroush',
  title: 'Soroush Plus',
  sessionDir: 'soroush',
  webUrl: 'https://web.splus.ir/',
} as const satisfies ManualBrowserLoginDefinition;

export const SOROUSH_PLATFORM_DEFINITION = {
  key: 'soroush', title: 'سروش پلاس', crawlerKey: 'soroush',
  crawlerResourceLifecycle: 'cycle', image: '/images/soroush.png',
  messageTrackingWindowHours: 36, crawlerIntervalMinutes: 60,
  fastCrawlerIntervalMinutes: null,
  channelInput: {
    label: 'نام کاربری کانال سروش پلاس', placeholder: '@soonami_music',
    helpText: 'نام کاربری عمومی کانال یا لینک splus.ir را وارد کنید.', example: '@soonami_music',
  },
} as const satisfies PlatformDefinition;

export const SOROUSH_PERSISTENCE_DEFINITION = {
  viewMilestones: [
    { column: 'firstHourViewsCount', hours: 1 },
    { column: 'firstSixHoursViewsCount', hours: 6 },
    { column: 'firstTwelveHoursViewsCount', hours: 12 },
    { column: 'firstTwentyFourHoursViewsCount', hours: 24 },
  ],
} as const;
