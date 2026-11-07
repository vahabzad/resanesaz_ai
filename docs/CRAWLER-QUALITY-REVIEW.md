# بازبینی و بهبود ساخت و اصلاح کراولر

تاریخ: 2026-11-03

## مسیر واقعی و ضعف‌های مبنا

در `back/src/server/sources.ts`، `enqueueCrawlerBuild()` نسخهٔ draft و run می‌سازد. worker در `crawl-jobs.ts` با `buildCrawler()` در `crawler-builder.ts` صفحهٔ فهرست و صفحات داخلی را دریافت می‌کند. `generateRecipe()` شواهد را به Codex SDK می‌دهد؛ `crawler-recipe.ts` خروجی CSS اعلانی را با قرارداد نسخهٔ ۲ اعتبارسنجی می‌کند. پس از قبولی آزمون و کنترل لغو، worker نسخه را اتمیک فعال می‌کند. runtime در `web-crawler.ts` همان Recipe pinned را با دریافت امن، استخراج و ingestion عادی اجرا می‌کند؛ Codex در این مسیر دخالت ندارد.

پیش از تغییر، evidence اولیه از سه لینک بر اساس موقعیت و آزمون ساخت از حداکثر شش لینک انتخاب می‌شد. این انتخاب قالب آرشیوی یا نادر را جا می‌انداخت. داشتن عنوان و ۸۰ نویسه متن برای تأیید کافی نبود؛ کنترل ساخت و اجرای عادی یکسان نبودند. تشخیص selector و کیفیت متن جزئیات کافی نداشت و تکرار همان Recipe می‌توانست بودجهٔ اصلاح را مصرف کند. دیباگ از قبل نمونهٔ خطادار و پوشش کشف نسخهٔ قبلی را حفظ می‌کرد، اما این حفاظت برای بازسازی و تمام تلاش‌های میانی کافی نبود. بازسازی معمولی منبع را پیش از اثبات کیفیت نسخهٔ جایگزین غیرفعال می‌کرد.

## فایل‌ها و مسئولیت‌های نهایی

| فایل در `back/` | تغییر |
| --- | --- |
| `src/server/crawler-sampling.ts` | `candidateLinks`، `diverseLinks` و `pageLayout`: خانوادهٔ مسیر، تنوع DOM و نمونهٔ ابتدا/انتهای خانواده |
| `src/server/crawler-validation.ts` | `validateSample` و `extractionDiagnostics`: خطای مرحله‌دار و metric، پوشش متن، آلودگی، حذف، عنوان، دسته و HTML؛ `contentWitness` برای حفاظت متن سالم |
| `src/server/crawler-evidence.ts` | `pageEvidence`: ظرف‌های واقعی/selectorهای قبلی، عنوان، breadcrumb و لینک‌های پالایش‌شده با سقف حجم |
| `src/server/crawler-repair.ts` | `repairPlan`، `targetedRecipe` و `recipeFingerprint`: تشخیص اصلاح صرفاً دسته‌بندی، حفظ سایر فیلدها و توقف تکرار |
| `src/server/crawler-builder.ts` | orchestration بودجه‌دار، prompt، cache، مجموعهٔ اجباری و baseline تجمعی، گزارش توقف و مصرف درخواست |
| `src/server/web-crawler.ts` | انتخاب دادهٔ ساختاریافتهٔ همان URL/عنوان، ظرف متن مشترک و همان quality gate در runtime؛ ثبت علت مشخص بدون فراخوانی مدل |
| `src/server/sources.ts` و `crawl-jobs.ts` | انتقال سابقه به build و debug، حفظ نسخهٔ فعال در شکست/لغو/stall بازسازی |
| `contracts/src/sources.ts` | فیلدهای اختیاری تشخیص، نمونه‌برداری، خطای کشف و علت توقف؛ سازگاری خواندن نسخهٔ قدیمی |
| `tests/crawler-quality.test.ts` | fixtureهای مستقل از شبکه برای سناریوهای کیفیت/اصلاح/بودجه/runtime/RSS |
| `tests/crawler-builder.test.ts` و `tests/platform-api.test.ts` | انتظار توقف الگوی تکراری و حفظ منبع/نسخهٔ فعال در شکست بازسازی |
| `scripts/evaluate-crawler-quality.ts` | ارزیابی زندهٔ جدا از دیتابیس با حالت ساخت، repair و runtime |

