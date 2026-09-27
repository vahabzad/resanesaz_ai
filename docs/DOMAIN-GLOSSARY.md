# واژه‌نامه و مدل دامنه

| مفهوم | تعریف | مالکیت/رابطهٔ مهم |
|---|---|---|
| Media | یک برند یا تحریریهٔ مستقل | مرز اصلی جداسازی داده‌ها |
| Membership | عضویت کاربر در یک رسانه همراه نقش | User × Media |
| Source | ورودی خبری مانند سایت، فید یا کانال | متعلق به Media |
| Crawler | تعریف قابل اجرا برای استخراج از Source | نسخه‌دار و قابل پایش |
| Crawl Run | یک اجرای مشخص کراولر | دارای زمان، وضعیت، آمار و خطا |
| Raw Article | محتوای استخراج‌شده بدون مداخلهٔ تحریریه | immutable تا حد ممکن |
| Story | موضوع/رویداد canonical که ممکن است چند منبع داشته باشد | ظرف اصلی تحریریه |
| Editorial Policy | لحن، مخاطب، قواعد، خطوط قرمز و سطح خودکارسازی | نسخه‌دار برای هر Media |
| Article Version | یک نسخهٔ ویراستاری‌شده از Story | تاریخچه و سازنده محفوظ است |
| Approval | تصمیم تأیید، رد یا بازگشت برای اصلاح | با actor و timestamp |
| Destination | محل انتشار؛ Website، Channel یا Social Account | متعلق به Media |
| Connection | credential و تنظیمات فنی مقصد | محرمانه و جدا از Destination عمومی |
| Rendition | نمایش متناسب یک Article برای یک Destination | متن، تصویر، هشتگ و metadata |
| Publication Job | درخواست idempotent انتشار یک Rendition | قابل زمان‌بندی و retry |
| Publication Result | نتیجهٔ تلاش انتشار و شناسهٔ محتوای مقصد | موفق، ناموفق یا نیازمند اقدام |
| Audit Event | ردپای غیرقابل‌انکار عملیات حساس | actor، scope، action و metadata امن |

## قواعد مدل

- هر رکورد کسب‌وکاری باید `mediaId` داشته باشد یا از والد خود به‌طور قطعی به Media متصل باشد.
- Raw Article و Story یکی نیستند؛ چند Raw Article می‌توانند به یک Story مربوط باشند.
- Article Version نباید هنگام انتشار تغییر کند؛ اصلاح جدید، نسخهٔ جدید می‌سازد.
- Connection اسرار را نگه می‌دارد؛ Destination فقط اطلاعات قابل نمایش را ارائه می‌دهد.
- Publication Job باید idempotency key داشته باشد تا retry موجب انتشار تکراری نشود.

