# مبنای امنیت

این سند جای تست نفوذ را نمی‌گیرد؛ حداقل‌هایی است که باید از اولین تصمیم معماری رعایت شوند.

## دارایی‌های حساس

- credential بات‌ها و شبکه‌های اجتماعی
- نشست/کلید Codex و سرویس‌های مدل
- داده و سیاست تحریریهٔ هر رسانه
- پیش‌نویس‌های منتشرنشده
- حساب کاربران و نقش‌ها
- کد تولیدشدهٔ سایت و crawler
- Audit Log و سابقهٔ انتشار

## مرزهای اعتماد

- تمام HTML، JSON و متن دریافت‌شده از منابع بیرونی نامطمئن است.
- خروجی مدل نامطمئن است تا schema validation و policy check را پاس کند.
- پروژه‌های مرجع trusted-by-default نیستند و پشت adapter اجرا می‌شوند.
- مرورگر و dashboard نباید به secrets یا مسیرهای محلی worker دسترسی پیدا کنند.

## تهدیدهای اولویت‌دار

- Prompt Injection از متن خبر یا صفحهٔ منبع
- SSRF هنگام crawl یا fetch URL کاربر
- عبور از مرز Media و دسترسی به دادهٔ رسانهٔ دیگر
- افشای token در log، error، export یا frontend bundle
- انتشار تکراری بر اثر retry
- سوءاستفاده از تولید/اجرای کد و child process
- XSS از `contentHtml` کراول‌شده یا preview سایت
- takeover بات/کانال و انتشار غیرمجاز
- وابستگی آلوده و secret commit‌شده

## کنترل‌های الزامی از ابتدا

- tenant scoping در query و authorization، نه فقط فیلتر UI
- RBAC و deny-by-default برای عملیات انتشار و مدیریت credential
- secret manager یا encryption-at-rest با امکان rotation
- URL allow/deny policy، DNS/IP revalidation و block شبکه‌های خصوصی برای crawler
- sanitize کردن HTML و جداسازی preview با origin/CSP مناسب
- جداسازی «دادهٔ منبع» از «دستور مدل» در prompt و pipeline
- schema validation و محدودیت اندازه در همهٔ مرزها
- idempotency key برای انتشار و ingestion
- Audit Event برای ورود، تغییر policy، اتصال مقصد، تأیید و انتشار
- rate limit، timeout، concurrency limit و kill switch
- عدم ثبت prompt خام یا محتوای حساس مگر با سیاست retention روشن

## یافته‌های اولیه در پروژه‌های مرجع

- News-website-builder احراز هویت، bcrypt، JWT، Helmet، rate limiting و بررسی نوع فایل دارد، ولی ذخیره‌سازی آن فایل‌محور و مناسب MVP محلی است.
- CrawlerGenerator کنترل URL عمومی و اعتبارسنجی recipe دارد، اما endpointهای فعلی احراز هویت ندارند و CORS باز است؛ برای اتصال مستقیم production مناسب نیست.
- sardabir endpointهای فعلی احراز هویت ندارند و ذخیره‌سازی فایل‌محور است؛ جداسازی Media و مجوزها هنوز وجود ندارد.
- هر سه بازو کارهای طولانی و دسترسی‌های حساسی دارند؛ باید پشت هسته و workerهای محدودشده قرار گیرند.

این‌ها گزارش آسیب‌پذیری قطعی نیستند؛ یافته‌های معماری برای طراحی نسخهٔ جدیدند.

## برنامهٔ آزمون

1. threat modeling پیش از ساخت auth و publishing
2. تست واحد authorization و tenant isolation همراه هر feature
3. secret/dependency/static scanning در CI
4. تست integration برای SSRF، XSS، replay و duplicate publish
5. تست نفوذ API، worker و deployment پیش از production
6. retest پس از اصلاح و پیش از هر عرضهٔ عمده

