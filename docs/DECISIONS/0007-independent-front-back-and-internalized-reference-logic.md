# ADR-0007: جداسازی Frontend/Backend و داخلی‌سازی منطق پروژه‌های مرجع

تاریخ: 2026-10-03

وضعیت: پذیرفته‌شده؛ جایگزین بخش‌های متعارض ADR-0001، ADR-0003، ADR-0004، ADR-0005 و ADR-0006

## زمینه

نسخهٔ اولیه برای رسیدن سریع به vertical slice، API، auth، دیتابیس و worker را داخل برنامهٔ Next.js قرار داد و CrawlerGenerator را به‌عنوان سرویس مستقل runtime فراخوانی کرد. هدف واقعی پروژه این است که Frontend و Backend مستقل توسعه یابند و سه پروژهٔ قبلی صرفاً نمونه‌های آزمایشی برای کشف منطق و promptهای مرجع باشند.

همچنین Source و crawl باید در سطح Platform اجرا شوند تا چند Media از یک دریافت مشترک استفاده کنند.

## تصمیم

- `front` برنامهٔ مستقل Next.js و فقط مصرف‌کنندهٔ API است.
- `back` سرویس مستقل Node.js و مالک auth، دیتابیس، دامنه، API و orchestration است.
- `back/worker` process مستقل اجرای jobهاست.
- پروژه‌های CrawlerGenerator، sardabir و News-website-builder در runtime فراخوانی یا import نمی‌شوند.
- منطق و prompt لازم پس از مطالعه و آزمون، در ماژول‌های Backend بازطراحی می‌شوند.
- Source، Crawler Definition/Version، Crawl Run و Raw Article Platform-scoped هستند.
- Media از طریق Media Source Subscription منبع آماده را انتخاب می‌کند و از طریق Media Inbox Item خبر را دریافت می‌کند.
- عملیات Platform Admin از Permissionهای Media جدا و deny-by-default است.

## پیامدها

- Frontend و Backend جداگانه build، test و deploy می‌شوند.
- اجرای محصول به clone یا API پروژه‌های مرجع وابسته نیست.
- اجرای crawler برای Mediaهای مشترک تکثیر نمی‌شود.
- migration دادهٔ tenant-scoped قدیمی باید Subscription و Inbox Item متناظر بسازد.
- adapterهای قبلی پروژه‌های مرجع حذف می‌شوند؛ adapter فقط برای سرویس خارجی واقعی باقی می‌ماند.
- تغییرات بعدی UI باید component-based باشند و فایل صفحه صرفاً composition انجام دهد.
