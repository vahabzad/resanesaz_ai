# اتاق فرمان رسانه

پلتفرم فارسی برای دریافت خبر، کار تحریریه و انتشار چندکاناله با دو برنامهٔ مستقل:

```text
front/   Next.js Frontend
back/    Node.js Backend + database + worker + contracts
```

Frontend هیچ API کسب‌وکاری یا دسترسی مستقیم دیتابیس ندارد و فقط API نسخه‌دار Backend را مصرف می‌کند.

## پروژه‌های مرجع

CrawlerGenerator، sardabir و News-website-builder سرویس یا dependency محصول نیستند. clone آن‌ها فقط بیرون از runtime برای مطالعهٔ منطق، prompt و آزمون مقایسه‌ای استفاده می‌شود و قابلیت لازم در `back` بازپیاده‌سازی می‌شود.

## اجرای محلی

نیازمندی: Node.js 22 یا جدیدتر.

```powershell
npm install
Copy-Item .env.example back/.env.local
npm run db:migrate
```

برای bootstrap اولیهٔ سوپر ادمین، متغیرهای `BOOTSTRAP_SUPER_ADMIN_NAME`، `BOOTSTRAP_SUPER_ADMIN_EMAIL` و `BOOTSTRAP_SUPER_ADMIN_PASSWORD` را در محیط امن تنظیم و سپس `npm run db:bootstrap-super-admin` را اجرا کنید. این فرمان فقط در دیتابیس بدون کاربر، اولین سوپر ادمین را می‌سازد و هیچ رسانه، منبع یا کراولری ایجاد نمی‌کند. در محیط فعلی حساب سوپر ادمین از قبل وجود دارد و نیازی به اجرای bootstrap نیست.

برای PGlite محلی، در دو terminal مستقل اجرا کنید:

```powershell
cd back
npm run dev
```

```powershell
cd front
npm run dev
```

- Frontend: `http://127.0.0.1:3000`
- Backend: `http://127.0.0.1:4000`
- health check: `http://127.0.0.1:4000/health`

در توسعه، Next.js مسیر `/api/*` را به Backend پروکسی می‌کند. Backend همچنان process مستقل است.

با PGlite محلی، حلقهٔ Worker خودکار در همان فرایند Backend اجرا می‌شود؛ اجرای Worker جدا لازم نیست. با PostgreSQL، در ترمینال سوم از پوشهٔ `back` دستور `npm run dev:worker` را اجرا کنید. استثنای محیط محلی و recovery پس از restart در ADR-0010 ثبت شده‌اند.

## اتصال Codex در بک‌اند

بک‌اند از `@openai/codex-sdk` و نشست Codex همان کاربر سیستم استفاده می‌کند. اجرای native ابتدا از `CODEX_EXECUTABLE` (مسیر مطلق)، سپس PATH و در نهایت runtime همراه SDK پیدا می‌شود. نشانگر هدر ادمین نتیجهٔ `codex login status` را می‌خواند؛ وضعیت ورود به‌تنهایی تضمین موفقیت درخواست مدل نیست.

روی میزبان بک‌اند با همان کاربری که سرویس را اجرا می‌کند وارد شوید. اگر CLI در PATH است:

```shell
codex login
codex login status
```

برای سرور بدون مرورگر، پس از فعال‌سازی device-code login در حساب یا workspace:

```shell
codex login --device-auth
```

اگر فقط runtime همراه SDK نصب است، از پوشهٔ `back` دستور `npx --no-install codex login --device-auth` را اجرا کنید. تنظیم `CODEX_HOME` در فرایند ورود و سرویس باید یکسان باشد. اعتبارنامه‌ها در storage رسمی Codex باقی می‌مانند و در API یا UI محصول نمایش داده نمی‌شوند. راهنمای رسمی: [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)، [ورود و device auth](https://learn.chatgpt.com/docs/auth).

## مدل دریافت خبر

- Platform Admin کاتالوگ Source و crawlerها را مدیریت می‌کند.
- Source، Crawl Run و Raw Article سراسری هستند.
- Media Manager فقط Source آماده را subscribe می‌کند.
- `Media Inbox Item` مرز tenant را هنگام توزیع خبر اعمال می‌کند.
- crawler وب داخل Backend/Worker محصول اجرا می‌شود و به CrawlerGenerator درخواست نمی‌زند.

## کنترل کیفیت

```powershell
npm run typecheck
npm test
npm run lint
npm run build
```

## راهنمای ادامه

1. وضعیت جاری: [`docs/PROJECT-STATE.md`](docs/PROJECT-STATE.md)
2. نیازمندی‌ها: [`docs/PRD.md`](docs/PRD.md)
3. معماری: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
4. مدل دامنه: [`docs/DOMAIN-GLOSSARY.md`](docs/DOMAIN-GLOSSARY.md)
5. نقشهٔ راه: [`docs/ROADMAP.md`](docs/ROADMAP.md)
6. قواعد UI/UX: [`docs/UI-UX.md`](docs/UI-UX.md)
7. تصمیم جدید معماری: [`docs/DECISIONS/0007-independent-front-back-and-internalized-reference-logic.md`](docs/DECISIONS/0007-independent-front-back-and-internalized-reference-logic.md)


## سایت‌ها و انتشار وب

- `/sites`: ساخت سایت، طراحی هویت و بلوک‌ها، پیش‌نمایش و فعال‌سازی/توقف.
- `/ready`: بازکردن آخرین نسخهٔ تأییدشده و انتخاب سایت فعال برای انتشار فوری یا زمان‌بندی‌شده.
- `/publishing`: نتیجه، لغو، تغییر زمان و تلاش مجدد فوری؛ همهٔ زمان‌ها به وقت تهران‌اند.
- `/s/<slug>` و `/s/<slug>/news/<storyId>`: سایت عمومی و صفحهٔ خبر؛ تنها محتوای واقعاً منتشرشده در حالت live دیده می‌شود.

سایت این فاز داخل همین سامانه ارائه می‌شود و اتصال دامنه یا شبکهٔ اجتماعی انجام نمی‌دهد. طراحی ذخیره‌شده تا زدن «فعال‌سازی سایت/انتشار طراحی» عمومی نمی‌شود. در PGlite توسعه، Backend پیش از listen migrationها را از همان اتصال مالک یگانه اعمال می‌کند؛ migration CLI را هم‌زمان با API اجرا نکنید. PostgreSQL همچنان migration مستقل release و worker مستقل انتشار دارد.
