# ADR-0004: مرز دریافت خبر و اولین RSS Adapter

تاریخ: 2026-09-28

وضعیت: پذیرفته‌شده

## زمینه

فاز دوم باید خبر واقعی را وارد Inbox کند، بدون اینکه هسته به endpointها، فایل‌ها یا UI پروژهٔ CrawlerGenerator وابسته شود. ورودی شبکه و محتوای خبر نیز نامطمئن‌اند و خطر SSRF، محتوای بیش‌ازحد، تکرار و عبور از مرز Media دارند.

## تصمیم

- هسته مالک مدل‌های canonical شامل Source، Crawler Definition، Crawler Version، Crawl Run و Raw Article است.
- هر رکورد کسب‌وکاری `mediaId` دارد و queryها علاوه بر شناسهٔ رکورد با Media فعال محدود می‌شوند.
- RSS نخستین adapter با قرارداد نسخهٔ `v1` است؛ CrawlerGenerator در مرحلهٔ بعد پشت همین مرز به‌عنوان adapter/worker اضافه می‌شود.
- recipe یا خروجی بازو مستقیماً مدل canonical یا مجوزهای هسته را تعیین نمی‌کند.
- دریافت URL فقط با HTTPS عمومی، DNS/IP revalidation، redirect دستی محدود، timeout ده‌ثانیه و سقف پاسخ دو مگابایت انجام می‌شود.
- Raw Article با hash پایدار در محدودهٔ Media و Source deduplicate و provenance اجرای خود را نگه می‌دارد.
- اجرای دستی در این vertical slice همگام است؛ انتقال اجراهای طولانی به worker/queue قدم بعدی است.

## پیامدها

- Inbox می‌تواند پیش از اتصال CrawlerGenerator با دادهٔ واقعی و قرارداد نهایی‌نما توسعه یابد.
- یک retry همان feed رکورد تکراری ایجاد نمی‌کند.
- اجرای همگام برای منابع کند مقیاس‌پذیر نیست و پیش از scheduler عمومی باید به job worker منتقل شود.
- URL مقصد مقاله ذخیره می‌شود اما محتوای آن خودکار fetch یا trusted نمی‌شود.
