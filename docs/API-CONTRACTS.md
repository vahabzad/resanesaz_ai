# قراردادهای API و یکپارچه‌سازی

در تنظیمات سردبیر، `settings.sourceAttribution` اختیاری با شکل `{website: "named"|"omit", social: "named"|"omit"}` پذیرفته و بازخوانی می‌شود. نبود آن معادل named/named است. حالت بر اساس نوع منبع ورودی برای خبر و نسخهٔ اجتماعی اعمال می‌شود، نه مقصد انتشار. هر کار snapshot همان سیاست را دارد؛ تغییر تنظیم، کارها و خروجی‌های قبلی را بازنویسی نمی‌کند. هویت کانال/پیج از نام ثبت‌شده/URL پروفایل و adapter، با fallback آیدی، در provenance ورودی کار ثبت می‌شود. ADR-0044.

وضعیت: Frontend و Backend مستقل‌اند؛ API فعال در `back` پیاده‌سازی شده است.

## مرز اجرا

- `front` هیچ API کسب‌وکاری ندارد و درخواست `/api/*` را در توسعه به Backend پروکسی می‌کند.
- `back` مالک auth، authorization، دیتابیس، API و orchestration است.
- `back/worker` jobهای طولانی را مستقل اجرا می‌کند.
- پروژه‌های مرجع endpoint runtime محصول نیستند.

## envelope عمومی

تمام پاسخ‌ها `cache-control: no-store` و `x-request-id` دارند.

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

## API فضای Media

- `GET /api/v1/context`: هویت، رسانه‌های قابل دسترس، رسانهٔ فعال و `isPlatformAdmin` برای نمایش ورودی فضای پلتفرم.
- `GET /api/v1/media/onboarding`: برای حساب ادمین، امکان ساخت رسانه، وجود رسانهٔ قبلی، نام کاربر و وضعیت ورود موقت را می‌دهد.
- `POST /api/v1/media`: ساخت رسانه با بدنهٔ `{name, logoMode, logoData?, editorialViewpoint}`؛ لوگو یا به‌صورت مونگرام SVG از نام ساخته می‌شود یا تصویر PNG/JPEG/WebP با سقف یک مگابایت به‌شکل data URL می‌آید. دیدگاه رسانه ۱۰ تا ۲۰۰۰ نویسه است. سازنده با عضویت owner متصل می‌شود، رسانه فعال می‌شود و audit ثبت می‌شود.
- `GET /api/v1/media/setup` و `PATCH /api/v1/media/setup`: خواندن/ذخیرهٔ ترجیحات راه‌اندازی رسانه شامل `setupCompleted`. بدنهٔ PATCH می‌تواند `name` اختیاری (۲ تا ۱۲۰ نویسه پس از trim) برای تغییر نام همان رسانهٔ فعال داشته باشد؛ تغییر نام مجوز `organization/update` می‌خواهد و همراه ترجیحات در یک تراکنش ممیزی می‌شود. `name` در ترجیحات ذخیره نمی‌شود؛ نام جاری از context خوانده می‌شود. wizard فقط در پایان مرحلهٔ چهارم این مقدار را true می‌کند؛ تا آن زمان صفحات Media کاربر را به wizard برمی‌گردانند. این ترجیحات دسترسی Source یا credential بات را فعال نمی‌کنند.
- `POST /api/v1/media/select`: انتخاب Media پس از validation عضویت.
- `GET /api/v1/sources`: Subscriptionهای Media فعال، سلامت Sourceهای سراسری و منابع قابل انتخاب کاتالوگ.
- `POST /api/v1/sources`: ایجاد Subscription با بدنهٔ `{ "sourceId": "..." }`؛ crawler تازه نمی‌سازد.
- `DELETE /api/v1/sources/:sourceId`: حذف Subscription همان Media؛ Source سراسری دست‌نخورده می‌ماند.
- `GET /api/v1/articles`: Media Inbox Itemهای مجاز Media فعال؛ فیلتر `query` (تیتر/متن/چکیده/نام منبع، حداکثر ۲۰۰ نویسه و همسان‌سازی ی/ک)، `sourceId`، `category` (دستهٔ خام منبع)، `status=new|quarantined`، `period=24h|7d|30d` بر اساس زمان دریافت، `sort=received|published|oldest` و `page` دارد. فیلتر قبل از صفحه‌بندی ۲۰تایی اجرا می‌شود. پاسخ `articles`, `total`, `page`, `pageSize`, `pageCount`, `sources`, `categories`, `stats` است؛ گزینه‌ها و آمار کلی فقط از Inbox مجاز همان رسانه‌اند، `total` شمار نتیجهٔ فیلترشده است. مقادیر خالی فیلتر به معنی همه است و پیش‌فرض مرتب‌سازی جدیدترین دریافت است.
- `GET /api/v1/articles/:id`: متن سادهٔ کامل ذخیره‌شده (`content`)، نویسنده، چکیده، دسته‌ها و مشخصات خبر برای مودال خواندن؛ فقط با وجود Inbox Item در Media فعال و دسترسی جاری منبع/دسته. شناسهٔ خارج از دسترسی 404 می‌دهد. HTML خام و credential برنمی‌گردد؛ UI متن منبع را escape می‌کند و خواندن، وضعیت خبر یا گردش تحریریه را تغییر نمی‌دهد.
- `GET /api/v1/crawl-runs/:runId/events`: log یک run فقط اگر Media به Source آن subscribe باشد.

## API فضای Platform

- `GET /api/v1/platform/context`: برای هر کاربر واردشده، هویت و `isPlatformAdmin`؛ بدون نیاز به عضویت یا انتخاب Media. نشست نامعتبر پاسخ 401 می‌گیرد.

این endpointها فقط برای Platform Admin مجازند:

