export type InstagramLogContext = { channelId?: string; account?: string; progress?: string; itemId?: string };
export type InstagramLogFields = Record<string, string | number | boolean | undefined>;

const labels: Record<string, string> = {
  'browser-open': 'باز کردن مرورگر', channel: 'برداشت کانال',
  'profile-navigation': 'باز کردن پروفایل', 'profile-capture': 'دریافت اطلاعات پروفایل',
  'profile-availability': 'بررسی دسترسی به پروفایل', 'profile-persistence': 'ذخیره پروفایل',
  posts: 'دریافت پست‌ها', 'posts-capture': 'خواندن پاسخ پست‌ها',
  'reels-navigation': 'باز کردن تب ریلز', 'reels-capture': 'خواندن پاسخ ریلز',
  'reels-reload': 'بارگذاری دوباره تب ریلز', 'reels-reload-capture': 'خواندن پاسخ ریلز پس از بارگذاری دوباره',
  reels: 'دریافت ریلز', 'reel-metrics': 'دریافت آمار ریلز', 'reel-metrics-capture': 'خواندن پاسخ آمار ریلز',
  'reel-details': 'دریافت جزئیات ریلز', 'reel-api': 'فراخوانی API جزئیات ریلز',
  'reel-modal': 'باز کردن جزئیات ریلز در صفحه',
  stories: 'دریافت استوری‌ها', 'story-api': 'فراخوانی API استوری',
  'story-screenshot': 'ذخیره تصویر استوری', 'response-capture': 'خواندن پاسخ API',
  'capture-stop': 'پایان دریافت پاسخ‌های شبکه',
};

export function instagramProgressMessage(context: InstagramLogContext, stage: string, event: string, fields: InstagramLogFields = {}) {
  const values = { channelId: context.channelId || '-', account: context.account || '-', stage, event,
    progress: context.progress, itemId: context.itemId, ...fields };
  const detail = Object.entries(values).filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${typeof value === 'string' ? JSON.stringify(value) : String(value)}`).join(' ');
  return `instagram | ${labels[stage] ?? stage} | ${detail}`;
}
