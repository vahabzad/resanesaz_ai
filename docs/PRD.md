# سند نیازمندی‌های محصول (PRD) — اتاق فرمان رسانه

| مشخصه | مقدار |
|---|---|
| وضعیت سند | نسخهٔ ۲ — بازطراحی معماری و نقش‌ها |
| آخرین به‌روزرسانی | ۱۴۰۵/۰۷/۱۱ (2026-10-03) |
| مالک محصول | تعیین‌نشده |
| مرحلهٔ فعلی توسعه | فاز ۲ — دریافت خبر و کراولر |
| اسناد بالادستی | `PRODUCT-BLUEPRINT.md`، `DOMAIN-GLOSSARY.md`، `ROADMAP.md` |

## ۱. خلاصهٔ اجرایی

«اتاق فرمان رسانه» یک پلتفرم فارسی و چندرسانه‌ای برای ساخت، راه‌اندازی و ادارهٔ چرخهٔ کامل یک رسانه است. تیم رسانه در یک محیط واحد منابع خبری آماده را انتخاب می‌کند، خبر خام را دریافت و پالایش می‌کند، آن را وارد جریان تحریریه می‌سازد، خروجی مناسب وب و شبکه‌های اجتماعی را تأیید می‌کند و روی سایت و کانال‌های اجتماعی منتشر می‌کند.

محصول به دو سطح اصلی تقسیم می‌شود: **سطح مدیریت پلتفرم** برای ادارهٔ رسانه‌ساز، رسانه‌ها، مدیران رسانه، کاتالوگ کراولرها و سلامت سیستم؛ و **سطح هر رسانه** برای ادارهٔ منابع، تحریریه، سایت، انتشار، کاربران و دسترسی‌های همان رسانه.

منطق Backend ابزارهای مرجع قبلی شامل CrawlerGenerator، sardabir و News-website-builder باید به Backend اصلی محصول منتقل و بازطراحی شود. این ابزارها صرفاً منبع مرجع برای استخراج منطق و قابلیت‌ها هستند و در معماری نهایی به‌عنوان Backend مستقل runtime استفاده نمی‌شوند. Frontend و Backend محصول نیز مستقل از یکدیگر توسعه می‌یابند و Frontend فقط از طریق APIهای نسخه‌دار با Backend ارتباط دارد.

## ۲. مسئله و فرصت

راه‌اندازی و ادارهٔ یک رسانهٔ خبری معمولاً به ابزارهای جدا برای جمع‌آوری خبر، کار تحریریه، تولید سایت، مدیریت شبکه‌های اجتماعی و پایش خطا وابسته است. نتیجه، انتقال دستی محتوا، نبود دید یکپارچه، انتشار تکراری، دشواری کنترل دسترسی و از دست رفتن سابقهٔ تصمیم‌هاست.

فرصت محصول این است که یک Control Plane واحد فراهم کند تا تیم رسانه:

- در کمتر از چند ثانیه وضعیت چرخهٔ خبر و موارد نیازمند اقدام را ببیند؛
- از منبع تا خروجی منتشرشده، منشأ و تاریخچهٔ هر خبر را ردیابی کند؛
- یک محتوای canonical را با rendition مناسب در چند مقصد منتشر کند؛
- خطاهای دریافت یا انتشار را بدون ایجاد نسخهٔ تکراری بازیابی کند؛
- رسانه‌ها، اعضا و credentialها را با مرز امنیتی روشن اداره کند.

## ۳. اهداف محصول

### اهداف MVP

1. دریافت قابل اتکای خبر واقعی از منابع وب و ورود آن به Inbox رسانه.
2. تبدیل خبر خام به Story و نسخهٔ ویراستاری‌شده با تأیید انسانی.
3. انتشار idempotent خبر تأییدشده روی حداقل یک سایت و یک نوع کانال اجتماعی.
4. نمایش سلامت، پیشرفت، خطا و امکان تلاش مجدد در کل مسیر.
5. اعمال جداسازی دادهٔ رسانه‌ها، نقش‌ها و Audit Log در تمام عملیات حساس.

### اهداف غیرکمی نسخهٔ اول

- کاهش جابه‌جایی دستی بین ابزارها و فایل‌ها.
- بالا بردن اعتماد سردبیر به منشأ، نسخه و وضعیت هر محتوا.
- ساختن پایه‌ای که adapter یا مقصد تازه بدون تغییر هسته به آن افزوده شود.

### خارج از MVP

- پشتیبانی هم‌زمان از همهٔ شبکه‌های اجتماعی؛
- انتشار کاملاً خودکار و بدون کنترل ایمنی؛
- تحلیل پیشرفتهٔ درآمد، تبلیغات یا پیشنهاد محتوا؛
- اپلیکیشن موبایل بومی؛
- بازار عمومی قالب‌ها و افزونه‌ها؛
- بازنویسی یا گسترش قابلیت‌هایی که خارج از نیازهای مصوب MVP در حوزهٔ crawler، سردبیر یا سایت‌ساز هستند.

