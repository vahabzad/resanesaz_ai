# واژه‌نامه و مدل دامنه

| مفهوم | Scope | تعریف | مالکیت/رابطهٔ مهم |
|---|---|---|---|
| Super Admin | Platform | نقش محصولی مدیریت ادمین‌ها، دسترسی منابع، کاتالوگ دسته‌بندی و نگاشت آن‌ها | تصمیم‌ها و تغییر مجوزها ممیزی می‌شوند |
| Admin (Editor-in-chief) | Platform / Media | نقش محصولی سردبیر؛ درخواست منابع می‌دهد و یک یا چند Media را اداره می‌کند | اختیارات هر عملیات با Permissionهای Backend و scope همان داده کنترل می‌شود |
| Platform Admin | Platform | مدیر رسانه‌ساز، کاتالوگ، crawlerها، workerها و سلامت کل سامانه | خارج از عضویت یک Media و دارای مجوزهای سراسری مستقل |
| Media | Platform | یک برند یا تحریریهٔ مستقل | مرز اصلی جداسازی داده‌های تحریریه و انتشار |
| Membership | Media | عضویت کاربر در یک رسانه همراه preset نقش و Permissionهای مؤثر | User × Media |
| Permission Grant | Media | مجوز داده‌محور یک کاربر برای عملیات مشخص | اعطا فقط در محدودهٔ مجاز مدیر رسانه |
| Source | Platform | ورودی خبری آماده مانند سایت، RSS یا کانال/صفحهٔ اجتماعی با کراولر مرورگری ثابت | سراسری؛ توسط Platform Admin مدیریت می‌شود |
| Media Source Subscription | Media | انتخاب یک Source آماده برای یک Media | Media × Source؛ اجرای crawler را تکثیر نمی‌کند |
| Source Access Request | Platform | درخواست ادمین برای دسترسی یا ساخت کراولر یک Source | draft پیش از تکمیل راه‌اندازی؛ pending پس از ارسال نهایی؛ rejected، crawler_queued، crawler_failed یا access_granted پس از بررسی؛ withdrawn برای حذف منطقی پیش‌نویس؛ تصمیم و زمان‌ها ممیزی‌پذیرند |
| Source Category | Platform | نام/شناسهٔ دسته‌بندی استخراج‌شده از یک Source | هویت دسته در محدودهٔ Source یکتا است |
| Platform Category | Platform | دسته‌بندی داخلی با نام فارسی، انگلیسی و عربی که سوپر ادمین مدیریت می‌کند | گزینهٔ دسته در درخواست وب‌سایت و مقصد نگاشت دسته‌های خام |
| Category Mapping | Platform | نگاشت یک دسته‌بندی خام Source به دسته‌بندی داخلی | توسط سوپر ادمین مدیریت می‌شود؛ نام خام منبع حفظ می‌شود |
| Media Source Selection | Media | انتخاب Source و دسته‌بندی‌های مجاز برای دریافت در یک Media | پیش‌فرض کلی یا override به‌ازای هر Source |
| Crawler Definition | Platform | تعریف قابل اجرا برای استخراج از Source | هر Source یک تعریف فعال دارد |
| Crawler Version | Platform | نسخهٔ immutable recipe/config کراولر | فقط نسخهٔ آزموده‌شده فعال می‌شود |
| Crawl Run | Platform | اجرای مشخص crawler در worker | دارای وضعیت، شمارنده، correlation و log ساختاریافته |
| Platform Raw Article | Platform | محتوای immutable استخراج‌شده از Source | یک‌بار ذخیره و در Mediaهای مشترک توزیع می‌شود |
| Media Inbox Item | Media | نمای یک Platform Raw Article در Inbox رسانه | وضعیت بررسی و تصمیم‌های رسانه را جدا نگه می‌دارد |
| Story | Media | موضوع/رویداد canonical که ممکن است چند منبع داشته باشد | ظرف اصلی تحریریه |
| Section | Media | بخش سلسله‌مراتبی تحریریه | مستقل از placement سایت |
| Editorial Policy | Media | لحن، مخاطب، قواعد و سطح خودکارسازی | نسخه‌دار برای هر Media |
| Platform Editorial Config | Platform | قواعد پایه و کاتالوگ جناح‌ها/تعریف دیدگاه | نسخه‌دار؛ فقط ادمین پلتفرم می‌نویسد |
| Editorial Service Settings | Media | تنظیم ورودی، جهت نگارش و قالب اجتماعی سرویس توسط سردبیر | منابع/دسته‌بندی، جناح مجاز و شدت/طنز/رسمیت؛ ترکیب متن پست، سقف طول، تصویر و متن ثابت؛ snapshot در Policy هر نسخه |
| Article Version | Media | نسخهٔ ویراستاری‌شدهٔ Story | نسخهٔ تأییدشده immutable است |
| Approval | Media | تصمیم تأیید، رد یا بازگشت برای اصلاح | با actor، timestamp و policy version |
| Editorial Job | Media | کار پایدار تحریر با snapshot منبع و سیاست | صف/claim/lease؛ کلید یکتای رسانه × سرویس × خبر؛ اجرای دستی یا خودکار |
| Ready Repository | Media | مخزن نسخه‌های آمادهٔ بررسی یا انتشار | `ready` خروجی تحریرشده نیازمند تأیید و `approved` نسخهٔ تأیید انسانی؛ انتشار فقط approved |
| Rendition | Media | خروجی Social، Web Card یا Web Full از Article canonical | نسخه‌دار و مستقل از Layout سایت |
| Media Site | Media | سایت داخلی رسانه با slug ثابت، draft/live spec و وضعیت مستقل | مدیریت با destination permission؛ آدرس عمومی فقط در حالت live |
| Site Spec | Media | هویت، چیدمان و بلوک‌های مرتب با قواعد Section | draft از live مستقل؛ مالک محتوای canonical نیست |
| Site Article | Media | snapshot وبِ واقعاً منتشرشده روی یک سایت | Site × Story یکتا؛ WebCard و WebFull از یک نسخهٔ تأییدشده |
| Destination | Media | محل انتشار؛ Website، Channel یا Social Account | متعلق به Media |
| Connection | Media | credential و تنظیمات فنی مقصد | محرمانه و جدا از Destination عمومی |
| Publication Job | Media | درخواست idempotent انتشار یک Rendition | قابل زمان‌بندی، retry و cancel |
| Publication Result | Media | نتیجهٔ تلاش انتشار و شناسهٔ مقصد | موفق، ناموفق یا نیازمند اقدام |
| Audit Event | Platform/Media | ردپای عملیات حساس | دارای `scopeType` و `scopeId`؛ برای Media شامل `mediaId` |

## قواعد مدل

- هر موجودیت scope صریح Platform یا Media دارد؛ الزام کور `mediaId` برای دادهٔ سراسری ممنوع است.
- Source، Crawler Definition/Version، Crawl Run و Platform Raw Article فقط یک‌بار در Platform ساخته می‌شوند.
- Subscription و Media Inbox Item تنها پل توزیع دادهٔ ingestion به Media هستند.
- توقف یا حذف Subscription نباید Source سراسری یا دادهٔ Mediaهای دیگر را تغییر دهد.
- Raw Article و Story یکی نیستند؛ چند Raw Article می‌توانند به یک Story مربوط باشند.
- Article Version تأییدشده هنگام انتشار تغییر نمی‌کند؛ اصلاح، نسخهٔ جدید می‌سازد.
- Connection اسرار را نگه می‌دارد؛ Destination فقط اطلاعات قابل نمایش را ارائه می‌دهد.
- Publication Job باید idempotency key داشته باشد تا retry موجب انتشار تکراری نشود.
