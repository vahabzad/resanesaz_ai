# اتاق فرمان رسانه

پلتفرمی برای ساخت و ادارهٔ رسانه‌های چندکاناله: تعریف منابع، تولید و اجرای کراولر، تحریریهٔ هوشمند، ساخت سایت خبری و انتشار در سایت‌ها و کانال‌های اجتماعی.

این مخزن در مرحلهٔ طراحی داشبورد است. نسخهٔ اول dashboard shell و صفحهٔ اصلی با دادهٔ Mock قراردادی در `apps/dashboard` پیاده‌سازی شده و منتظر بازخورد UI/UX است.

## اجرای داشبورد

نیازمندی: Node.js 22 یا جدیدتر.

```powershell
npm install
npm run dev
```

داشبورد در `http://localhost:3000` اجرا می‌شود.

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
