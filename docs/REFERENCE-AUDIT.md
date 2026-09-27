# بررسی پروژه‌های مرجع

تاریخ بررسی: 2026-09-27

روش: clone کم‌عمق و بررسی read-only کد، README، manifestها، routeها، schemaها و مدل ذخیره‌سازی. UIهای موجود فقط برای تشخیص مرز پروژه دیده شدند و مبنای طراحی محصول جدید نیستند.

## News-website-builder

- منبع: <https://github.com/vahabzad/News-website-builder>
- commit بررسی‌شده: `568a43a` — 2026-09-12
- فناوری: Next.js 16، React 19، Express 5، TypeScript، Codex SDK
- توانایی موجود: ثبت‌نام/ورود محلی، تعریف spec سایت، تولید و ادامهٔ پروژه، preview و دانلود zip
- مدل اجرا: برای هر سایت workspace و Git repository مستقل می‌سازد
- ذخیره‌سازی: JSON فایل‌محور برای users/projects
- کنترل‌های موجود: bcrypt، JWT، rate limit احراز هویت، Helmet، CORS محدود، validation با Zod و بررسی نوع لوگو
- شکاف با محصول جدید: Media/RBAC مرکزی، lifecycle استقرار سایت، قرارداد دریافت خبر، مقیاس‌پذیری job و ذخیره‌سازی production

نتیجه: موتور تولید سایت و مدیریت progress قابل استخراج است؛ API و مدل دادهٔ فعلی نباید هستهٔ پلتفرم شوند.

## CrawlerGenerator

- منبع: <https://github.com/vahabzad/CrawlerGenerator>
- commit بررسی‌شده: `10d1f37` — 2026-09-26
- فناوری: React/Vite، Express 5، TypeScript، Playwright، Cheerio، Codex SDK
- توانایی موجود: کشف روش استخراج از HTML/embedded JSON/API/rendered DOM، تولید recipe محدود و بستهٔ crawler مستقل، تست زندهٔ چند خبر، اجرای کامل و خروجی JSON
- دادهٔ خروجی: listing، items، errors، title، content/contentHtml، image، category، tag، author و publishedAt
- نکتهٔ مثبت: کد آزاد مدل مستقیماً اجرا نمی‌شود؛ دادهٔ schema-validated به runtime بررسی‌شده تزریق می‌شود و نسخه فقط بعد از تست فعال می‌شود
- ذخیره‌سازی: generated folders، output JSON، log JSONL و state فایل‌محور؛ PostgreSQL/Redis در compose هستند ولی در جریان اصلی استفاده نمی‌شوند
- شکاف با محصول جدید: auth، Media ownership، scheduler مرکزی، ingestion contract، deduplication، retention و isolation اجرای crawler

نتیجه: بالغ‌ترین بازوی مرجع برای تبدیل‌شدن به worker/adapter است، اما endpointهای فعلی نباید مستقیم در معرض اینترنت قرار گیرند.

## sardabir

- منبع: <https://github.com/vahabzad/sardabir>
- commit بررسی‌شده: `a002a24` — 2026-09-26
- فناوری: Next.js 16، React 19، Express 5، TypeScript، Codex SDK
- توانایی موجود: دریافت URL/متن، تولید خبر، streaming progress، preview prompt، ذخیرهٔ مقاله و نسخه‌ها، پروفایل‌های گرایش/لحن
- مدل دادهٔ فعلی: subject، headline، lead، body، sources، versions، settings، usage و status
- ذخیره‌سازی: JSON و فایل‌های prompt
- شکاف با محصول جدید: auth/RBAC، Media ownership، Story/Raw Article جدا، approval workflow، provenance دقیق، sanitization و integration با publication

نتیجه: منطق generation، version و bias profile ارزشمند است؛ مفهوم «گرایش» باید در محصول جدید به Editorial Policy نسخه‌دار و قابل audit ارتقا پیدا کند.

## جمع‌بندی مشترک

- هم‌پوشانی فناوری TypeScript/Node ادغام فنی را آسان می‌کند.
- هر سه پروژه برای MVP محلی ساخته شده‌اند و فایل‌محورند.
- دو پروژه به Codex SDK محلی و نشست سیستم وابسته‌اند؛ مدل production و حساب‌دهی مصرف باید جداگانه طراحی شود.
- هیچ‌کدام به‌تنهایی مدل چندرسانه‌ای، گردش کار یکپارچه یا انتشار چندمقصدی را پوشش نمی‌دهند.
- روش مناسب، حفظ منطق مفید پشت adapterها و ساخت یک Control Plane جدید است؛ نه اتصال مستقیم UI جدید به endpointهای فعلی.

