# نقشهٔ راه

Roadmap بر اساس gate پیش می‌رود، نه تاریخ حدسی. عبور از هر فاز نیازمند تحقق معیار خروج آن است.

## فاز ۰ — کشف و جهت طراحی (فعال)

- بررسی سه مخزن مرجع
- تعریف دامنه، معماری و الزامات امنیتی
- Design Brief داشبورد
- ساخت نمونهٔ داشبورد با دادهٔ Mock قراردادی

خروج: تأیید صریح مالک محصول روی جهت UI/UX داشبورد.

## فاز ۱ — پایهٔ محصول

- monorepo و Design System تثبیت‌شده
- هستهٔ Media، User، Membership و Role
- navigation و shell اصلی داشبورد
- قرارداد job/progress/error
- Audit Log پایه

خروج: کاربر مجاز می‌تواند وارد یک رسانه شود و shell واقعی را ببیند.

## فاز ۲ — دریافت و کراولر

- اتصال CrawlerGenerator از طریق adapter
- منابع، نسخهٔ crawler، اجرا، health و schedule
- ورود Raw Article، deduplication و quarantine ورودی مشکوک
- UI صف ورودی و خطاها

خروج: خبر واقعی از منبع وارد Inbox رسانه می‌شود و قابل ردیابی است.

## فاز ۳ — تحریریه

- اتصال قابلیت‌های sardabir
- Editorial Policy نسخه‌دار
- Story، Article Version و Approval
- صف تحریریه، مقایسهٔ نسخه‌ها و تأیید انسانی

خروج: خبر خام به نسخهٔ تأییدشدهٔ قابل انتشار تبدیل می‌شود.

## فاز ۴ — سایت و انتشار وب

- adapter سایت‌ساز و lifecycle سایت
- قرارداد تحویل محتوا به سایت ساخته‌شده
- preview، schedule، publication result و retry

خروج: یک خبر تأییدشده بدون انتشار تکراری روی سایت مقصد قرار می‌گیرد.

## فاز ۵ — بات‌ها و انتشار اجتماعی

- vault/secrets برای credentialها
- حداقل یک adapter شبکهٔ اجتماعی
- Destination، rendition، پیش‌نمایش و صف انتشار
- rate limit، retry و توقف اضطراری

خروج: یک خبر با قالب متناسب روی سایت و حداقل یک کانال منتشر می‌شود.

## فاز ۶ — سخت‌سازی و عرضه

- threat-model review و abuse cases
- تست‌های authorization و tenant isolation
- SAST/dependency/secret scanning
- تست نفوذ API و workerها
- backup/restore، observability و runbook رخداد

خروج: معیارهای امنیت، بازیابی و عملیات production پاس شده‌اند.