## ۴. کاربران و نیازهای اصلی

### ۴.۱ سطح پلتفرم

| پرسونا | نیاز اصلی | نتیجهٔ مورد انتظار |
|---|---|---|
| ادمین سیستم / Platform Admin | مدیریت رسانه‌ساز، رسانه‌ها، مدیران رسانه، کاتالوگ کراولرها و سلامت کل سامانه | کنترل کامل پلتفرم بدون وابستگی به یک Media خاص |

Platform Admin در scope پلتفرم فعالیت می‌کند و مسئول عملیات داخل تحریریهٔ یک Media نیست.

### ۴.۲ سطح رسانه

| پرسونا | نیاز اصلی | نتیجهٔ مورد انتظار |
|---|---|---|
| مدیر رسانه / Media Manager | ادارهٔ رسانه‌های واگذارشده، انتخاب منابع آماده، مدیریت کاربران، دسترسی‌ها، تحریریه و انتشار | ادارهٔ کامل Media بدون مشاهده یا دسترسی به Media دیگر |
| کاربر رسانه | انجام کار در محدودهٔ Permissionهای واگذارشده | دسترسی دقیق به ماژول‌ها و عملیات مجاز |
| ناظر | مشاهدهٔ گزارش‌ها و Audit Log مجاز | پاسخ‌گویی بدون امکان تغییر داده |

احراز هویت و مجوزها داده‌محور هستند و هیچ حساب کاربری کسب‌وکاری یا سطح دسترسی عملیاتی نباید به‌صورت static در کد تعریف شود. Platform Admin حساب Media Manager را ایجاد می‌کند. هر Media Manager می‌تواند برای Media خود کاربران ایجاد، غیرفعال و مدیریت کند و فقط Permissionهایی را واگذار کند که خودش مجاز به واگذاری آن‌هاست.

Role می‌تواند به‌عنوان preset مدیریتی استفاده شود، اما کنترل واقعی Backend بر اساس Permission انجام می‌شود. نمونهٔ Permissionها: `editorial.view`، `editorial.edit`، `editorial.approve`، `sources.view`، `publication.view`، `publication.manage`، `users.manage` و `audit.view`.

Media Manager و کاربران زیرمجموعهٔ او تحت هیچ شرایطی نباید به داده، job، فایل، credential، event، log یا metadata رسانهٔ دیگری دسترسی داشته باشند.

## ۵. اصول تجربه و محصول

- فارسی و RTL حالت اصلی محصول است.
- زمان، وضعیت و «اقدام بعدی» باید در مرکز تجربه باشند.
- هر نقطهٔ تصمیم‌گیری باید منبع، رسانه، نسخه و مقصد مرتبط را نشان دهد.
- Raw Article از Story و Article Version جداست؛ دادهٔ منبع با تصمیم تحریریه مخلوط نمی‌شود.
- یک Article Version تأییدشده immutable است؛ اصلاح، نسخهٔ جدید می‌سازد.
- خطای یک مقصد نباید مقصدهای دیگر را متوقف کند.
- تصمیم مدل قابل مشاهده، رد و بازبینی است و به‌طور پیش‌فرض تأیید انسانی را دور نمی‌زند.
- حالت‌های loading، empty، error، degraded و partial success بخشی از نیازمندی‌اند.
- Frontend و Backend مستقل‌اند و هیچ منطق اصلی کسب‌وکار نباید در Frontend قرار گیرد.
- Platform Scope و Media Scope دو مرز امنیتی مستقل هستند؛ تمام عملیات Media باید tenant-scoped باشند.

## ۶. جریان اصلی کاربر

### ۶.۱ جریان مدیریت پلتفرم و کراولر

```text
Platform Admin
  → Crawler Definition
  → Crawler Version
  → Schedule / Run Control
  → Distributed Worker Queue
  → Crawl Run
  → Platform Raw Articles
```

Platform Admin کراولرها را ایجاد، نسخه‌بندی، فعال، متوقف، زمان‌بندی و پایش می‌کند. هر crawler دارای تاریخچهٔ اجرا و log ساختاریافته است. اجرای crawlerها از طریق queue و workerهای مستقل انجام می‌شود و باید قابلیت توزیع روی چند سرور را داشته باشد.

### ۶.۲ جریان انتخاب منبع توسط رسانه

```text
Platform Source Catalog
  → Media Source Subscription
  → Media Inbox
```

Media Manager crawler ایجاد نمی‌کند. او از میان Sourceهای آمادهٔ پلتفرم، منابع موردنیاز Media خود را انتخاب یا غیرفعال می‌کند. یک Source سراسری می‌تواند توسط چند Media استفاده شود و اصل بر این است که crawl در سطح پلتفرم انجام و نتیجه میان Mediaهای مشترک توزیع شود، نه اینکه برای هر Media crawler مستقل اجرا شود.

### ۶.۳ جریان تحریریه و انتشار

```text
Raw Article
  → Story / Editorial Item
  → Editorial Processing
  → Approval
  → Social Rendition
  → Web Card Rendition
  → Web Full Rendition
  → Publication
```

