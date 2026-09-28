# ADR-0005: صف دیتابیسی و worker اجرای Crawl

تاریخ: 2026-09-28

وضعیت: پذیرفته‌شده

## زمینه

اجرای RSS در اولین vertical slice داخل request انجام می‌شد. این کار پاسخ API را تا پایان دریافت شبکه باز نگه می‌داشت و برای scheduler، اجرای طولانی و چند نمونهٔ سرور مناسب نبود. محیط محلی از PGlite استفاده می‌کند و فقط یک process می‌تواند مالک دیتابیس باشد، در حالی که PostgreSQL محیط اصلی امکان worker جداگانه دارد.

## تصمیم

- جدول `crawl_run` صف durable این مرحله است و API اجرای دستی فقط یک run با وضعیت `queued` می‌سازد و پاسخ `202` می‌دهد.
- worker یک run را با تغییر شرطی `queued → running` claim می‌کند؛ بنابراین workerهای رقیب یک run را هم‌زمان اجرا نمی‌کنند.
- partial unique index اجازه نمی‌دهد برای یک Source بیش از یک run در وضعیت `queued/running` وجود داشته باشد.
- scheduler در چرخهٔ worker، موعد Source را از `scheduleMinutes` و `lastRunAt` محاسبه و run با trigger برابر `schedule` ایجاد می‌کند.
- runهای `running` که بیش از ۱۵ دقیقه رها شده‌اند با `WORKER_STALLED` شکست‌خورده ثبت می‌شوند تا صف برای همیشه قفل نماند.
- در توسعهٔ PGlite، worker با `CRAWL_WORKER_MODE=inline` داخل process سرور اجرا می‌شود. در PostgreSQL، فرمان `npm run worker:crawl` به‌عنوان process مستقل اجرا خواهد شد.
- actor، `mediaId`، correlation ID، نسخهٔ crawler و provenance از enqueue تا Raw Article حفظ می‌شوند.

## پیامدها

- زمان پاسخ اجرای دستی مستقل از زمان fetch منبع است و UI می‌تواند وضعیت‌های صف و اجرا را نمایش دهد.
- scheduler و اجرای دستی یک مسیر مشترک دارند و deduplication صف در دیتابیس enforce می‌شود.
- صف فعلی مخصوص Crawl است؛ retry policy و dead-letter قابل اقدام همراه UI جزئیات اجرا در ادامهٔ فاز دوم تکمیل می‌شود.
- در استقرار چندنمونه‌ای فقط PostgreSQL و worker مستقل مجاز است؛ inline worker راهکار توسعهٔ محلی است.
