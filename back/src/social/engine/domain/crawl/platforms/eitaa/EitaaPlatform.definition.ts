import type { ManualBrowserLoginDefinition } from '../_shared/ManualBrowserLogin';
import type { PlatformDefinition } from '../../../platform/registry/PlatformRegistry';

export const EITAA_BROWSER_DEFINITION = {
  key: 'eitaa',
  title: 'Eitaa',
  sessionDir: 'eitaa',
  webUrl: 'https://web.eitaa.com/',
} as const satisfies ManualBrowserLoginDefinition;

export const EITAA_PLATFORM_DEFINITION = {
  key: 'eitaa', title: 'ایتا', crawlerKey: 'eitaa',
  crawlerResourceLifecycle: 'cycle', image: '/images/eitaa.png',
  messageTrackingWindowHours: 36, crawlerIntervalMinutes: 60,
  fastCrawlerIntervalMinutes: null,
  channelInput: {
    label: 'نام کاربری کانال ایتا', placeholder: '@farsna',
    helpText: 'نام کاربری عمومی کانال یا لینک eitaa.com را وارد کنید.', example: '@farsna',
  },
} as const satisfies PlatformDefinition;

export const EITAA_PERSISTENCE_DEFINITION = {
  viewMilestones: [
    { column: 'firstHourViewsCount', hours: 1 },
    { column: 'firstSixHoursViewsCount', hours: 6 },
    { column: 'firstTwelveHoursViewsCount', hours: 12 },
    { column: 'firstTwentyFourHoursViewsCount', hours: 24 },
  ],
} as const;
