import type { PlatformDefinition } from '../../../platform/registry/PlatformRegistry';

export const BALE_CRAWLER_DEFINITION = {
  webUrl: 'https://web.bale.ai',
  sessionDir: 'bale',
  messagesContainerSelector: '#message_list_scroller_id',
  messageSelector: '[aria-label="message-item"][data-sid][data-date]:not([data-date="0"])',
  jumpToLatestSelector: '[role="button"]:has(svg[aria-label="ArrowDown2-icon"])',
  maxInitialScrolls: 120,
  maxTrackingScrolls: 500,
  afterChannelOpenDelayMs: 8_000,
  joinConfirmationTimeoutMs: 15_000,
  afterJoinDelayMs: 1_000,
  afterJumpToLatestDelayMs: 1_000,
  memberCountSocketUrlPrefix: 'wss://next-ws.bale.ai/ws/',
  memberCountCaptureMaxFrames: 120,
  memberCountCaptureMaxBytes: 8 * 1024 * 1024,
  initialLookbackHours: 36,
  metricsHydrationTimeoutMs: 4_000,
  metricsHydrationRetries: 3,
  metricsPollIntervalMs: 250,
  metricsSettleDelayMs: 350,
  lazyLoadNudgePx: 12,
  scrollViewportRatio: 0.6,
  smoothScrollSteps: 8,
  smoothScrollStepDelayMs: 100,
} as const;

export const BALE_PERSISTENCE_DEFINITION = {
  viewMilestones: [
    { column: 'firstHourViewsCount', hours: 1 },
    { column: 'firstSixHoursViewsCount', hours: 6 },
    { column: 'firstTwelveHoursViewsCount', hours: 12 },
    { column: 'firstTwentyFourHoursViewsCount', hours: 24 },
  ],
} as const;

export const BALE_PLATFORM_DEFINITION = {
  key: 'bale',
  title: 'بله',
  crawlerKey: 'bale',
  image: '/images/bale.png',
  messageTrackingWindowHours: 36,
  crawlerIntervalMinutes: 60,
  crawlerResourceLifecycle: 'cycle',
  fastCrawlerIntervalMinutes: null,
  channelInput: {
    label: 'شناسه عمومی کانال بله',
    placeholder: '@crocodeal_ir',
    helpText: 'نام کاربری عمومی کانال را با @ وارد کنید.',
    example: '@crocodeal_ir',
  },
} as const satisfies PlatformDefinition;