- `GET /api/v1/platform/codex/status`: وضعیت SDK با `status`، `authenticationMode`، `inferenceVerified`، `model`، `modelSource`، پیام پالایش‌شده و `checkedAt`؛ بدون credential یا مسیر محلی. مدل اختصاصی `CRAWLER_CODEX_MODEL` اولویت دارد (`crawler_config`)؛ در نبود آن، `config/read` از app-server همان CLI و همان working directory کراولرساز، مدل مؤثر را می‌خواند (`codex_config`). خطا یا مدل نامشخص با null گزارش می‌شود و نام حدس زده نمی‌شود. probe بدون shell، با سقف خروجی و timeout پنج‌ثانیه است؛ تنظیم خام منتشر نمی‌شود. Backend اجرای native را از `CODEX_EXECUTABLE`، PATH یا runtime همراه SDK پیدا می‌کند و `codex login status` را اجرا می‌کند. `authenticated` ورود معتبر است؛ `connected` پاسخ معتبر ساخت کراولر در پنج دقیقهٔ اخیر را تأیید می‌کند. بررسی وضعیت درخواست inference اجرا نمی‌کند.
- `GET /api/v1/platform/articles`: فهرست سراسری محدود به ادمین با `query` عنوان، `sourceId`، `category` دقیق، `status` جدید/قرنطینه، `page` و `pageSize` از ۱۰/۲۰/۵۰؛ پاسخ شامل articles، total، page/pageCount، گزینه‌های منبع و دسته‌بندی است. محتوای HTML خام در فهرست منتشر نمی‌شود.
- `GET /api/v1/platform/articles/:id`: جزئیات ذخیره‌شده محدود به ادمین شامل content متنی، summary، imageUrl، inlineImageUrls، دسته‌بندی، نویسنده و crawlRunId. HTML خام بازگردانده نمی‌شود؛ متن در UI escape و تصویر فقط پس از اعتبارسنجی URL عمومی HTTPS نمایش داده می‌شود. خبر حذف‌شده/ناموجود 404 است. نمایش جزئیات دوباره خبر را crawl نمی‌کند.
- `POST /api/v1/platform/articles/delete-preview`: `{mode: "all" | "filtered", filters: {query, sourceId, category, status}}`؛ پاسخ شامل token امضاشده، محدوده، cutoff، تعداد اخبار و تعداد ورودی‌های صندوق است. حالت all فیلترهای ارسالی را کنار می‌گذارد.
- `POST /api/v1/platform/articles/delete`: `{token, confirmed: true}`؛ فقط ادمین صادرکنندهٔ preview تا ده دقیقه مجاز است. حذف دائمی Raw و Inbox مرتبط همراه audit اتمیک انجام می‌شود؛ منابع/اشتراک‌ها/اجراها باقی می‌مانند. پاسخ `deletedArticles` و `deletedInboxItems` شمار واقعی حذف است. ticket دست‌کاری‌شده یا منقضی با 409 رد می‌شود؛ خبرهای دریافت‌شده پس از cutoff حذف نمی‌شوند. جزئیات ADR-0012.
- `GET /api/v1/platform/sources`: تمام منابع، شامل متوقف‌ها، نسخهٔ فعال کراولر، شناسهٔ اجرای باز، شمار خبر خام سراسری و ۳۰ اجرای اخیر.
  هر منبع `activeRun: {id, status: "queued"|"running", trigger, createdAt, startedAt} | null` دارد؛ نمایش پیشرفت ساخت/دیباگ از وضعیت اجرای باز می‌آید و مستقل از وضعیت خود منبع است. `activeRunId` برای سازگاری حفظ شده است.
- `GET /api/v1/platform/crawl-runs/:runId/events`: وضعیت و حداکثر ۱۱۰۰ رویداد اخیر اجرای سراسری به ترتیب زمان ثبت، همراه `eventCount`، مستقل از Subscription رسانه. هر رویداد علاوه بر مرحله/شدت/پیام، `articleUrl` (بدون query و credential)، `errorCode` پالایش‌شده و `durationMs` دارد؛ مقدار null در سابقهٔ قدیمی طبیعی است.
- `POST /api/v1/platform/sources`: ثبت Source غیرفعال، نسخهٔ draft و صف ساخت/آزمون سراسری در transaction؛ پاسخ 202 با `{sourceId, runId}`. فقط پس از آزمون موفق توسط Worker منبع فعال می‌شود.
- `POST /api/v1/platform/sources/:sourceId/build`: ساخت و آزمون مجدد نسخهٔ جدید؛ پاسخ 202 با `{sourceId, runId, accepted}`. وجود اجرای باز باعث بازگرداندن همان run و `accepted=false` می‌شود.
- `POST /api/v1/platform/sources/:sourceId/debug`: دیباگ کراولر وب با Codex؛ recipe نسخهٔ فعال/قبلی و حداکثر ۳۰ خطای ساختاریافتهٔ پالایش‌شده از اجراهای همان Source در نسخهٔ draft snapshot می‌شوند. Worker صفحه‌های خطادار همان origin را دوباره بررسی می‌کند و الگوی اصلاح‌شده را با gate ساخت آزمایش می‌کند. فقط قبولی نسخه را جایگزین می‌کند؛ شکست نسخهٔ فعال را حفظ می‌کند و توقف دستی نیز پس از قبولی حفظ می‌شود. اجرای باز تکثیر نمی‌شود؛ RSS پاسخ 409 دارد و از مسیر build/parser آزموده می‌شود. trigger برابر `debug` و `buildMode` کاتالوگ برابر `debug` است.
- `POST /api/v1/platform/sources/:sourceId/run`: صف‌بندی اجرای دستی سراسری.
- `POST /api/v1/platform/sources/:sourceId/stop`: توقف Source و لغو run فعال.
- `POST /api/v1/platform/sources/:sourceId/resume`: فعال‌سازی مجدد Source.
- `PATCH /api/v1/platform/sources/:sourceId/schedule`: ویرایش فاصلهٔ دریافت پس از ساخت، با بدنهٔ `{ "scheduleMinutes": 30 }`؛ عدد صحیح بین ۵ و ۱۴۴۰ دقیقه. پاسخ شامل `sourceId` و `scheduleMinutes` است؛ تغییر و audit در یک transaction ذخیره می‌شوند. زمان‌بند مقدار جدید را نسبت به `lastRunAt` در چرخهٔ بعد می‌خواند؛ اجرای باز، نسخهٔ کراولر و وضعیت فعال/متوقف تغییر نمی‌کنند.
- `PATCH /api/v1/platform/sources/:sourceId/visibility`: بدنهٔ `{ "mode": "public" }`؛ حالت‌های `public`، `catalog_hidden` (فقط منع انتخاب جدید) و `media_disabled` (قطع نمایش منبع و توزیع به همهٔ رسانه‌ها). مستقل از توقف دریافت سراسری است؛ اخبار قبلی حفظ می‌شوند.
- `DELETE /api/v1/platform/sources/:sourceId`: حذف قابل بازیابی، غیرفعال‌سازی و لغو اجراهای باز؛ نسخه‌ها، اخبار و تاریخچه حذف فیزیکی نمی‌شوند.
- `POST /api/v1/platform/sources/:sourceId/restore`: بازیابی منبع حذف‌شده در وضعیت متوقف؛ فعال‌سازی مجدد یک عملیات مستقل است.

