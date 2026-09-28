# اتاق فرمان رسانه

پلتفرمی برای ساخت و ادارهٔ رسانه‌های چندکاناله: تعریف منابع، تولید و اجرای کراولر، تحریریهٔ هوشمند، ساخت سایت خبری و انتشار در سایت‌ها و کانال‌های اجتماعی.

جهت UI/UX داشبورد تأیید شده و فاز پایهٔ محصول نیز پیاده‌سازی شده است: ورود واقعی، Media، Membership، Role، انتخاب امن رسانه، Audit Event و قرارداد نسخه‌دار API. ویجت‌های عملیاتی داشبورد تا اتصال vertical slice کراولر همچنان دادهٔ Mock قراردادی دارند.

## اجرای داشبورد

نیازمندی: Node.js 22 یا جدیدتر.

```powershell
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

داشبورد در `http://localhost:3000` اجرا می‌شود.

صفحه‌های فعال:

- `/` داشبورد اصلی
- `/sources` منابع، اجرای RSS و سابقهٔ Crawl Run
- `/inbox` اخبار واقعی دریافت‌شده و قرنطینه

حساب نمونهٔ توسعه:

```text
email: sara@didban.local
password: MediaDemo-2026!
```

در توسعه، دیتابیس PGlite در مسیر نادیده‌گرفته‌شدهٔ `.data` استفاده می‌شود. برای اجرای production-like می‌توان تنظیمات PostgreSQL در `.env.example` و `compose.yaml` را به‌کار گرفت.

## شروع سریع برای ادامهٔ کار

1. وضعیت فعلی و قدم بعدی: [`docs/PROJECT-STATE.md`](docs/PROJECT-STATE.md)
2. تعریف محصول: [`docs/PRODUCT-BLUEPRINT.md`](docs/PRODUCT-BLUEPRINT.md)
3. نقشهٔ فازها: [`docs/ROADMAP.md`](docs/ROADMAP.md)
4. جهت طراحی داشبورد: [`docs/UI-UX.md`](docs/UI-UX.md)
5. بررسی سه پروژهٔ مرجع: [`docs/REFERENCE-AUDIT.md`](docs/REFERENCE-AUDIT.md)

## پروژه‌های مرجع

- [News-website-builder](https://github.com/vahabzad/News-website-builder): بازوی تولید سایت
- [CrawlerGenerator](https://github.com/vahabzad/CrawlerGenerator): بازوی تولید و اجرای کراولر
- [sardabir](https://github.com/vahabzad/sardabir): بازوی تولید و ویراستاری خبر

UI پروژه‌های مرجع بخشی از محصول جدید نیست. اتصال به قابلیت‌های آن‌ها باید از طریق قراردادهای روشن و adapterهای قابل جایگزینی انجام شود.
