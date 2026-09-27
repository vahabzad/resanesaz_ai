# قراردادهای یکپارچه‌سازی

وضعیت: اصول adapterها مفهومی‌اند؛ envelope عمومی و endpointهای پایهٔ `v1` اجرایی شده‌اند.

## API هستهٔ فعال

تمام پاسخ‌ها `cache-control: no-store` و header به نام `x-request-id` دارند. شناسهٔ ورودی فقط با الگوی محدود پذیرفته می‌شود و در غیر این صورت سرور UUID تازه تولید می‌کند.

```json
{
  "contractVersion": "1",
  "data": {},
  "meta": { "correlationId": "..." }
}
```

خطا:

```json
{
  "contractVersion": "1",
  "error": { "code": "FORBIDDEN", "message": "..." },
  "meta": { "correlationId": "..." }
}
```

- `GET /api/v1/context`: هویت، رسانه‌های قابل دسترس و رسانهٔ فعال؛ نیازمند نشست معتبر.
- `POST /api/v1/media/select`: بدنهٔ strict به شکل `{ "mediaId": "..." }`؛ عضویت در سرور بررسی و تغییر موفق audit می‌شود.
- endpointهای Better Auth زیر `/api/auth/*` قرار دارند؛ ثبت‌نام عمومی و ساخت Media توسط کاربر عادی غیرفعال است.

## اصول مشترک envelope

هر job طولانی حداقل این شناسه‌ها را حمل می‌کند:

```text
contractVersion
jobId
correlationId
mediaId
requestedBy
requestedAt
idempotencyKey
```

## Crawler Adapter

ورودی مفهومی: Source، نسخهٔ Crawler، محدودیت اجرا و correlation.

خروجی مفهومی: Crawl Run summary به‌همراه مجموعهٔ Raw Article و خطاهای مستقل هر URL. فیلدهای فعلی CrawlerGenerator مانند `title`، `content`، `contentHtml`، `imageUrl`، `categories`، `tags`، `author` و `publishedAt` پایهٔ mapping هستند، نه قرارداد نهایی.

## Editorial Adapter

ورودی مفهومی: Story context، منابع immutable، نسخهٔ Editorial Policy، مقصدهای موردنظر و محدودیت محتوا.

خروجی مفهومی: Article Version، provenance/claims metadata، usage و warningها. خروجی هیچ‌وقت خودکار «تأییدشده» محسوب نمی‌شود مگر workflow رسانه صریحاً اجازه دهد.

## Website Builder Adapter

ورودی مفهومی: Site Specification نسخه‌دار و عملیات `generate | rebuild | continue`.

خروجی مفهومی: Build status/progress، artifact reference، preview reference و خطا. مسیر محلی workspace نباید در API عمومی افشا شود.

## Publisher Adapter

ورودی مفهومی: Destination، rendition immutable، schedule و idempotency key.

خروجی مفهومی: remote content ID/URL، attempt، status، timestamps و خطای پالایش‌شده. credential reference ارسال می‌شود، نه secret خام.

## وضعیت‌های پایهٔ job

```text
queued → running → succeeded
                 ↘ failed → retrying → succeeded|dead
queued|running → cancelled
```
