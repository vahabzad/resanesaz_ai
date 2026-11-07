import type { PlatformDefinition } from "../../../platform/registry/PlatformRegistry";

export const SHAD_CRAWLER_DEFINITION = {
  webUrl: "https://web.shad.ir/",
  sessionDir: "shad",
  capture: {
    appBootWaitMs: 5_000,
    channelOpenWaitMs: 4_000,
    navigationTimeoutMs: 60_000,
    channelNavigationMaxAttempts: 2,
    joinDetectionTimeoutMs: 10_000,
    joinConfirmationTimeoutMs: 15_000,
    joinConfirmationPollMs: 500,
    joinClickRetryDelayMs: 3_000,
    joinClickMaxAttempts: 3,
    afterJoinDelayMs: 2_000,
    conversationReadyTimeoutMs: 20_000,
    latestScrollDelayMs: 900,
    latestStableRounds: 3,
    latestEmptyStableRounds: 6,
    latestMaxAttempts: 20,
  },
  history: {
    maxScrolls: 30,
    scrollDelayMs: 1_500,
    noNewMessageLimit: 5,
  },
};

export const SHAD_PERSISTENCE_DEFINITION = {
  viewMilestones: [
    { column: "firstHourViewsCount", hours: 1 },
    { column: "firstSixHoursViewsCount", hours: 6 },
    { column: "firstTwelveHoursViewsCount", hours: 12 },
    { column: "firstTwentyFourHoursViewsCount", hours: 24 },
  ],
} as const;

export const SHAD_PLATFORM_DEFINITION = {
  key: "shad",
  title: "شاد",
  crawlerKey: "shad",
  crawlerResourceLifecycle: "cycle",
  image: "/images/Shad_Icon.png",
  messageTrackingWindowHours: 48,
  crawlerIntervalMinutes: 60,
  fastCrawlerIntervalMinutes: null,
  channelInput: {
    label: "شناسه GUID کانال شاد",
    placeholder: "c0...",
    helpText: "GUID کانال شاد را که با c شروع می‌شود وارد کنید.",
    example: "c0123456789abcdef",
  },
} as const satisfies PlatformDefinition;
