# ADR-0009 — Codex SDK و ورود روی میزبان Backend

تاریخ: 2026-10-06 — وضعیت: پذیرفته‌شده

## تصمیم

SDK رسمی TypeScript فقط در Backend مصرف می‌شود و با `codexPathOverride` به اجرای native انتخاب‌شده وصل می‌شود. انتخاب اجرا از تنظیم سرور `CODEX_EXECUTABLE`، PATH و runtime همراه SDK انجام می‌شود؛ مسیر برنامه هرگز از درخواست مرورگر دریافت نمی‌شود.

factory به نام `createLocalCodex` برای عملیات آینده آماده است. SDK و probe ورود، OS user، environment و `CODEX_HOME` یکسان دارند. ورود با CLI رسمی روی میزبان انجام می‌شود؛ برای سرور بدون مرورگر روش device-auth در صورت مجازبودن حساب/workspace مستند شده است. UI وضعیت ادمین محصول، فرم دریافت token یا رمز حساب Codex نیست.

## پایش

هدر ادمین هر ۳۰ ثانیه وضعیت ورود را درخواست می‌کند. probe بدون shell، با timeout پنج‌ثانیه و محدودیت خروجی اجرا می‌شود؛ درخواست‌های هم‌زمان از یک promise مشترک استفاده می‌کنند. stdout/stderr خام، token، بخش‌هایی از API key و مسیرهای میزبان در response/log ظاهر نمی‌شوند.

ورود موفق با `authenticated` و روش ورود گزارش می‌شود؛ `connected` برای تأیید پاسخ‌دهی واقعی مدل محفوظ است و با موفقیت login status تولید نمی‌شود. در این مرحله هیچ درخواست inference اجرا نشده و `inferenceVerified` false است.

## محدودیت

حساب Codex متعلق به فرایند Backend و Platform است؛ هیچ credential یا thread تولیدی میان tenantها از طریق UI توزیع نمی‌شود. recipe generation و مجوزهای عملیات مدل در مرحلهٔ پیاده‌سازی آن قابلیت طراحی و آزمون می‌شوند.
