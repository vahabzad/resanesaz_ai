# ADR-0003: stack پایه، ذخیره‌سازی و احراز هویت

وضعیت: پذیرفته‌شده برای فاز ۱

تاریخ: 2026-09-27

## زمینه

اولین vertical slice باید User، Media، Membership و Role را واقعی کند، مرز رسانه‌ها را در سرور enforce کند و بدون تقسیم زودهنگام سیستم، مسیر رشد به workerهای مستقل را باز بگذارد. امنیت و قابلیت audit از ابتدا الزام‌اند.

## تصمیم

- Control Plane در فاز ۱ داخل Next.js App Router و به‌شکل modular monolith پیاده‌سازی می‌شود.
- PostgreSQL 16 منبع اصلی production است و با migrationهای نسخه‌دار مدیریت می‌شود. توسعهٔ محلی می‌تواند همان dialect و migrationها را با PGlite اجرا کند تا به Docker وابسته نباشد.
- Better Auth با session دیتابیسی، email/password و Organization plugin استفاده می‌شود.
- مدل Organization در لایهٔ auth به جدول دامنه‌ای `media` و Member به `membership` نگاشت می‌شود.
- نقش‌ها از ابتدا شامل `owner`، `admin`، `editor`، `journalist`، `publisher` و `viewer` هستند.
- دسترسی داده فقط از Data Access Layerهای `server-only` انجام می‌شود؛ کنترل UI جای authorization سرور را نمی‌گیرد.
- Route Handlerهای محصول زیر `/api/v1` پاسخ envelope نسخه‌دار، `correlationId` و خطای پالایش‌شده می‌دهند.
- workerهای crawler/editorial/publishing در این فاز ایجاد نمی‌شوند، ولی قراردادهای آن‌ها مستقل باقی می‌ماند.

## امنیت

- session token در cookie مدیریت‌شده توسط کتابخانه نگهداری می‌شود و session در PostgreSQL قرار دارد.
- عضویت Media در هر query دامنه‌ای دوباره بررسی می‌شود.
- انتخاب Media یک mutation مجازشده و audit‌شده است.
- secretها فقط از environment خوانده می‌شوند و در Git قرار نمی‌گیرند.
- registration عمومی فعلاً بسته است؛ حساب اولیه با seed محلی ساخته می‌شود.

## پیامدها

- داشبورد و API در یک deployable واحد سریع‌تر به اولین جریان واقعی می‌رسند.
- جداسازی workerها بدون تغییر مدل هویت ممکن است.
- اجرای محلی با PGlite بدون سرویس جانبی ممکن است؛ Docker Compose برای تست با PostgreSQL واقعی حفظ می‌شود.
- پیش از production باید email verification، بازیابی رمز، MFA و سیاست دعوت اعضا تکمیل شوند.