هر Media ساختار بخش‌های تحریریهٔ مستقل خود را دارد. خبر در تحریریه به بخش اصلی و در صورت نیاز بخش‌های فرعی متصل می‌شود. ساختار تحریریه از محل نمایش خبر در سایت جداست؛ Site Builder بر اساس قواعد و بلوک‌های صفحه از renditionهای وب استفاده می‌کند.

## ۷. نیازمندی‌های عملکردی MVP

اولویت‌ها: **P0** برای عرضهٔ MVP الزامی، **P1** ارزشمند ولی قابل تعویق پس از اولین عرضه، **P2** بعد از MVP.

### ۷.۱ حساب، رسانه و دسترسی

| شناسه | اولویت | نیازمندی | معیار پذیرش |
|---|---:|---|---|
| IAM-01 | P0 | نشست امن و احراز هویت داده‌محور باشد. | هیچ حساب عملیاتی static در کد وجود نداشته باشد؛ کاربر ناشناس به API محافظت‌شده دسترسی ندارد. |
| IAM-02 | P0 | Platform Admin بتواند Media و Media Manager ایجاد و مدیریت کند. | ایجاد/غیرفعال‌سازی Media Manager audit شود و scope او فقط Mediaهای مجاز باشد. |
| IAM-03 | P0 | Media Manager بتواند کاربران Media خود را ایجاد و مدیریت کند. | هیچ کاربر ساخته‌شده‌ای نتواند خارج از Media مربوطه scope بگیرد. |
| IAM-04 | P0 | مجوزها Permission-based و deny-by-default باشند. | Backend برای هر عملیات Permission لازم را بررسی کند؛ Role صرفاً preset باشد. |
| IAM-05 | P0 | Media Manager بتواند دسترسی کاربران را در سطح ماژول و عملیات تعیین کند. | مثال سردبیر: `view` و `edit` مستقل قابل اعطا باشند. |
| IAM-06 | P0 | کاربر نتواند Permission بالاتر از محدودهٔ قابل واگذاری مدیر خود دریافت کند. | تست escalation منفی موفق باشد. |
| IAM-07 | P0 | تمام داده‌ها، queryها، jobها و فایل‌های Media tenant-scoped باشند. | هیچ Media Manager/User نتواند دادهٔ Media دیگر را بخواند یا تغییر دهد؛ تست منفی اجباری. |
| IAM-08 | P0 | mediaId ورودی کاربر منبع اعتماد نباشد. | Backend scope معتبر را از session/membership استخراج و هر Media selection را server-side validate کند. |

### ۷.۲ داشبورد و پایش عملیاتی

| شناسه | اولویت | نیازمندی | معیار پذیرش |
|---|---:|---|---|
| OPS-01 | P0 | صفحهٔ اصلی KPIهای ورودی جدید، نیازمند بررسی، زمان‌بندی‌شده و خطادار را نشان دهد. | اعداد از Media فعال و API واقعی خوانده شوند و قابل drill-down باشند. |
| OPS-02 | P0 | کاربر در کمتر از ۱۰ ثانیه سلامت سیستم و موارد نیازمند اقدام را تشخیص دهد. | تست کاربردپذیری سناریوی شروع روز با کاربران هدف انجام شود. |
| OPS-03 | P0 | jobهای طولانی progress و آخرین رویداد قابل فهم داشته باشند. | queued/running/succeeded/failed/cancelled و پیشرفت واقعی بدون refresh کامل نمایش داده شود. |
| OPS-04 | P1 | هشدارهای عملیاتی و امنیتی قابل اقدام باشند. | هر هشدار severity، زمان، scope، علت و اقدام پیشنهادی داشته باشد. |

### ۷.۳ منابع، کراولر و Inbox