`generateRecipe()` اکنون Recipe قبلی، تشخیص‌ها، selector match/طول متن، نمونه‌های سالم، قالب صفحات و شواهد HTML محدود را دریافت می‌کند. خطای دریافت با تغییر CSS اصلاح‌شده تلقی نمی‌شود. مراحل تحلیل، تولید، آزمون دسته‌بندی/استخراج و اصلاح، پیام فارسی و کد مشخص دارند. تنظیم بودجه‌ها در `.env.example` و تصمیم کامل در ADR-0039 است.

## آزمون و محدودیت

قبولی fixture یا نمونه‌برداری، تضمین کل سایت و قالب‌های آینده نیست. معیارهای پوشش، آلودگی و تشخیص قالب heuristic هستند؛ metadata ناقص یا اشتباه می‌تواند نیازمند بررسی انسانی باشد. runtime مرورگر/JavaScript ندارد و مانع HTTP را با selector دور نمی‌زند. نگه‌داشتن صفحات اجباری ممکن است باعث رد نسخه در برابر خطای موقت سایت شود؛ چنین خطایی به‌عنوان موفقیت پنهان نمی‌شود.

هر ۸۹ آزمون Backend، typecheck Backend/contracts/worker و ۱۲ آزمون Front، lint و build واقعی Next.js پاس شدند. پس از تکمیل کنترل لایوبلاگ و همگام‌سازی Recipe آخر در feedback، آزمون‌های مرتبط دوباره اجرا شدند. fixtureها تمام سناریوهای مأموریت از تک/چندقالبی، متن ناقص/اضافی، دسته‌بندی، شبکه، اصلاح موفق/ناموفق و regression تا حفظ نسخهٔ فعال را پوشش می‌دهند؛ runtime/RSS بدون generate مدل نیز آزموده شده‌اند.

ارزیابی زندهٔ جداگانهٔ الجزیره ضعف واقعی را بازتولید کرد: از ۳۲ لینک، ۳۱ خبر استخراج شدند و یک لایوبلاگ آرشیوی متن نداشت. اصلاح سه‌مرحله‌ای، پیش از تکمیل gate لایوبلاگ آن را به‌اشتباه با ۸۲ نویسه خلاصه موفق تشخیص می‌داد. کنترل جدید `LIVEBLOG_SUMMARY_ONLY` همان خروجی را صریحاً رد کرد. اجرای repair با خطای مشخص، به‌دلیل Recipe مؤثر تکراری در تلاش دوم با `NO_REPAIR_PROGRESS` شکست خورد؛ موفقیت اصلاح کامل این سایت ادعا نمی‌شود.

بررسی مستقیم HTML همان صفحه نشان داد فقط خلاصهٔ ۸۲ نویسه‌ای، کپشن و پیام بسته‌شدن پوشش زنده وجود دارد و `liveBlogUpdate` صفر است. gate نهایی علاوه بر خلاصه‌بودن، `LIVEBLOG_UPDATES_UNAVAILABLE` با `repairable:false` گزارش کرد. این مشاهده باعث افزودن نمونهٔ انتهای خانوادهٔ قالب، fixture خلاصه و پوشش بسته‌شده شد؛ پوشش بسته‌شده‌ای که واقعاً متن به‌روزرسانی داشته باشد صرفاً به‌خاطر پیام بسته‌شدن رد نمی‌شود. runtime فعلی متن غایب از HTML را با CSS بازیابی نمی‌کند؛ توسعهٔ adapter داده یا رندر، کار جداگانه با بازبینی امنیتی است.

شواهد محلی: `evaluation-1793694696795.json` (قبولی پیش از gate نهایی)، `runtime-evaluation-1793695096156.json` (۳۱ موفق/۱ رد خلاصه) و `evaluation-1793695122169.json` (توقف اصلاح تکراری) در `back/.data/crawler-analysis/`. هیچ نسخه‌ای در محصول با این ارزیابی‌ها فعال و هیچ نمونه‌ای وارد Inbox نشده است.

برای تکرار زنده از مسیر `back`:

```powershell
node --import tsx scripts/evaluate-crawler-quality.ts https://www.aljazeera.com/
node --import tsx scripts/evaluate-crawler-quality.ts --runtime .data/crawler-analysis/evaluation-<timestamp>.json
node --import tsx scripts/evaluate-crawler-quality.ts https://www.aljazeera.com/ --repair .data/crawler-analysis/evaluation-<timestamp>.json .data/crawler-analysis/runtime-evaluation-<timestamp>.json
```

ساخت/repair از Codex واقعی و شبکه استفاده می‌کند؛ artifact خروجی و آزمون runtime به‌خودی‌خود اجازهٔ فعال‌سازی نسخه نیستند. آزمون‌های fixture وابسته به شبکه نیستند. اعتبار داده‌های همان روز قابل تعمیم به تغییرات بعدی سایت نیست.