کاتالوگ Platform شامل `visibleToMedia`، `mediaDeliveryEnabled` و `archivedAt` است؛ UI به‌طور پیش‌فرض منابع حذف‌شده را کنار می‌گذارد و فیلتر نمایش حذف‌شده‌ها برای بازیابی دارد. جزئیات سیاست‌ها در ADR-0008 ثبت شده است.

رابط این عملیات در `/platform/sources` است. فضای پلتفرم انتخاب‌گر Media ندارد و نقش owner/admin رسانه به‌تنهایی مجوز این APIها نیست. ساخت وب با Codex SDK recipe اختصاصی می‌سازد؛ طبق ADR-0039 پیش‌فرض ۱۲ صفحهٔ probe و ۶ تا ۱۲ نمونهٔ متناسب با تنوع قالب دارد. نمونه‌های تاریخی و شکست‌خورده اجباری‌اند و دیباگ پوشش کشف فعلی/قبلی را کامل بازآزمایی می‌کند؛ حداقل سه صفحهٔ معتبر همچنان الزامی است. اصلاح پیش‌فرض سه تلاش و دارای بودجهٔ زمان/درخواست/حافظه است؛ الگوی تکراری یا خطای غیرقابل‌اصلاح با CSS زودتر متوقف می‌شود. RSS با parser واقعی آزموده می‌شود. کاتالوگ Platform فیلدهای `buildStatus` و `buildReport` دارد؛ `sampling`، `terminationReason`، `discoveryError` و `samples[].diagnostics` اختیاری‌اند. diagnostics شامل `layout`، `issues` با `code/stage/repairable` و `metrics` عددی است. بازسازی ناموفق نسخهٔ فعال قبلی را حفظ می‌کند. نسخه‌های عمومی قبلی آزمون‌شده فرض نمی‌شوند. جزئیات در ADR-0011 و ADR-0039 ثبت است.

## قرارداد job

هر job طولانی حداقل این شناسه‌ها را حمل می‌کند:

```text
contractVersion
jobId
correlationId
scopeType = platform | media
scopeId
requestedBy
requestedAt
idempotencyKey
```

Crawl Run دارای scope پلتفرم است؛ Publication Job دارای scope رسانه است.

## Crawler داخلی

ورودی: Source، Crawler Version، محدودیت اجرا و correlation.

خروجی: Crawl Run summary، Platform Raw Articleها و خطاهای مستقل هر URL. فیلدهای canonical شامل `title`، `content`، `contentHtml`، `imageUrl`، `categories`، `tags`، `author` و `publishedAt` هستند.

`failedCount` شکست دریافت/استخراج را از `quarantinedCount` اخبار ذخیره‌شده در قرنطینه جدا می‌کند؛ سابقهٔ قبل از migration 0008 مقدار null دارد و شمارندهٔ قدیمی ممکن است هر دو را جمع کرده باشد. اجرای دارای خروجی معتبر و شکست جزئی، `succeeded/PARTIAL_EXTRACTION` و Source با وضعیت `degraded` دارد؛ بدون خروجی معتبر وب، run ناموفق با `ALL_EXTRACTIONS_FAILED` یا `NO_ARTICLE_LINKS` است و زمان آخرین موفقیت Source تغییر نمی‌کند. درخواست خبر در خطاهای موقت شبکه/timeout/408/429/5xx حداکثر یک بار پس از یک ثانیه تکرار می‌شود؛ هر درخواست دوباره URL guard را طی می‌کند.

منطق استخراج در Backend و worker محصول پیاده‌سازی می‌شود. CrawlerGenerator فقط منبع مطالعهٔ recipe، prompt و آزمون مرجع است و Backend به API آن درخواست نمی‌زند.

## Connectorهای خارجی

adapter/connector تنها برای مرز خارجی واقعی استفاده می‌شود؛ مانند API مقصد انتشار یا سرویس ثالث. ورودی آن reference امن credential است، نه secret خام، و خروجی شامل remote ID/URL، attempt، status و خطای پالایش‌شده است.

## وضعیت‌های پایهٔ job

```text
queued → running → succeeded
                 ↘ failed → retrying → succeeded|dead
queued|running → cancelled
```

### توقف مستقل و زبان سرویس تحریریه