| شناسه | اولویت | نیازمندی | معیار پذیرش |
|---|---:|---|---|
| ING-01 | P0 | فقط Platform Admin بتواند crawler و Source سراسری ایجاد، ویرایش، نسخه‌بندی یا حذف امن کند. | Media Manager هیچ endpoint یا UI برای ساخت crawler نداشته باشد. |
| ING-02 | P0 | Platform Admin بتواند crawler را فعال، pause، disable و دستی اجرا کند. | تغییر وضعیت بلافاصله روی scheduler/queue اثر بگذارد و audit شود. |
| ING-03 | P0 | Platform Admin بتواند schedule هر crawler را تغییر دهد. | زمان اجرای بعدی قابل مشاهده و تغییر schedule بدون deploy ممکن باشد. |
| ING-04 | P0 | هر crawler صفحهٔ عملیات و تاریخچهٔ Run مستقل داشته باشد. | وضعیت، نسخه، worker، زمان شروع/پایان، duration، نتیجه و شمارنده‌ها قابل مشاهده باشند. |
| ING-05 | P0 | برای هر crawler log ساختاریافته ثبت شود. | logها حداقل level، timestamp، crawlerId، crawlerVersionId، crawlRunId، workerId، message، metadata و correlationId داشته باشند و قابل فیلتر باشند. |
| ING-06 | P0 | Media Manager از کاتالوگ Sourceهای آماده منبع انتخاب کند. | انتخاب/لغو انتخاب فقط روی Media فعال اثر بگذارد و crawler مرکزی تغییر نکند. |
| ING-07 | P0 | crawl در سطح پلتفرم قابل اشتراک میان چند Media باشد. | انتخاب یک Source توسط چند Media باعث اجرای تکراری crawler به ازای هر Media نشود مگر در موارد استثنایی تعریف‌شده. |
| ING-08 | P0 | اجرای crawlerها async و horizontally scalable باشد. | jobها از queue توسط workerهای مستقل روی یک یا چند سرور دریافت شوند و crawler به ماشین خاص hard-code نشود. |
| ING-09 | P0 | workerها قابلیت/ظرفیت قابل اعلام داشته باشند. | scheduler بتواند job را بر اساس نیازهایی مثل RSS، Chromium، Playwright یا منابع سنگین route کند. |
| ING-10 | P0 | خروجی crawler به Raw Article با provenance کامل نگاشت شود. | Source، URL، crawler version، crawl run، زمان و correlation قابل مشاهده باشد. |
| ING-11 | P0 | ingestion تکراری idempotent باشد. | اجرای مجدد رکورد تکراری تولید نکند. |
| ING-12 | P0 | ورودی ناقص یا مشکوک قرنطینه شود. | علت قرنطینه و امکان تعیین تکلیف توسط نقش مجاز وجود داشته باشد. |
| ING-13 | P0 | جزئیات Raw Article بدون اجرای محتوای نامطمئن نمایش داده شود. | HTML sanitize و preview از context اصلی جدا باشد. |
| ING-14 | P0 | اجرای طولانی checkpoint و progress واقعی داشته باشد. | resume بدون پردازش مجدد موفق‌ها انجام شود. |
| ING-15 | P0 | خطای هر URL مستقل ثبت و partial success حفظ شود. | retry محدود و resume صحیح باشد. |

### ۷.۴ تحریریه و تأیید

| شناسه | اولویت | نیازمندی | معیار پذیرش |
|---|---:|---|---|
| EDT-01 | P0 | Raw Articleها به Story/Editorial Item متصل یا از آن جدا شوند. | چند منبع بتوانند یک Story داشته باشند و provenance حفظ شود. |
| EDT-02 | P0 | هر Media ساختار بخش‌های تحریریهٔ مستقل و سلسله‌مراتبی داشته باشد. | Media Manager بتواند Section و Subsection را مدیریت کند؛ داده بین Mediaها مشترک نباشد. |
| EDT-03 | P0 | هر خبر حداقل یک بخش اصلی داشته باشد و بتواند بخش‌های فرعی/ثانویه داشته باشد. | طبقه‌بندی تحریریه مستقل از محل نمایش در سایت ذخیره شود. |
| EDT-04 | P0 | Editorial Policy هر Media نسخه‌دار باشد. | هر Article Version به policy version دقیق اشاره کند. |
| EDT-05 | P0 | ویراستار نسخهٔ تازه بسازد و تاریخچه را مقایسه کند. | نسخهٔ قبلی immutable، diff، actor و timestamp قابل مشاهده باشد. |
| EDT-06 | P0 | سردبیر نسخه را تأیید، رد یا برای اصلاح بازگرداند. | فقط نسخهٔ تأییدشده قابل انتشار باشد. |
| EDT-07 | P0 | خروجی استاندارد سردبیر حداقل سه rendition داشته باشد. | `Social Rendition`، `Web Card Rendition` و `Web Full Rendition` برای یک Article canonical قابل تولید و نسخه‌بندی باشند. |
| EDT-08 | P0 | Web Card برای نمایش در لیست‌ها و بلوک‌های سایت بهینه باشد. | حداقل title، short lead/summary، thumbnail، section و metadata نمایشی را پشتیبانی کند. |
| EDT-09 | P0 | Web Full برای صفحهٔ کامل خبر ساختار کامل محتوا داشته باشد. | title، lead، body، featured media و metadata لازم قابل ذخیره باشد. |
| EDT-10 | P0 | Social Rendition از محتوای canonical مشتق و مستقل از نسخهٔ وب باشد. | متن و media مناسب شبکه اجتماعی قابل پیش‌نمایش باشد. |
| EDT-11 | P0 | خروجی مدل قبل از ذخیره schema و policy check شود. | validation ناموفق rendition قابل انتشار نسازد. |

### ۷.۵ سایت، مقصد، rendition و انتشار

