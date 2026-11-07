import type { ManagedSection } from "./contracts/editorial-settings";
import type { EditorialQueueWorkspace } from "./contracts/editorial";

export const editorialJobLabels: Record<string, string> = { queued: "در صف", running: "در حال تحریر", succeeded: "آماده شد", review_required: "نیازمند بررسی", failed: "خطای اجرا", cancelled: "لغوشده" };
const errors: Record<string, string> = { AUTO_NEWS_EXPIRED: "خبر هنگام اجرای خودکار از سقف سن مجاز عبور کرده است", AUTO_DATE_UNKNOWN: "تاریخ انتشار نامشخص است؛ تنظیم سردبیر اجازهٔ تحریر خودکار نمی‌دهد", AUTO_DATE_FUTURE: "تاریخ خبر در آینده است", AUTO_INPUT_UNAVAILABLE: "خبر دیگر در صندوق رسانه در دسترس نیست", AUTO_INPUT_OUTSIDE_START: "خبر پیش از نقطهٔ شروع خودکار دریافت شده است", AUTO_FRESHNESS_CHANGED: "خبر با تنظیم تازهٔ سن یا تاریخ انتشار منطبق نیست", AUTO_START_CHANGED: "خبر خارج از بازهٔ جدید پردازش خودکار است", CODEX_AUTH_REQUIRED: "ورود سرویس تولید محتوا معتبر نیست", CODEX_RATE_LIMITED: "ظرفیت تولید محتوا موقتاً محدود شده است", CODEX_TIMEOUT: "مهلت تحریر خبر تمام شد", CODEX_REWRITE_FAILED: "پاسخ سرویس تولید محتوا دریافت نشد", OUTPUT_INVALID: "خروجی ساختار معتبر نداشت", CONTENT_REVIEW_REQUIRED: "این خبر به بررسی انسانی نیاز دارد", INPUT_TOO_LARGE: "متن خبر از حد مجاز طولانی‌تر است", WORKER_INTERRUPTED: "اجرای پردازشگر قطع شد", ACCESS_REVOKED: "مجوز اجرای سردبیر تغییر کرده است", SERVICE_STOPPED: "سردبیر متوقف شد", AUTO_CONFIGURATION_INVALID: "تنظیمات یا دسترسی ورودی‌های سردبیر نیاز به بررسی دارد" };
export function editorialErrorMessage(code: string) { return errors[code] ?? "پردازش ناموفق بود؛ کد خطا را بررسی کنید."; }
export function editorialTime(value: string | null) { return value ? new Date(value).toLocaleString("fa-IR", { timeZone: "Asia/Tehran", dateStyle: "medium", timeStyle: "short" }) : "هنوز ثبت نشده"; }
export function editorActivityState(section: ManagedSection, activity?: EditorialQueueWorkspace["activity"][number]) {
  if (section.archived || section.paused) return { label: "متوقف", tone: "stopped", help: "این سردبیر تا فعال‌سازی دوباره خبر تولید نمی‌کند." };
  if (activity?.running) return { label: "در حال تحریر", tone: "running", help: "تولید خبر در حال اجراست؛ نتیجه در فعالیت‌ها نمایش داده می‌شود." };
  if (activity?.queued) return { label: "کار در صف دارد", tone: "queued", help: "خبر برای تحریر ثبت شده و منتظر پردازشگر است." };
  if (section.autoErrorCode) return { label: "نیازمند بررسی", tone: "failed", help: editorialErrorMessage(section.autoErrorCode) };
  if (activity?.failed) return { label: "خطای اجرا", tone: "failed", help: `${activity.failed.toLocaleString("fa-IR")} اجرا نیازمند رسیدگی است؛ روی شمار خطای اجرا بزنید تا علت و راه رفع آن را ببینید.` };
  if (activity?.reviewRequired) return { label: "نیازمند بررسی محتوا", tone: "review_required", help: `${activity.reviewRequired.toLocaleString("fa-IR")} ورودی برای بررسی انسانی کنار گذاشته شده است؛ علت و متن اصلی هر مورد در فعالیت‌ها دیده می‌شود.` };
  if (!section.autoEnabled) return { label: "خودکار خاموش", tone: "stopped", help: "برای تحریر خودکار خبرها، اجرای خودکار را در تنظیمات فعال کنید." };
  return { label: "منتظر خبر منطبق", tone: "active", help: "اجرای خودکار روشن است؛ خبرهای دارای دسترسی و دستهٔ معادل، مطابق تنظیمات انتخاب می‌شوند." };
}
