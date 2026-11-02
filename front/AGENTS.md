<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## قواعد معماری فرانت‌اند

- فرانت‌اند فقط در این پوشه توسعه داده می‌شود و صرفاً از API نسخه‌دار Backend استفاده می‌کند؛ Route Handler کسب‌وکاری، دسترسی مستقیم دیتابیس و منطق دامنه در Next.js ممنوع است.
- توسعه باید component-based باشد. فایل‌های `page.tsx` فقط مسئول composition، دریافت داده و اتصال بخش‌های صفحه‌اند.
- هر بخش مستقل یا الگوی قابل‌استفادهٔ مجدد باید به کامپوننت جدا با props و مسئولیت روشن تبدیل شود و در صفحه مصرف شود.
- پیش از ساخت کامپوننت تازه، کامپوننت‌های موجود بررسی و در صورت امکان توسعه داده شوند تا الگوهای مشابه در صفحات مختلف دوباره پیاده‌سازی نشوند.
- منطق تعاملی مشترک در hook یا utility مستقل قرار می‌گیرد و داخل چند صفحه کپی نمی‌شود.
- برای تغییر import، قرارداد مشترک یا تنظیم bundler، `npm run build` واقعی Next.js/Webpack الزامی است؛ typecheck و صفحهٔ آزمایش esbuild جای build محصول نیستند. در گزارش، بازبینی صفحهٔ آزمایش را از بازبینی مسیر واقعی محصول تفکیک کن. `npm run check` آزمون‌ها، lint و build را یکجا اجرا می‌کند.
- کامپوننت خاص یک feature کنار همان feature و کامپوننت عمومی در مسیر `components` نگه‌داری می‌شود.
- دادهٔ نمایشی ثابت یا ساختگی را در صفحه‌های runtime وارد نکن؛ داده از API نسخه‌دار بیاید و نبود داده با empty state واقعی نمایش داده شود. داده‌های fixture فقط برای آزمون هستند.
- در تجربهٔ مدیریت رسانه، ادمین همان سردبیر است و می‌تواند چند رسانه بسازد؛ دسترسی منبع فقط از فهرست مجاز سوپر ادمین می‌آید. UI درخواست منبع، وضعیت بررسی آن و انتخاب دسته‌بندی کلی/به‌ازای منبع را از هم روشن نشان دهد.
