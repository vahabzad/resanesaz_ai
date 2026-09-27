# معماری مفهومی

وضعیت: پیشنهادی و قابل بازنگری پس از تأیید داشبورد و قراردادهای MVP.

## نمای کلان

```text
                     ┌──────────────────────┐
                     │  Unified Dashboard   │
                     └──────────┬───────────┘
                                │
                     ┌──────────▼───────────┐
                     │ Control Plane / API  │
                     │ media, users, policy │
                     │ workflow, audit      │
                     └─────┬─────┬─────┬────┘
                           │     │     │
             ┌─────────────┘     │     └──────────────┐
             ▼                   ▼                    ▼
     Crawler Adapter      Editorial Adapter     Publisher Adapters
             │                   │              ┌──────┴─────────┐
     CrawlerGenerator         sardabir          Websites     Bots/Social
                                                     │
                                         News-website-builder
```

## مسئولیت هستهٔ مرکزی

- مرزبندی رسانه‌ها و عضویت کاربران
- موجودیت‌های canonical و وضعیت workflow
- صف‌های کار و orchestration
- قرارداد و adapter برای بازوهای موجود
- نسخه‌بندی سیاست تحریریه و محتوا
- زمان‌بندی، idempotency و retry انتشار
- Audit Log، health summary و notification داخلی

## مسئولیت بازوهای مرجع

- News-website-builder: تولید/بازسازی خروجی سایت؛ نه احراز هویت مرکزی یا مدل Media
- CrawlerGenerator: تولید recipe، اعتبارسنجی زنده و اجرای کراولر؛ نه مالکیت canonical خبر
- sardabir: تولید و بازنویسی نسخهٔ خبر با سیاست تحریریه؛ نه workflow نهایی یا انتشار
- Publisher adapters آینده: تبدیل rendition و ارتباط با API هر مقصد

## مسیر تکامل پیشنهادی

برای شروع، هسته به‌صورت modular monolith با workerهای جدا برای کارهای طولانی مناسب‌تر از تقسیم زودهنگام به microservice است. مرز ماژول‌ها و قراردادهای job از ابتدا روشن می‌ماند تا در صورت نیاز بعداً مستقل شوند.

```text
apps/dashboard     رابط RTL
apps/api           API هسته
apps/worker        jobهای crawler/editorial/publishing
packages/contracts schema و type مشترک
packages/ui        design system
packages/adapters  اتصال به بازوها و مقصدها
```

این ساختار هنوز ایجاد نشده و فقط جهت معماری است.

## جریان داده و مالکیت

- هسته مالک شناسه‌ها، وضعیت workflow و روابط دامنه است.
- بازوها نتیجهٔ پردازش را از طریق قرارداد نسخه‌دار برمی‌گردانند.
- فایل JSON تولیدشده توسط ابزارهای فعلی، integration contract نهایی نیست.
- کارهای طولانی باید async باشند و progress event قابل نمایش تولید کنند.
- فراخوانی‌های بیرونی باید correlation ID و نتیجهٔ قابل audit داشته باشند.

## اصول قراردادها

- schema validation در هر مرز
- versioning صریح event/payload
- idempotency برای ingestion و publishing
- timeout، retry محدود و dead-letter state
- عدم ارسال credential به فرانت
- عدم اعتماد به HTML، متن خبر یا خروجی مدل

