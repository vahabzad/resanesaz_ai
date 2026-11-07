import type { PlatformDefinition } from '../../../platform/registry/PlatformRegistry';

export const TELEGRAM_CRAWLER_DEFINITION = {
  webUrl: 'https://web.telegram.org/k/',
  sessionDir: 'telegram',
  authenticationPollIntervalMs: 1_000,
  authenticationTimeoutMs: 10 * 60 * 1_000,
  navigationTimeoutMs: 90_000,
  joinDetectionTimeoutMs: 15_000,
  joinConfirmationTimeoutMs: 30_000,
  afterJoinDelayMs: 7_000,
  messageLoadTimeoutMs: 45_000,
  afterChannelOpenDelayMs: 10_000,
  afterGoToLatestDelayMs: 3_000,
  maxScrolls: 500,
  scrollStepPixels: 2_000,
  scrollDelayMs: 1_200,
  noNewMessageLimit: 4,
  initialLookbackHours: 36,
  selectors: {
    authenticated: [
      '#page-chats .chatlist-chat[data-peer-id]',
      '#page-chats .sidebar-header .avatar-photo',
    ],
    login: [
      '#auth-pages',
      '.auth-pages',
      '.qr-container',
      '.page-signQR',
      '.page-sign',
      '.input-field-phone',
      'input[name="phone_number"]',
    ],
  },
} as const;

export const TELEGRAM_PERSISTENCE_DEFINITION = {
  viewMilestones: [
    { column: 'firstHourViewsCount', hours: 1 },
    { column: 'firstSixHoursViewsCount', hours: 6 },
    { column: 'firstTwelveHoursViewsCount', hours: 12 },
    { column: 'firstTwentyFourHoursViewsCount', hours: 24 },
  ],
} as const;

export const TELEGRAM_PLATFORM_DEFINITION = {
  key: 'telegram',
  title: 'Telegram',
  crawlerKey: 'telegram',
  image: '/public/images/telegram.png',
  crawlerResourceLifecycle: 'cycle',
  messageTrackingWindowHours: 48,
  crawlerIntervalMinutes: 60,
  fastCrawlerIntervalMinutes: null,
  channelInput: {
    label: 'شناسه عمومی کانال تلگرام',
    placeholder: '@channel_username',
    helpText: 'نام کاربری عمومی کانال را با @ وارد کنید.',
    example: '@openai',
  },
} as const satisfies PlatformDefinition;