- `POST /api/v1/editorial/sections/:id/stop` و `/resume`: بدنهٔ `{ expectedRevision }`؛ فقط owner/admin/editor همان رسانه. نسخهٔ قدیمی یا سرویس حذف‌شده/خارج از scope پاسخ 409 می‌گیرد. توقف همهٔ کارهای باز دستی/خودکار را لغو می‌کند؛ فعال‌سازی خودبه‌خود کار لغوشده را retry نمی‌کند.
- Workspace و پاسخ سرویس شامل `paused` است. PATCH با `paused` اختیاری برای سازگاری، در صورت نبود آن وضعیت موجود را حفظ می‌کند. صف برای هر کار `serviceStopped` می‌دهد تا تلاش مجدد سرویس متوقف/حذف‌شده در UI غیرفعال باشد.
- `settings.language`: `fa/en/ar/tr/fr/de/es/ru`، پیش‌فرض فارسی. زبان در snapshot سیاست ثبت می‌شود و عنوان/لید/متن تولیدی Codex را تعیین می‌کند؛ تغییر تنظیمات روی کار تاریخی اثر ندارد.
- هر سیاست دو دستور متنی مستقل در `settings.instructions` و `settings.socialInstructions` دارد؛ دومی اختیاری و ۲۰ تا ۵۰۰۰ نویسه است و برای ساخت نسخهٔ شبکهٔ اجتماعی استفاده می‌شود. خروجی تحریر شامل `title`, `lead` (چکیده), `body` (متن کامل), `socialText` و `reviewRequired` است؛ نسخهٔ اجتماعی در rendition ذخیره می‌شود.

### تازگی خبر برای تحریر خودکار

- `settings.autoFreshness` اختیاری است: `{ maxAgeHours: number | null, unknownDatePolicy: "skip" | "received", resumeMode: "new_only" | "continue" }`. سقف سن عدد صحیح ۱ تا ۷۲۰ ساعت است؛ `null` بدون سقف سن. پیش‌فرض مؤثر برای نبود تنظیم نیز `{ maxAgeHours: 6, unknownDatePolicy: "skip", resumeMode: "new_only" }` است. حذف فیلد در PATCH تنظیم قبلی را حفظ می‌کند؛ مقدار نامعتبر پاسخ 400 دارد.
- `new_only` هنگام گذار stopped→active یا خاموش→روشن اجرای خودکار، `autoReceivedSince` را با زمان سرور جلو می‌برد؛ نقطهٔ آینده عقب نمی‌رود. `continue` بازهٔ ثبت‌شده را نگه می‌دارد. سن خبر در هر دو حالت رعایت می‌شود.
- سن از `RawArticle.publishedAt` محاسبه می‌شود. فقط در حالت `received` و نبود تاریخ انتشار، `ingestedAt` مبناست. خبر با تاریخ آینده تا رسیدن آن زمان واجد شرایط نیست. شرط تازگی قبل از limit فهرست ورودی خودکار، enqueue، فراخوانی مدل و ثبت خروجی اعمال می‌شود؛ کار دستی و retry دستی مستقل‌اند.
- تغییر تنظیمات، کارهای خودکار بازِ نامنطبق را با `AUTO_FRESHNESS_CHANGED` (یا در تغییر نقطهٔ شروع، `AUTO_START_CHANGED`) لغو می‌کند. انقضای صف/اجرا، تاریخ نامشخص، تاریخ آینده و نبود خبر در صندوق، وضعیت `cancelled` و کدهای `AUTO_NEWS_EXPIRED`، `AUTO_DATE_UNKNOWN`، `AUTO_DATE_FUTURE` و `AUTO_INPUT_UNAVAILABLE` دارند.

### نقطهٔ شروع تحریر خودکار

- ساخت/ویرایش سرویس، `settings.autoReceivedSince` اختیاری با مقدار ISO دارای timezone یا `null` می‌گیرد. `null` یعنی بدون محدودیت زمان دریافت، با رعایت قواعد تازگی؛ حذف فیلد در PATCH مقدار قبلی را حفظ می‌کند. مقدار نامعتبر پاسخ 400 دارد. `startAutoNow: true` در سطح بدنه، زمان ثبت سرور را یک‌بار جایگزین این مقدار می‌کند؛ پاسخ و Workspace زمان ثابت را برمی‌گردانند.
- انتخاب خودکار با شرط `RawArticle.ingestedAt >= autoReceivedSince` و همان scope و فیلترهای سرویس انجام می‌شود؛ انتخاب دستی مستقل است. تغییر نقطهٔ شروع، کارهای خودکار باز خارج از بازه را با `AUTO_START_CHANGED` لغو می‌کند؛ خروجی تکمیل‌شده و کار دستی حفظ می‌شوند. کار لغوشده فقط با retry دستی برمی‌گردد. توقف و restart زمان را تغییر نمی‌دهند؛ فعال‌سازی دوباره یا روشن‌کردن خودکار طبق `autoFreshness.resumeMode` رفتار می‌کند (ADR-0037؛ اصلاح ADR-0019).

### قالب اجتماعی سرویس تحریریه

- در ساخت/ویرایش سرویس، `settings.socialOutput` اختیاری است: `{format,maxLength,includeImage,prefix,suffix}`. format یکی از `title_lead/lead/title_body/title`، maxLength عدد صحیح ۱۰۰ تا ۲۰۰۰ و includeImage بولی است. prefix حداکثر ۱۰۰ و suffix حداکثر ۳۰۰ نویسه، بدون HTML؛ متن ثابت و جداکننده‌ها باید دست‌کم ۲۰ نویسه برای خبر باقی بگذارند. شیء ناقص، فیلد ناشناخته یا مقدار نامعتبر 400 می‌گیرد. همان مجوز owner/admin/editor و scope رسانه برقرار است.
- نبود این تنظیم معادل `title_lead`، سقف ۲۰۰۰، همراه تصویر و متن ثابت خالی است. قالب در سیاست نسخه و صف snapshot می‌شود؛ تغییر سرویس نسخه‌های قبلی یا کارهای ثبت‌شده را تغییر نمی‌دهد. fallback دادهٔ قدیمی با rendition تهی نیز از سیاست همان نسخه استفاده می‌کند.
- در تحریر AI، نسخهٔ اجتماعی با `socialInstructions` جدا از پرامپت خبر تولید می‌شود و سپس طبق قالب، سقف طول، متن ابتدا/انتها و تنظیم تصویر به rendition تبدیل می‌شود. متن ثابت وارد prompt مدل نمی‌شود. اگر متن اجتماعی تولیدشده موجود نباشد (نسخهٔ قدیمی یا ساخت دستی)، خروجی از canonical مشتق می‌شود؛ لید خالی از پاراگراف اول body استفاده می‌کند. قالب روی WebCard/WebFull اثر ندارد. rendition اجتماعی ارسالیِ دستی حفظ می‌شود و سقف عمومی آن همچنان ۲۰۰۰ است. انتشار واقعی انجام نمی‌شود (ADR-0018).