| شناسه | اولویت | نیازمندی | معیار پذیرش |
|---|---:|---|---|
| PUB-01 | P0 | Site Builder مصرف‌کنندهٔ renditionهای وب باشد و مالک محتوای canonical خبر نباشد. | تغییر Layout سایت دادهٔ تحریریه را تغییر ندهد. |
| PUB-02 | P0 | بلوک‌ها و صفحات سایت بر اساس قواعد محتوایی مثل Section از Web Card استفاده کنند. | محل نمایش خبر از طبقه‌بندی تحریریه جدا باشد. |
| PUB-03 | P0 | صفحهٔ خبر از Web Full Rendition استفاده کند. | کلیک روی Card به نسخهٔ کامل همان Article متصل شود. |
| PUB-04 | P0 | admin مجاز Media مقصد سایت و حداقل یک کانال اجتماعی را تعریف کند. | Destination عمومی از Connection محرمانه جدا و متعلق به Media باشد. |
| PUB-05 | P0 | انتشار فوری یا زمان‌بندی‌شده فقط از نسخهٔ تأییدشده ممکن باشد. | job زودهنگام رد شود و timezone رسانه رعایت گردد. |
| PUB-06 | P0 | هر Publication Job idempotency key داشته باشد. | retry/replay محتوای تکراری ایجاد نکند. |
| PUB-07 | P0 | خطای یک مقصد مستقل retry یا dead-letter شود. | موفقیت مقصدهای دیگر حفظ شود. |
| PUB-08 | P0 | اپراتور مجاز صف را پایش و job مجاز را retry/cancel کند. | عملیات role/permission-based و audit شده باشد. |

### ۷.۶ Audit و گزارش

| شناسه | اولویت | نیازمندی | معیار پذیرش |
|---|---:|---|---|
| AUD-01 | P0 | ورود، تغییر Media، policy، عضویت، مقصد، تأیید و انتشار audit شوند. | رویداد actor، mediaId، action، target، timestamp و correlationId دارد. |
| AUD-02 | P0 | Audit Log برای نقش مجاز قابل جست‌وجو باشد. | فیلتر زمان، actor، action و target بدون عبور از مرز Media کار کند. |
| AUD-03 | P0 | log و پاسخ API secret یا خطای داخلی را افشا نکند. | تست و بازبینی نشان دهد token، credential، stack و مسیر محلی بیرون نمی‌آید. |
| AUD-04 | P1 | گزارش پایهٔ عملکرد دریافت و انتشار ارائه شود. | KPIها در بازهٔ زمانی و به تفکیک Source/Destination قابل مشاهده باشند. |

## ۸. الزامات غیرعملکردی

### امنیت و حریم داده

- هر رکورد scope صریح `platform` یا `media` دارد. داده‌های Media از طریق `mediaId` یا والد قطعی tenant-scoped هستند؛ Source، Crawler، Crawl Run و Platform Raw Article سراسری‌اند و از طریق Subscription/Inbox Item به Media متصل می‌شوند.
- Source فقط URL عمومی HTTPS را می‌پذیرد؛ DNS/IP در ایجاد، redirect و اجرا دوباره بررسی می‌شود.
- request خارجی timeout، محدودیت اندازه، redirect محدود و concurrency limit دارد.
- credential در secret manager یا با encryption-at-rest نگه‌داری و هرگز به مرورگر ارسال نمی‌شود.
- HTML کراول‌شده sanitize و preview با origin/CSP مناسب جدا می‌شود.
- ورودی منبع و خروجی مدل نامطمئن‌اند و باید schema validation و policy check را پاس کنند.
- عملیات حساس rate limit، audit و در صورت نیاز kill switch دارند.
- تست authorization، tenant isolation، SSRF، XSS، replay و duplicate publish پیش از عرضه الزامی است.

### قابلیت اطمینان و بازیابی

- jobها state machine صریح، checkpoint، retry محدود و dead-letter state دارند.
- قطع worker نباید موفقیت‌های ثبت‌شده را از بین ببرد؛ job رهاشده قابل بازیابی است.
- correlation ID مسیر API، worker، adapter و نتیجه را به هم متصل می‌کند.
- backup/restore دیتابیس و runbook رخداد پیش از production آزموده می‌شود.

### کارایی

- پاسخ APIهای تعاملی، خارج از عملیات async، در صدک ۹۵ زیر ۸۰۰ میلی‌ثانیه هدف‌گذاری می‌شود.
- صفحهٔ اصلی روی اتصال معمولی در صدک ۷۵ حداکثر ۲٫۵ ثانیه تا محتوای اصلی هدف دارد.
- فهرست‌های پرتعداد server-side pagination/filter دارند و UI نباید کل داده را یک‌جا بارگیری کند.
- زمان crawl و انتشار تابع مقصد خارجی است؛ محصول باید progress و timeout شفاف ارائه کند، نه وعدهٔ latency ثابت.

### دسترس‌پذیری و سازگاری

- رابط desktop-first و responsive، با RTL واقعی و فونت فارسی خوانا است.
- عملیات اصلی با keyboard قابل انجام و focus state آشکار است.
- رنگ تنها حامل معنا نیست و کنتراست متن/کنترل‌ها حداقل WCAG 2.1 AA را هدف می‌گیرد.
- مرورگرهای هدف: دو نسخهٔ پایدار آخر Chrome، Edge و Firefox.

### نگهداشت‌پذیری

