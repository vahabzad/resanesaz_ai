"use client";

import { EditorialDatePicker } from "./editorial-date-picker";

export function formatAutomaticStart(since?: string | null) {
  return since ? `از ${new Date(since).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })} به وقت تهران` : "همهٔ اخبار پردازش‌نشده";
}

export function AutomaticStartControls({ since, startNow, disabled, onChange }: { since: string | null; startNow: boolean; disabled: boolean; onChange: (since: string | null, startNow: boolean) => void }) {
  const mode = startNow ? "now" : since ? "since" : "all";
  return <div>
    <label>شروع پردازش خودکار<select value={mode} disabled={disabled} onChange={e => {
      if (e.target.value === "since") onChange(new Date().toISOString(), false);
      else onChange(null, e.target.value === "now");
    }}>
      <option value="all">همهٔ اخبار پردازش‌نشده</option>
      <option value="now">فقط اخبار دریافت‌شده پس از ذخیرهٔ این تنظیم</option>
      <option value="since">از تاریخ و ساعت مشخص</option>
    </select></label>
    {mode === "since" && since && <EditorialDatePicker value={since} disabled={disabled} onChange={value => onChange(value, false)} />}
    <p className="editorial-help">مبنا زمان دریافت خبر در سامانه است. خبرهای دقیقاً در زمان انتخابی هم مشمول‌اند. این نقطه پس از توقف یا بازکردن دوبارهٔ برنامه ثابت می‌ماند؛ برای شروع تازه، دوباره گزینهٔ «پس از ذخیره» را انتخاب کنید.</p>
    <p className="editorial-help">خبرهای قبلاً پردازش‌شده تکرار نمی‌شوند. با جلو بردن نقطهٔ شروع، کارهای خودکارِ بازِ خارج از بازه لغو می‌شوند؛ اجرای دوبارهٔ کار لغوشده با تلاش مجدد دستی است. انتخاب دستی خبرهای قدیمی همچنان ممکن است.</p>
  </div>;
}
