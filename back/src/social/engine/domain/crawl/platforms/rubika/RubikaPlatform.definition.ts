import type { PlatformDefinition } from '../../../platform/registry/PlatformRegistry';

export const RUBIKA_CRAWLER_DEFINITION = {
  crawlerResourceLifecycle: 'cycle',
  webUrl: 'https://web.rubika.ir',
  sessionDir: 'rubika',
  bubblesContainerSelector: 'tab-conversation .bubbles > div',
  latestControlSelector: 'tab-conversation button.bubbles-go-down',
  latestMaxAttempts: 20,
  latestScrollDelayMs: 750,
  latestStableRounds: 3,
  maxScrolls: 500,
  afterChannelOpenDelayMs: 8_000,
  joinDetectionTimeoutMs: 10_000,
  joinConfirmationTimeoutMs: 15_000,
  joinConfirmationPollMs: 500,
  joinClickRetryDelayMs: 3_000,
  joinClickMaxAttempts: 3,
  afterJoinDelayMs: 8_000,
  searchSettleDelayMs: 5_000,
  searchResultWaitMs: 10_000,
  searchResultClickDelayMs: 600,
  scrollDelayMs: 3_500,
  noNewMessageLimit: 5,
  initialLookbackHours: 24,
};

export const RUBIKA_PERSISTENCE_DEFINITION = {
  viewMilestones: [
    { column: 'firstHourViewsCount', hours: 1 },
    { column: 'firstSixHoursViewsCount', hours: 6 },
    { column: 'firstTwelveHoursViewsCount', hours: 12 },
    { column: 'firstTwentyFourHoursViewsCount', hours: 24 },
  ],
} as const;

export const RUBIKA_PLATFORM_DEFINITION = {
  key: 'rubika',
  title: 'Rubika',
  crawlerKey: 'rubika',
  image: '/public/images/Rubika_Icon.png',
  messageTrackingWindowHours: 36,
  crawlerIntervalMinutes: 60,
  fastCrawlerIntervalMinutes: null,
  channelInput: {
    label: 'شناسه عمومی کانال روبیکا',
    placeholder: '@fadayeparcham',
    helpText: 'شناسه عمومی کانال را با @ وارد کنید؛ لینک داخلی web.rubika.ir وارد نکنید.',
    example: '@fadayeparcham',
  },
} as const satisfies PlatformDefinition;