### تکمیل تحریریهٔ فاز ۳

- هر ردیف `stories` دارای `sourceNames:string[]` است: نام‌های یکتای snapshot منابع نسخهٔ جاری در همان رسانه؛ منبع قطع‌شده حذف می‌شود و نام پس از حذف Raw باقی می‌ماند. نبود نام، آرایهٔ خالی است.

- `GET /api/v1/editorial`: `page` (پیش‌فرض ۱)، `pageSize` (۱۰/۲۰/۵۰؛ پیش‌فرض ۲۰)، `query`، `status`، `sectionId`، `sourceId`، `language`، `from/to` (ISO با offset) و `view=ready`. پاسخ دارای `stories` و `pagination:{page,pageSize,total,pageCount}` است. بخش اصلی/ثانویه و فقط منابع متصل نسخهٔ جاری در فیلتر لحاظ می‌شوند؛ scope از جلسه گرفته می‌شود.
- `GET /api/v1/editorial/jobs`: page/pageSize، status و sectionId اختیاری؛ پاسخ jobs/counts/activity/pagination. counts وضعیت‌های سردبیر انتخابی در رسانهٔ فعال (و با نبود sectionId کل رسانه) را می‌شمارند و از فیلتر status مستقل‌اند؛ total متعلق به نتایج فیلتر است. activity، شمار queued/running/succeeded/failed/reviewRequired/cancelled و lastJobAt/lastFinishedAt هر سردبیر همان رسانه را مستقل از فیلتر صف برمی‌گرداند. در read model، failed با کد CONTENT_REVIEW_REQUIRED به status=review_required تبدیل می‌شود و از failed فنی کنار می‌رود؛ فیلتر و شمارها همین قاعده را دارند. jobs زمان createdAt/finishedAt دارند. sectionId رسانهٔ دیگر نتیجه/شمار خالی می‌دهد؛ activity هرگز از رسانهٔ فعال خارج نمی‌شود. پارامتر ناشناخته/اندازه نامعتبر 400 می‌گیرد.
- `GET /api/v1/editorial/jobs/:id`: مجوز story/read و Media فعال لازم است؛ تشخیص ثابت و امن `diagnosis`، `canRetry`، وضعیت/کد/زمان‌ها و snapshot متن سادهٔ ورودی `input` را برمی‌گرداند. شناسهٔ رسانهٔ دیگر 404 است. HTML خام، credential، config اجرایی و prompt خصوصی برنمی‌گردند. ADR-0043.
- Section دارای `parentId:null|string` است. حذف یا تغییر hierarchy با revision/مجوز و قفل تراکنش انجام می‌شود؛ والد بیگانه/چرخه/والد حذف‌شده و حذف والد دارای فرزند فعال مجاز نیست. زیرسرویس تنظیمات و توقف مستقل دارد.
- جزئیات Story شامل policies نسخه‌های همان خبر است. Article Version دارای sectionId اصلی، secondarySectionIds، sourceIds (شناسهٔ Story Source) و renditions است. منابع خارج از Story یا رسانه رد می‌شوند. metadata نمایشی section/policy/language/actor/time از همان نسخه است، نه Layout مقصد.
- `POST /api/v1/editorial/stories/:id/sources`: `{expectedRevision,rawArticleId}` برای اتصال یا `{expectedRevision,sourceId}` برای قطع؛ دقیقاً یکی از دو شناسه. فقط ورودی سالم Inbox همان رسانه، حداکثر ۲۰ منبع و حداقل یک منبع. تغییر، نسخهٔ draft تازه می‌سازد؛ منابع تاریخی حذف نمی‌شوند و متن خودکار ادغام نمی‌شود.
- `POST .../:id/versions`: علاوه بر title/lead/body/sectionId/expectedRevision، secondarySectionIds/sourceIds و renditions اختیاری‌اند. renditions ورودی شامل social:{text,imageUrl} و webCard:{title,summary,imageUrl} است؛ webFull سمت Backend از canonical مشتق می‌شود. HTML و اندازهٔ نامعتبر رد می‌شوند؛ URL تصویر فقط http(s) و هیچ fetch از این endpoint صورت نمی‌گیرد. بدون renditions خروجی‌های پیش‌فرض دوباره مشتق می‌شوند.
- هر تأیید فقط همان revision/versionId را پوشش می‌دهد؛ تغییر متن، منابع، بخش یا rendition دوباره draft می‌شود. این قرارداد مجوز ارسال به مقصد ایجاد نمی‌کند؛ انتشار در فاز ۴/۵ با مصرف نسخهٔ تأییدشده توسعه خواهد یافت.


### سایت داخلی و انتشار وب — فاز ۴

