# معماری اجرایی

وضعیت: پذیرفته‌شده بر اساس PRD نسخهٔ ۲ و ADR-0007 — ۱۴۰۵/۰۷/۱۱

## ساختار مخزن

```text
front/                    Next.js، UI و composition صفحه‌ها
back/                     Backend مستقل Node.js، دامنه، auth و دیتابیس
  contracts/              قراردادهای TypeScript نسخه‌دار برای API
  worker/                 process مستقل jobهای crawler و background
references/ (خارج Git)    cloneهای read-only پروژه‌های آزمایشی
```

در ریشه فقط دو محدودهٔ توسعهٔ محصول وجود دارد: `front` و `back`. قراردادها و worker زیر Backend قرار دارند و deployableهای مستقلی هستند.

## نمای کلان

```text
Browser
  ↓
front / Next.js
  ↓ Versioned HTTP API
back / Node.js API
  ├── IAM / Platform Administration
  ├── Media / Permission Management
  ├── Crawler / Ingestion
  ├── Editorial
  ├── Site Builder
  ├── Publication
  └── Audit / Observability
         ↓ durable jobs
back/worker
  ├── Crawl execution
  └── Publication/background execution
```

Next.js هیچ Route Handler کسب‌وکاری، دسترسی مستقیم دیتابیس، auth server یا worker داخلی ندارد. در توسعه، rewrite مسیر `/api/*` فقط نقش reverse proxy به Backend مستقل را دارد.

## استفاده از پروژه‌های مرجع

CrawlerGenerator، sardabir و News-website-builder محصول آزمایشی و منبع مطالعه‌اند، نه سرویس runtime یا dependency محصول.

- clone آن‌ها بیرون از Git و deploy محصول نگه‌داری می‌شود؛
- منطق، prompt، schema و آزمون‌های مفید خوانده و ارزیابی می‌شوند؛
- قابلیت موردنیاز PRD در ماژول متناظر `back` بازطراحی و تست می‌شود؛
- Backend هیچ درخواست HTTP، import یا وابستگی deployment به این مخزن‌ها ندارد؛
- adapter فقط برای مرز خارجی واقعی مانند API شبکه اجتماعی یا سرویس ثالث استفاده می‌شود.

## Scope و جریان ingestion

```text
Platform Admin
  → Source Catalog
  → Crawler Definition / Version
  → Crawl Run on Worker
  → Platform Raw Article
  → Media Source Subscription
  → Media Inbox Item
  → Story / Editorial / Publication
```

Source، crawler، run و Raw Article سراسری‌اند. یک run برای تمام Mediaهای subscriber کافی است. پس از ingestion، برای هر Subscription فعال یک Media Inbox Item ساخته می‌شود و تمام تصمیم‌های تحریریه از آن نقطه tenant-scoped هستند.

## مسئولیت Backend

- authentication، Platform/Media authorization و Permissionها؛
- مدل canonical، migration و Data Access Layer؛
- کاتالوگ Source، نسخه‌بندی crawler و scheduler؛
- orchestration، idempotency، retry و Audit؛
- sanitization، SSRF guard و validation تمام ورودی‌های خارجی؛
- API نسخه‌دار مستقل از Frontend.

## مسئولیت Frontend

- تجربهٔ فارسی RTL، navigation و نمایش stateهای loading/empty/error/degraded؛
- composition صفحات با کامپوننت‌های reusable؛
- مصرف API نسخه‌دار و عدم بازتولید منطق دامنه یا authorization؛
- عدم دسترسی به credential، دیتابیس یا مسیر محلی worker.

## اصول قراردادها

- schema validation در هر مرز؛
- versioning صریح event و payload؛
- `scopeType/scopeId` برای job و audit؛
- idempotency برای ingestion و publishing؛
- timeout، retry محدود، checkpoint و dead-letter state؛
- correlation ID از API تا worker و نتیجه؛
- عدم اعتماد به HTML، متن خبر، prompt مرجع یا خروجی مدل.


## سایت داخلی و تحویل وب — فاز ۴

Site Builder در Backend، spec محدود و اعتبارسنجی‌شده و lifecycle سایت را نگه می‌دارد. rendererهای ثبت‌شده در `front/components/sites` تنها قرارداد JSON نسخه‌دار را مصرف می‌کنند؛ کد مرجع یا کد آزاد مدل اجرا نمی‌شود. draft طراحی از live مستقل است و preview احراز هویت‌شده، iframe بدون script و CSP محدود دارد. سایت عمومی `/s/:slug` فقط snapshotهای commit‌شدهٔ انتشار را می‌خواند؛ کنترل توقف در هر خواندن اعمال می‌شود.

`web_publication_job` و `site_article` مرز تحویل تحریریه به وب‌اند. کلید یکتای رسانه × سایت × نسخه درخواست تکراری را مهار می‌کند؛ رکورد سایت × خبر، URL ثابت را با نسخهٔ تازهٔ approved به‌روزرسانی می‌کند. worker بدون درخواست خارجی، claim با قفل و ثبت محتوا/نتیجه/audit را در یک تراکنش انجام می‌دهد. بنابراین قطع پیش از commit job را queued نگه می‌دارد و موفقیت نیمه‌کاره وجود ندارد. مجوز درخواست‌کننده و آخرین approval در همان تراکنش دوباره بررسی می‌شوند. تغییر زمان با CAS زمان قبلی و حفظ attempts انجام می‌شود. جزئیات در ADR-0020 ثبت شده‌اند.
