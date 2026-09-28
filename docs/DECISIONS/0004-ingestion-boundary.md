# ADR-0004: مرز دریافت خبر و اولین RSS Adapter

تاریخ: 2026-09-28

وضعیت: پذیرفته‌شده

## زمینه

فاز دوم باید خبر واقعی را وارد Inbox کند، بدون اینکه هسته به endpointها، فایل‌ها یا UI پروژهٔ CrawlerGenerator وابسته شود. ورودی شبکه و محتوای خبر نیز نامطمئن‌اند و خطر SSRF، محتوای بیش‌ازحد، تکرار و عبور از مرز Media دارند.

## تصمیم

- هسته مالک مدل‌های canonical شامل Source، Crawler Definition، Crawler Version، Crawl Run و Raw Article است.
- هر رکورد کسب‌وکاری `mediaId` دارد و queryها علاوه بر شناسهٔ رکورد با Media فعال محدود می‌شوند.
- CrawlerGenerator adapter اصلی منابع صفحهٔ سایت در قرارداد `v1` است؛ RSS فقط adapter ساده و اختیاری باقی می‌ماند.
- recipe یا خروجی بازو مستقیماً مدل canonical یا مجوزهای هسته را تعیین نمی‌کند.
- دریافت URL فقط با HTTPS عمومی، DNS/IP revalidation، redirect دستی محدود، timeout ده‌ثانیه و سقف پاسخ دو مگابایت انجام می‌شود.
- Raw Article با hash پایدار در محدودهٔ Media و Source deduplicate و provenance اجرای خود را نگه می‌دارد.
- اجرای دستی در اولین vertical slice همگام بود؛ مطابق ADR-0005 اکنون API فقط job را صف‌بندی می‌کند و worker آن را اجرا می‌کند.

## پیامدها

- Inbox خروجی صفحهٔ سایت را با متن، HTML نامطمئن، تصویر، نویسنده، دسته‌ها و برچسب‌های CrawlerGenerator در مدل canonical نگه می‌دارد.
- یک retry همان feed رکورد تکراری ایجاد نمی‌کند.
- مسیر RSS و adapterهای بعدی باید از صف و worker مشترک استفاده کنند.
- URL مقصد مقاله ذخیره می‌شود اما محتوای آن خودکار fetch یا trusted نمی‌شود.