- `GET /api/v1/sites`: سایت‌ها و بخش‌های فعال Media نشست؛ `POST` برای ساخت با `{name,slug,spec}` و `PATCH /sites/:id` با همان بدنه و `expectedRevision`. slug انگلیسی/عددی/خط‌تیره، سراسری یکتا و پس از ساخت ثابت است. spec شامل title/tagline/language (`fa/en/ar`)، accent هگز، layout (`lead/grid`)، footer و ۱ تا ۸ block با id/title/sectionIds/limit (۱ تا ۲۰) است. بخش بیگانه/حذف‌شده و HTML رد می‌شوند. مجوزهای destination/read/create/update اعمال می‌شوند.
- `POST /api/v1/sites/:id/lifecycle`: `{expectedRevision,action:activate|pause|archive|restore}`. activate طراحی پیش‌نویس را عمومی می‌کند؛ pause/archive سایت را از دسترس عمومی خارج و کارهای queued آن را لغو می‌کنند. restore به draft برمی‌گرداند. archive مجوز destination/delete دارد؛ بقیه update.
- `GET /api/v1/sites/:id/preview` و `/preview/stories/:storyId`: احراز هویت و destination/read؛ فقط همان Media. پیش‌نمایش spec ذخیره‌شده و حداکثر ۲۰ نمونهٔ approved را نمایش می‌دهد و خبر منتشر نمی‌کند.
- `GET /api/v1/public/sites/:slug` و `/stories/:storyId`: تنها سایت live و snapshot خبرهای واقعاً منتشرشده؛ بدون نشست. queryهای page، sectionId و view=all مجازند؛ فهرست خبر ۲۰تایی، blocks مستقل با سقف تنظیم‌شده و pagination برمی‌گردند. policy، actor، credential و Raw Article در قرارداد عمومی نیستند.
- `POST /api/v1/publications`: `{siteId,versionId,scheduledAt?}` با ISO دارای offset؛ زمان گذشته رد می‌شود. مجوز publication/create و latest approved دقیق الزامی است. درخواست تکراری همان شناسهٔ job و `duplicate:true` می‌دهد. کلید یکتا Media × Site × Version است.
- `GET /api/v1/publications`: page (۲۰تایی)، status و siteId؛ پاسخ jobs/counts/pagination. هر job دارای وضعیت، attempts، scheduledAt، finishedAt، errorCode، resultPath، نسخه و وضعیت سایت است. مجوز publication/read اعمال می‌شود.
- `POST /api/v1/publications/:id/retry|cancel` با `{}` و مجوز متناظر. cancel فقط queued؛ retry فقط failed/cancelled با سایت live، نسخهٔ همچنان approved و کمتر از سه تلاش است؛ retry زمان را فوری می‌کند. کدهای SITE_STOPPED، ACCESS_REVOKED، APPROVAL_CHANGED و WORKER_FAILED پالایش‌شده‌اند. همان مجوز و تأیید در worker دوباره بررسی می‌شوند؛ نتیجه و snapshot منتشرشده اتمیک‌اند (ADR-0020).

- `POST /api/v1/publications/:id/reschedule` با `{scheduledAt,expectedScheduledAt}` (ISO دارای offset) و publication/create: فقط queued/failed/cancelled با سایت live و تأیید معتبر؛ زمان تازه آینده و زمان قبلی باید منطبق باشد. تلاش مصرف‌شده ریست نمی‌شود و ثبت نتیجهٔ موفق قابل زمان‌بندی دوباره نیست.
### درخواست افزودن منبع

- `GET /api/v1/media/source-categories` (ادمین رسانه): دسته‌های داخلی فعال همراه نام فارسی، انگلیسی و عربی.
- `POST /api/v1/media/source-access-requests` (ادمین رسانه): `{ sourceType: "website", url, categoryMode: "all" | "selected", categoryIds?: string[] }` برای وب‌سایت؛ یا `{ sourceType: "social", url }` برای شبکهٔ اجتماعی. آدرس باید HTTPS باشد. در حالت selected حداقل یک شناسهٔ دستهٔ فعال لازم است؛ در حالت all شناسه‌ای ارسال نمی‌شود. نام نمایشی از hostname آدرس ساخته می‌شود و درخواست در scope `mediaId` فعال برای بررسی سوپر ادمین ثبت می‌شود. ادمین می‌تواند چند درخواست جداگانه ثبت کند.
- `GET /api/v1/platform/categories` (سوپر ادمین): کاتالوگ دسته‌ها.
- `POST /api/v1/platform/categories` (سوپر ادمین): `{ nameFa, nameEn, nameAr }`؛ هر سه ترجمه لازم‌اند.
- `PATCH /api/v1/platform/categories/:id` (سوپر ادمین): `{ nameFa, nameEn, nameAr, active }` برای ویرایش ترجمه‌ها یا فعال/غیرفعال کردن دسته.
- `GET /api/v1/platform/source-access-requests` (سوپر ادمین): فهرست درخواست‌ها همراه رسانه، نوع، دسته‌ها، وضعیت و امکان استفاده از کراولر آماده.
- `PATCH /api/v1/platform/source-access-requests/:id` (سوپر ادمین): `{ action: "reject" | "grant_existing" | "queue_crawler" }`. grant_existing دسترسی Media را به Source دارای crawler فعال می‌دهد؛ queue_crawler برای Source جدید یا آماده‌نشده ساخت را صف می‌کند و پس از موفقیت build، دسترسی Media و دسته‌های درخواستی را اعمال می‌کند. شکست ساخت با وضعیت crawler_failed قابل retry است. همهٔ تصمیم‌ها audit می‌شوند.

در ثبت/ویرایش سایت، `designBrief.categoryIds` شناسه‌های دسته‌های فعال کاتالوگ Platform است؛ نام‌های `categories` در Backend از کاتالوگ بازسازی می‌شوند. دستهٔ ناموجود یا غیرفعال با 400 رد می‌شود. برای سازگاری با پیش‌نویس قدیمیِ بدون شناسه، فقط نام‌های موجود در کاتالوگ فعال پذیرفته می‌شوند. `GET /api/v1/media/source-categories` برای ادمین احرازشدهٔ بدون رسانه نیز قابل دریافت است؛ کاربران دیگر همچنان به عضویت رسانه و مجوز خواندن منابع نیاز دارند.