- Frontend و Backend مستقل توسعه می‌یابند و ارتباط آن‌ها صرفاً از طریق APIهای نسخه‌دار است.
- Backend به‌صورت modular طراحی می‌شود و منطق crawler، editorial، site-builder، publication، IAM و audit در ماژول‌های مستقل درون محصول قرار می‌گیرد.
- کارهای طولانی در workerهای مستقل اجرا می‌شوند و execution باید قابلیت توزیع افقی روی چند سرور داشته باشد.
- ابزارهای مرجع قبلی صرفاً منبع استخراج منطق هستند و runtime مستقل محصول نهایی محسوب نمی‌شوند.
- قراردادهای API و مرز ماژول‌ها نسخه‌دار و validate می‌شوند.
- تغییر معماری مهم با ADR و تغییر واقعیت پروژه در `PROJECT-STATE.md` ثبت می‌شود.

## ۹. شاخص‌های موفقیت

Baseline در دورهٔ پایلوت اندازه‌گیری می‌شود؛ سپس هدف عددی نهایی با دادهٔ واقعی تصویب خواهد شد.

| شاخص | تعریف | هدف اولیهٔ MVP |
|---|---|---:|
| نرخ موفقیت crawl | runهای موفق یا partial قابل قبول / کل runها | ≥ ۹۵٪ برای منابع پشتیبانی‌شده |
| نرخ استخراج قابل استفاده | Raw Articleهای غیرقرنطینه / کل موارد استخراج‌شده | ≥ ۹۰٪ |
| نرخ تکرار ورودی | duplicateهای شناسایی‌شده که رکورد تازه نساخته‌اند | ۱۰۰٪ مهار تکرار شناخته‌شده |
| زمان دریافت تا Inbox | میانهٔ زمان انتشار منبع تا ثبت در Inbox | متناسب با schedule؛ قابل اندازه‌گیری و گزارش |
| زمان Inbox تا تأیید | میانهٔ زمان ورود تا Approval | baseline پایلوت، سپس کاهش مرحله‌ای |
| نرخ موفقیت انتشار | jobهای موفق / jobهای اجراشده به تفکیک مقصد | ≥ ۹۸٪ پس از retry |
| انتشار تکراری | موارد duplicate در مقصد بر اثر retry/replay | صفر |
| عبور بین tenantها | دسترسی موفق غیرمجاز به Media دیگر | صفر |
| زمان بازیابی خطا | زمان failed تا retry موفق یا اقدام انسانی | قابل مشاهده؛ هدف پس از پایلوت |

## ۱۰. رویدادهای تحلیلی حداقلی

برای اندازه‌گیری funnel بدون ثبت محتوای حساس، رویدادهای زیر با `scopeType`، `scopeId`، actor/role، timestamp و correlation ثبت می‌شوند؛ `scopeId` برای رویداد Media همان `mediaId` است و برای عملیات سراسری می‌تواند شناسهٔ Platform باشد:

- `source.created`, `crawl.queued`, `crawl.completed`, `crawl.failed`
- `raw_article.ingested`, `raw_article.duplicated`, `raw_article.quarantined`
- `story.created`, `article_version.created`, `approval.decided`
- `publication.scheduled`, `publication.succeeded`, `publication.failed`, `publication.retried`
- `media.selected`, `membership.changed`, `destination.changed`

متن کامل خبر، prompt خام و credential نباید صرفاً برای analytics ذخیره شوند.

## ۱۱. وضعیت فعلی نسبت به PRD

### پیاده‌سازی و تأییدشده

- dashboard shell و جهت طراحی RTL؛
- نشست دیتابیسی، Media، Membership، شش نقش و انتخاب امن Media؛
- API v1 با envelope، validation، correlation ID و خطای پالایش‌شده؛
- Source، Crawler Version، Crawl Run و Raw Article از مدل tenant-scoped قدیمی به Platform Scope منتقل شده‌اند؛ Subscription و Inbox Item مرز Media را اعمال می‌کنند؛
- Backend مستقل Node.js، Frontend مستقل Next.js و worker جدا ایجاد شده‌اند؛
- اجرای async کراولر داخلی، scheduler و ثبت progress؛
- deduplication دیتابیسی، کنترل SSRF، timeout و محدودیت پاسخ؛
- صفحات واقعی منابع و Inbox و گزارش زندهٔ crawl؛
- smoke test جداسازی tenant و تست ورودی واقعی.

### در حال ساخت در فاز ۲

- جزئیات کامل Raw Article؛
- تجربهٔ بررسی و تعیین تکلیف quarantine؛
- شمارندهٔ پیشرفت مقاله‌ها از checkpoint واقعی برای crawl طولانی؛
- تکمیل معیارهای خروج فاز دریافت.

### برنامه‌ریزی‌شده برای فازهای بعد

- Story، Editorial Policy، Article Version، Section، Approval و renditionهای Social/Web Card/Web Full؛
- Site Builder داخلی، Destination، Connection و Publication Job؛
- کانال اجتماعی، تقویم انتشار و گزارش کامل؛
- سخت‌سازی production، secret vault، backup/restore و تست نفوذ.

