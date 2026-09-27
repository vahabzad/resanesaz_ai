export type Severity = "neutral" | "success" | "warning" | "danger";

export type NewsItem = {
  id: string;
  mediaId: string;
  headline: string;
  source: string;
  sourceKind: string;
  category: string;
  occurredAt: string;
  completeness: number;
  status: "new" | "developing" | "duplicate";
  actionRequired: boolean;
};

export type EditorialItem = {
  id: string;
  mediaId: string;
  headline: string;
  assignee: string;
  initials: string;
  stage: string;
  deadline: string;
  severity: Severity;
  actionRequired: boolean;
};

export type Destination = {
  id: string;
  mediaId: string;
  name: string;
  destination: string;
  kind: "website" | "telegram" | "social";
  status: "healthy" | "delayed" | "failed";
  lastPublishedAt: string;
  queue: number;
};

export const mediaId = "media_didban_farda";

export const newsItems: NewsItem[] = [
  {
    id: "raw_9214",
    mediaId,
    headline: "مذاکرات منطقه‌ای وارد مرحله تازه‌ای شد؛ نشست بعدی سه‌شنبه برگزار می‌شود",
    source: "ایرنا",
    sourceKind: "وب‌سایت",
    category: "سیاست",
    occurredAt: "۴ دقیقه پیش",
    completeness: 96,
    status: "developing",
    actionRequired: true,
  },
  {
    id: "raw_9213",
    mediaId,
    headline: "شاخص کل بازار در پایان معاملات امروز به مدار صعود بازگشت",
    source: "اقتصاد آنلاین",
    sourceKind: "RSS",
    category: "اقتصاد",
    occurredAt: "۱۲ دقیقه پیش",
    completeness: 89,
    status: "new",
    actionRequired: false,
  },
  {
    id: "raw_9212",
    mediaId,
    headline: "هشدار هواشناسی برای بارش‌های شدید در چهار استان شمالی کشور",
    source: "ایسنا",
    sourceKind: "وب‌سایت",
    category: "جامعه",
    occurredAt: "۱۹ دقیقه پیش",
    completeness: 92,
    status: "new",
    actionRequired: false,
  },
  {
    id: "raw_9211",
    mediaId,
    headline: "گزارش تازه از تغییر الگوی مصرف رسانه در میان کاربران جوان",
    source: "پژوهشگاه ارتباطات",
    sourceKind: "API",
    category: "فناوری",
    occurredAt: "۳۱ دقیقه پیش",
    completeness: 74,
    status: "new",
    actionRequired: true,
  },
];

export const editorialQueue: EditorialItem[] = [
  {
    id: "story_401",
    mediaId,
    headline: "جزئیات نشست اقتصادی تهران و مسکو",
    assignee: "نگار احمدی",
    initials: "نا",
    stage: "منتظر تأیید",
    deadline: "تا ۱۲ دقیقه دیگر",
    severity: "danger",
    actionRequired: true,
  },
  {
    id: "story_400",
    mediaId,
    headline: "گزارش بازار ارز؛ واکنش معامله‌گران به مصوبه جدید",
    assignee: "آرمان کریمی",
    initials: "آک",
    stage: "در حال ویراستاری",
    deadline: "تا ۳۵ دقیقه دیگر",
    severity: "warning",
    actionRequired: false,
  },
  {
    id: "story_399",
    mediaId,
    headline: "پیش‌بینی وضعیت جاده‌های شمال در تعطیلات",
    assignee: "هوش مصنوعی",
    initials: "AI",
    stage: "ساخت نسخه دوم",
    deadline: "بدون فوریت",
    severity: "neutral",
    actionRequired: false,
  },
];

export const destinations: Destination[] = [
  {
    id: "destination_web_main",
    mediaId,
    name: "وب‌سایت اصلی",
    destination: "didbanfarda.ir",
    kind: "website",
    status: "healthy",
    lastPublishedAt: "۲ دقیقه پیش",
    queue: 3,
  },
  {
    id: "destination_telegram_main",
    mediaId,
    name: "کانال خبر فوری",
    destination: "@didban_fori",
    kind: "telegram",
    status: "healthy",
    lastPublishedAt: "۷ دقیقه پیش",
    queue: 2,
  },
  {
    id: "destination_social_x",
    mediaId,
    name: "شبکه اجتماعی",
    destination: "حساب رسمی رسانه",
    kind: "social",
    status: "delayed",
    lastPublishedAt: "۴۳ دقیقه پیش",
    queue: 4,
  },
];

export const crawlerHealth = [
  { id: "crawler_irna", mediaId, name: "ایرنا", count: 34, lastRun: "۳ دقیقه پیش", status: "healthy" as const },
  { id: "crawler_isna", mediaId, name: "ایسنا", count: 27, lastRun: "۸ دقیقه پیش", status: "healthy" as const },
  { id: "crawler_eghtesad", mediaId, name: "اقتصاد آنلاین", count: 18, lastRun: "۱۴ دقیقه پیش", status: "healthy" as const },
  { id: "crawler_fars", mediaId, name: "خبرگزاری فارس", count: 0, lastRun: "۱ ساعت پیش", status: "failed" as const },
];

export const publicationTimeline = [
  { id: "pub_820", mediaId, time: "۱۰:۴۵", label: "گزارش بازار ارز", destinations: "وب‌سایت، تلگرام", status: "scheduled" as const },
  { id: "pub_819", mediaId, time: "۱۰:۲۸", label: "آخرین وضعیت آلودگی هوا", destinations: "۳ مقصد", status: "published" as const },
  { id: "pub_818", mediaId, time: "۱۰:۰۶", label: "گفت‌وگوی اختصاصی با…", destinations: "شبکه اجتماعی", status: "failed" as const },
];