- `POST /api/v1/media/logo-preview`: فقط ادمین احرازشده، حتی بدون رسانه؛ ورودی نام، توضیح سبک، سه رنگ hex و متن هویت بصری؛ خروجی request snapshot، artwork اعتبارسنجی‌شده و data URL پیش‌نمایش. خطای ورودی 400، بدون نشست 401، بدون نقش 403، تکرار/هم‌زمانی 429 و خطای مدل 503 است. هیچ Media/Site ایجاد نمی‌شود.
- `designBrief.design` اکنون `logoData` موقت برای آپلود، `logoInstructions`، `logoDraft` شامل request/artwork/approved و `identityDetails` خصوصی را می‌پذیرد. لوگوی generated نیازمند تأیید مطابق مشخصات فعلی است؛ آپلود در Backend اعتبارسنجی و در `spec.logo` ذخیره می‌شود و از brief حذف می‌شود. لوگوی Media هم‌زمان و scoped به‌روز می‌شود. خروجی عمومی `spec.logo` را دارد؛ اطلاعات خصوصی همچنان حذف می‌شوند.

`GET/PATCH /api/v1/media/setup` فیلد اختیاری `setupStep` (عدد صحیح ۱ تا ۴) را برای ادامهٔ wizard نگه می‌دارد. فرانت فقط پس از موفقیت ذخیرهٔ داده‌های مرحله، مرحلهٔ بعد را ثبت و سپس مسیر را عوض می‌کند. حذف این فیلد از درخواست کلاینت قدیمی، مقدار ثبت‌شده را پاک نمی‌کند.

در راه‌اندازی ناتمام، `POST /api/v1/media/source-access-requests` ردیف draft می‌سازد. `DELETE /api/v1/media/source-access-requests/:id` با مجوز source/delete فقط پیش‌نویس همان Media را منطقی حذف می‌کند (withdrawn). تکمیل `/media/setup` درخواست‌های باقی‌مانده را اتمیک pending می‌کند. GET و بررسی مستقیم Platform تا پیش از تکمیل، این درخواست‌ها را در دسترس بررسی نمی‌گذارند. ردیف pending قدیمی رسانهٔ ناتمام در GET ادمین به‌صورت draft بازگردانده می‌شود.

ثبت تکراری `/media/source-access-requests` برای URL معادل در همان Media، با 409 رد می‌شود؛ وضعیت withdrawn مستثناست. کنترل زیر قفل Media است و ثبت هم‌زمان را پوشش می‌دهد. Media دیگر محدود نمی‌شود. کلید بررسی تکرار www/fragment/اسلش پایانی و ترتیب query را یکسان می‌کند؛ URL اصلی برای نمایش/کراول حفظ می‌شود. تکمیل راه‌اندازی با پیش‌نویس تکراری قدیمی نیز 409 می‌گیرد تا ادمین موارد اضافه را حذف کند.

`PATCH /api/v1/media/source-access-requests/:id` با بدنهٔ کامل نوع/URL/دسته مانند POST و مجوز source/update، پیش‌نویس همان Media را ویرایش می‌کند. وضعیت draft یا pending قدیمی و راه‌اندازی ناتمام لازم است. لینک معادل منبع دیگر 409، دستهٔ ناموجود/غیرفعال 400 و دسترسی Media دیگر 404 است. تغییر، audit می‌شود؛ در تغییر URL، sourceUrls سیاست‌های فعال همان Media و revision آن‌ها نیز اتمیک به‌روز می‌شوند. پس از تکمیل، ویرایش 409 می‌گیرد.
# معادل‌سازی دسته‌های منابع — فقط سوپر ادمین

## درخواست ایجاد رسانه

- `POST /api/v1/media/sources/:rowId/categories`: `{categoryIds: string[]}`؛ درخواست دسته‌های بیشتر برای منبع وب‌سایتِ رسانهٔ فعال. برای Subscription مجاز، درخواست مستقل pending ثبت می‌شود؛ برای درخواست باز منبع، همان درخواست افزایش می‌یابد. دستهٔ تکراری/قبلاً مجاز/pending رد می‌شود.
- `DELETE /api/v1/media/sources/:rowId`: حذف منبع از رسانهٔ فعال، غیرفعال‌کردن Subscription و لغو درخواست‌های باز؛ حذف سراسری Source نیست. `rowId` شناسهٔ کارت overview است؛ دسترسی رسانهٔ دیگر ۴۰۴ و نقش نامجاز ۴۰۳ است.
- درخواست‌های `category_extension` در API بررسی منابع با همان اقدام‌های `grant_existing` و `reject` بررسی می‌شوند؛ `queue_crawler` برای این نوع ۴۰۹ است. تأیید مجموعهٔ مجاز را افزایش می‌دهد و جایگزین نمی‌کند.

- `GET /api/v1/media/overview`: وضعیت درخواست، `canReadInbox`، درخواست‌ها و دسترسی‌های منابع، دسته‌های فعال فرم و خلاصهٔ فقط‌خواندنی سایت‌های رسانهٔ فعال. سایت در نبود صف ساخت به‌صورت `not_started` و پیش از تأیید به‌صورت `waiting_approval` نمایش داده می‌شود؛ `publicPath` فقط برای سایت آماده مجاز است.
- `GET /api/v1/articles`: برای ادمین پس از تأیید رسانه و حداقل یک اشتراک منبع فعال مجاز است؛ فهرست و آمار فقط منابع قابل ارائه و مجاز همان رسانه را شامل می‌شوند.

