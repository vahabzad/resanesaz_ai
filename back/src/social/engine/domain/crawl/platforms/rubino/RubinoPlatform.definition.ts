import type { PlatformDefinition } from '../../../platform/registry/PlatformRegistry';

const searchInputSelector = 'input[placeholder="جستجوی کاربر"]';

export const RUBINO_CRAWLER_DEFINITION = {
  webUrl: 'https://m.rubika.ir/',
  sessionDir: 'rubino',
  selectors: {
    homeExploreButtonXPath: '//*[@id="home-page"]/div[3]/button[4]',
    searchButtonXPath: '//*[@id="robino_EXPLORE_page"]/div[2]/div[1]/div[1]/div[1]',
    firstResultXPath: '//*[@id="root"]/div[1]/div[3]/div/div/div[2]/div/ul/li[1]/div/div/div',
    backButtonXPath: '//*[@id="root"]/div[1]/div[4]/nav/div[1]/div[1]',
    clearButtonXPath: '//*[@id="root"]/div[1]/div[3]/nav/div[2]',
    searchInput: searchInputSelector,
    searchInputCandidates: [
      searchInputSelector,
      'input[type="search"]',
      'input[placeholder*="Search"]',
      'input[placeholder*="search"]',
      'input[placeholder*="جست"]',
      'input',
      'textarea',
      '[contenteditable="true"]',
    ],
  },
  initialCrawl: {
    maxScrolls: 80,
    scrollDelayMs: 1_500,
    noNewPostLimit: 5,
  },
};

export const RUBINO_PERSISTENCE_DEFINITION = {
  viewMilestones: [
    { column: 'firstHourViewsCount', hours: 1 },
    { column: 'firstSixHoursViewsCount', hours: 6 },
    { column: 'firstTwelveHoursViewsCount', hours: 12 },
    { column: 'firstTwentyFourHoursViewsCount', hours: 24 },
  ],
} as const;

export const RUBINO_PLATFORM_DEFINITION = {
  key: 'rubino',
  title: 'Rubino',
  crawlerKey: 'rubino',
  crawlerResourceLifecycle: 'cycle',
  image: '/public/images/Rubika_Icon.png',
  messageTrackingWindowHours: 48,
  crawlerIntervalMinutes: 360,
  fastCrawlerIntervalMinutes: 0,
  channelInput: {
    label: 'شناسه یا عبارت جستجوی روبینو',
    placeholder: '@rubino_username',
    helpText: 'شناسه عمومی صفحه روبینو را با @ وارد کنید تا در جستجوی روبینو پیدا شود.',
    example: '@rubino_username',
  },
} as const satisfies PlatformDefinition;