## ۱۲. معماری ماژول‌ها و یکپارچه‌سازی‌ها

منطق سه ابزار مرجع قبلی به Backend اصلی منتقل می‌شود و این ابزارها سرویس مستقل runtime محصول نهایی نیستند. cloneهای آن‌ها فقط بیرون از مسیر runtime برای مطالعه، استخراج prompt و تست مقایسه‌ای نگه‌داری می‌شوند.

```text
front/ — Next.js Frontend
   ↓ Versioned HTTP API
back/ — Node.js Backend
   ├── IAM / Platform Administration
   ├── Media Management
   ├── Crawler / Ingestion
   ├── Editorial
   ├── Site Builder
   ├── Publication
   ├── Audit / Observability
   └── Queue / Worker Coordination

back/worker — independent Node.js worker
   ├── Crawl Workers
   └── Publication / Background Workers
```

| قابلیت | منبع مرجع فعلی | وضعیت در معماری جدید |
|---|---|---|
| دریافت وب و ساخت crawler | CrawlerGenerator | منطق لازم به ماژول Crawler/Worker منتقل می‌شود. |
| تولید و بازنویسی تحریریه | sardabir | منطق لازم به ماژول Editorial منتقل می‌شود. |
| ساخت و مدیریت سایت | News-website-builder | منطق لازم به ماژول Site Builder منتقل می‌شود. |
| انتشار به مقصد خارجی | API/adapter مقصد | فقط ارتباط فنی خارجی در قالب connector/adapter باقی می‌ماند؛ lifecycle و job متعلق به Backend اصلی است. |

## ۱۳. عرضه و Gateها

عرضه بر اساس تحقق Gate انجام می‌شود، نه تاریخ حدسی:

1. **دریافت:** خبر واقعی، deduplication، quarantine، provenance و tenant isolation کامل.
2. **تحریریه:** تبدیل Raw Article به نسخهٔ تأییدشده با policy و تاریخچه.
3. **وب:** انتشار idempotent یک خبر تأییدشده روی سایت و مشاهدهٔ نتیجه.
4. **اجتماعی:** انتشار همان خبر با rendition مستقل روی حداقل یک کانال.
5. **آمادگی production:** threat-model، تست نفوذ، secret management، observability و backup/restore.

پایلوت با تعداد محدود Media، Source و Destination شروع می‌شود. افزایش دامنه پس از مشاهدهٔ نرخ خطا، ظرفیت worker، کیفیت استخراج و نیاز واقعی تیم انجام خواهد شد.

## ۱۴. ریسک‌ها و راهکار کاهش

| ریسک | اثر | راهکار |
|---|---|---|
| تغییر ساختار سایت منبع | افت یا توقف دریافت | versioning crawler، health، sample validation، partial retry |
| prompt injection و محتوای مخرب | تصمیم یا اجرای ناخواسته | جداسازی data/instruction، validation، sandbox و تأیید انسانی |
| انتشار تکراری | آسیب اعتباری | idempotency key، remote ID و reconciliation |
| اختلاط Mediaها | رخداد امنیتی بحرانی | tenant scope در query/job، RBAC و تست منفی مستمر |
| افشای credential | takeover مقصد | vault/encryption، redaction، rotation و عدم ارسال به frontend |
| وابستگی زیاد به بازوهای مرجع | کندی تغییر یا شکست integration | adapter نسخه‌دار، timeout و مدل canonical مستقل |
| کیفیت متغیر خروجی مدل | خبر نادرست یا نامتناسب | provenance، policy check، warning و Approval انسانی |

## ۱۵. تصمیم‌های باز محصول

### تصمیم‌های قطعی‌شده در بازطراحی

1. ساخت و مدیریت crawler فقط در اختیار Platform Admin است.
2. Media Manager فقط از Source/Crawlerهای آماده انتخاب می‌کند و crawler جدید نمی‌سازد.
3. Crawlerها در سطح پلتفرم اجرا می‌شوند و باید قابلیت توزیع روی چند Worker/Server را داشته باشند.
4. Platform Admin مدیریت کامل crawler شامل pause/resume، schedule، اجرای دستی، نسخه و log را دارد.
5. Frontend و Backend مستقل هستند.
6. منطق CrawlerGenerator، sardabir و News-website-builder به Backend اصلی منتقل می‌شود.
7. Platform Admin و Media Manager دو scope و workspace مستقل دارند.
8. احراز هویت و مجوزها داده‌محور و Permission-based هستند؛ حساب و دسترسی static در کد پذیرفته نیست.
9. Media Manager می‌تواند کاربران Media خود را بسازد و Permissionهای مجاز را واگذار کند.
10. Tenant Isolation سخت‌گیرانه است و هیچ Media نباید به اطلاعات Media دیگر دسترسی داشته باشد.
11. هر Media ساختار Sectionهای تحریریهٔ مستقل خود را دارد.
12. خروجی استاندارد سردبیر شامل Social Rendition، Web Card Rendition و Web Full Rendition است.

### سوالات باقی‌مانده