- `GET /api/v1/media/request`: وضعیت درخواست فقط برای رسانهٔ فعال نشست؛ draft/pending/approved/rejected، نسخه، زمان‌ها و یادداشت بررسی.
- `GET /api/v1/platform/media-requests?status=pending|approved|rejected|all&page=1&q=...`: فهرست ۲۰تایی برای سوپر ادمین، مشخصات رسانه/سایت/منابع/نام سردبیرها و شمار pending.
  هر عضو `sources` علاوه بر `url` و `sourceType`، دارای `categoryMode` و `categories: [{id, name}]` از دسته‌های همان درخواست منبع است. نام دستهٔ ناموجود `null` است؛ حالت `all` به معنی همهٔ دسته‌ها و دسته‌بندی برای منبع اجتماعی کاربرد ندارد.
- `PATCH /api/v1/platform/media-requests/:mediaId`: `{action: "approve"|"reject", expectedRevision, note?}`؛ دلیل رد حداقل سه نویسه. نقش نامجاز ۴۰۳، درخواست ناموجود ۴۰۴، تصمیم تکراری/نسخهٔ قدیمی ۴۰۹.
- ارسال نهایی `/api/v1/media/setup` درخواست را در تراکنش ذخیرهٔ فرم ثبت می‌کند. بدون approved عملیات اجرایی سایت و انتشار مجاز نیستند.

- `GET /api/v1/platform/category-mappings?status=pending|mapped|all&q=...&page=1`: فهرست ۲۰تایی، خلاصهٔ شمارها و دسته‌های فعال مقصد.
- `GET /api/v1/platform/category-mappings/summary`: شمار کل، معادل‌شده و بدون معادل.
- `PATCH /api/v1/platform/category-mappings/:id`: `{expectedRevision, categoryId}` یا `{expectedRevision, newCategory: {nameFa,nameEn,nameAr}}`. ساخت و اتصال اتمیک؛ نسخهٔ قدیمی ۴۰۹، دستهٔ غیرفعال/ورودی نامعتبر ۴۰۰.
- `GET /api/v1/platform/category-mappings/:id/history`: ۲۰ تغییر اخیر شامل معادل قبلی/جدید، تصمیم‌گیر و زمان.


### ادامهٔ دریافت پس از دیباگ کراولر

موفقیت `POST /api/v1/platform/sources/:id/debug` پس از gate دیباگ، نسخهٔ فعال و وضعیت Source را در تراکنش تغییر می‌دهد و یک run دریافت واقعی با trigger `schedule` و نسخهٔ جدید ثبت می‌کند. run دریافت correlation مستقل `debug-followup:<debugRunId>` دارد؛ audit آن به اجرای دیباگ پیوند می‌زند. Source قبلاً متوقف نیز فعال می‌شود؛ توقف حین اجرا، نتیجهٔ دیررس را لغو می‌کند. دیباگ ناموفق دریافت فوری تازه‌ای نمی‌سازد و نسخهٔ قبلی حفظ می‌شود. ADR-0038.

## منابع اجتماعی — ADR-0040

`POST /api/v1/platform/sources` در `adapterKey` علاوه بر `web` و `rss`، کلیدهای `aparat`, `bale`, `eitaa`, `facebook`, `instagram`, `rubika`, `rubino`, `shad`, `soroush`, `telegram`, `tiktok`, `x`, `youtube` را می‌پذیرد. ورودی نام، لینک HTTPS همان پلتفرم و فاصلهٔ دریافت است؛ پاسخ همان `sourceId/runId` و صف آزمون واقعی است. برای پلتفرم‌ها AI فراخوانی نمی‌شود. مسیر `build` آزمون مجدد adapter ثابت و `debug` فقط برای web است. دسترسی تمام عملیات Platform همچنان مختص سوپر ادمین است. DTO منبع همان `adapterKey` را برمی‌گرداند و هیچ مسیر پروفایل، cookie یا credential ندارد. شبکه‌های اجتماعی کاتالوگ دسته یا مانع معادل‌سازی دستهٔ وب‌سایت ایجاد نمی‌کنند. راهنمای نشست و وضعیت آزمون زنده در `docs/SOCIAL-BROWSER-CRAWLERS.md` است.


## آیدی و انتخاب شبکه در درخواست منبع ادمین — ADR-0041

در `POST /api/v1/media/source-access-requests` و `PATCH /api/v1/media/source-access-requests/:id`، منبع `social` فیلد اختیاری `platform` از کلیدهای ثبت‌شده دارد. مقدار `url` می‌تواند آیدی خام/با @ یا لینک کامل باشد؛ آیدی بدون شبکه پذیرفته نمی‌شود. سرور همان قواعد مشترک فرانت را اعمال، شبکهٔ ناسازگار را رد و لینک canonical و platform را ذخیره می‌کند. GET درخواست‌ها نیز platform را برمی‌گرداند. درخواست قدیمی شامل لینک کامل و بدون platform سازگار است. `website` همچنان HTTPS می‌خواهد و platform اجتماعی نمی‌پذیرد. این ورودی credential یا اتصال حساب نیست و ثبت آن به‌تنهایی crawl اجرا نمی‌کند.

## پنجرهٔ ورود اجتماعی روی میزبان — ADR-0042

`GET /api/v1/platform/social-browser-sessions` وضعیت پنجرهٔ هر شبکه و `interactiveLoginEnabled` را فقط به سوپر ادمین برمی‌گرداند. `POST /api/v1/platform/social-browser-sessions/:platform/open|close` بدنهٔ JSON خالی و Origin همان پنل یا trusted origin پیکربندی‌شده می‌خواهد؛ platform ثابت است و URL/command قابل ارسال نیست. پاسخ 202 وضعیت opening/open/closing/closed/failed است، نه authentication. باز/بستن audit می‌شود؛ دسترسی Media کافی نیست. در میزبان فاقد قابلیت ورود، open با 409 رد می‌شود؛ CLI با همان پروفایل روش جایگزین روی محیط گرافیکی میزبان است. cookie، شماره و مسیر پروفایل در DTO نیستند. پس از ورود باید آزمون موجود منبع اجرا شود؛ این endpoint به‌تنهایی Source یا Inbox را تغییر نمی‌دهد.