این موارد هنوز تصمیم‌گیری نشده‌اند و باید در ادامهٔ تحلیل محصول مشخص شوند:

1. **ورود خبر به سردبیر:** Raw Article پس از crawl دقیقاً با چه قواعدی وارد Inbox تحریریه می‌شود؟ آیا فیلتر، دسته‌بندی، امتیازدهی یا assignment خودکار قبل از ورود لازم است؟
2. **تبدیل Raw Article به Story:** این تبدیل دستی است، خودکار است یا ترکیبی؟ چند Raw Article از چند Source تحت چه شرایطی یک Story مشترک می‌سازند؟
3. **مالکیت Sectionها:** ساخت و ویرایش Section/Subsection دقیقاً در اختیار Media Manager است یا نقش دیگری نیز Permission مستقل دارد؟
4. **فیلدهای نهایی سردبیر:** ساختار دقیق فیلدهای Social، Web Card و Web Full چیست و کدام فیلدها اجباری‌اند؟
5. **نقش AI در سردبیر:** AI کدام عملیات را انجام می‌دهد؛ بازنویسی، خلاصه‌سازی، ترکیب منابع، پیشنهاد عنوان، دسته‌بندی، تولید metadata یا همهٔ این‌ها؟
6. **Approval:** کدام خروجی‌ها نیازمند Approval انسانی‌اند و آیا Media می‌تواند سطح خودکارسازی Approval را تنظیم کند؟
7. **ارتباط Section و Site Builder:** Mapping بین Section تحریریه و بلوک‌های سایت چگونه تعریف می‌شود و آیا یک Section می‌تواند در چند بلوک/صفحه استفاده شود؟
8. **مالکیت دسته‌بندی سایت:** آیا categoryهای سایت همان Editorial Sectionها هستند یا entity جدا با mapping مستقل؟
9. **ساختار Site Builder:** مدیر رسانه دقیقاً چه چیزهایی را می‌تواند بسازد یا ویرایش کند؛ صفحه اصلی، صفحات Section، Header/Footer، Menu، بلوک‌های خبری، رنگ، فونت، تبلیغات و غیره؟
10. **CMS یا Backend مرکزی:** سایت نهایی محتوا را مستقیماً از Backend اصلی دریافت می‌کند یا یک CMS/Storage مستقل بین آن‌ها وجود دارد؟
11. **تعداد سایت برای هر Media:** هر Media فقط یک Website دارد یا می‌تواند چند سایت/دامنه از یک تحریریه تغذیه کند؟
12. **ویرایش پس از انتشار:** اگر Article منتشرشده ویرایش شود، آیا Approval مجدد لازم است و سایت/شبکه اجتماعی چگونه update یا republish می‌شوند؟
13. **تصویر و Asset:** featured image، thumbnail، gallery، video و assetهای Social از کجا می‌آیند و چرخهٔ مالکیت/ویرایش آن‌ها چیست؟
14. **Social Rendition مقصد-محور:** آیا یک Social Rendition عمومی کافی است یا برای Telegram، Instagram، X و سایر شبکه‌ها rendition جدا لازم است؟
15. **Site Placement:** آیا نمایش در Hero، Top Stories، Breaking News و سایر جایگاه‌ها صرفاً rule-based است یا سردبیر می‌تواند placement دستی هم اعمال کند؟
16. **اولویت و Breaking News:** مدل priority/urgency خبر و اثر آن روی Site Builder و انتشار چگونه تعریف می‌شود؟
17. **زمان‌بندی انتشار:** آیا Web Card، Web Full و Social همیشه همزمان منتشر می‌شوند یا هر rendition می‌تواند زمان مستقل داشته باشد؟
18. **مالک KPIها و معیارهای کسب‌وکاری:** مالک نهایی KPIها و acceptanceهای غیر فنی چه کسی است؟
19. **MFA و بازیابی حساب:** سیاست دعوت کاربر، reset password، MFA و session policy برای production چیست؟
20. **مدل استقرار:** عرضه نهایی SaaS، dedicated server یا هر دو خواهد بود؟
21. **SLA و retention:** retention خبر خام، log، audit، rendition و backup چه مدت است و SLA production چیست؟

## ۱۶. تعریف پایان MVP

MVP زمانی آماده است که یک کاربر مجاز بتواند در Media خود:

- یک Source آماده را از کاتالوگ پلتفرم انتخاب کند و خبر را با منشأ قابل ردیابی در Inbox ببیند؛
- مورد ناقص یا تکراری را تشخیص دهد و مورد مناسب را وارد Story کند؛
- نسخهٔ ویراستاری‌شده را بسازد، مقایسه و تأیید کند؛
- rendition را پیش‌نمایش و خبر را بدون تکرار روی یک سایت و یک کانال منتشر کند؛
- نتیجه و خطا را ببیند، retry امن انجام دهد و Audit Log مسیر را مشاهده کند؛
- و در تمام این مراحل نتواند داده، job یا credential رسانهٔ دیگری را بخواند یا تغییر دهد.
