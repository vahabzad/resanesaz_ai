"use client";

import { socialOutputFormats, type SocialOutputSettings } from "@/lib/contracts/editorial-settings";

export function SocialOutputControls({ value, disabled, onChange }: { value: SocialOutputSettings; disabled: boolean; onChange: (value: SocialOutputSettings) => void }) {
  const reserved = value.prefix.trim().length + value.suffix.trim().length + (value.prefix.trim() ? 2 : 0) + (value.suffix.trim() ? 2 : 0);
  return <fieldset className="editorial-faction social-output-settings" disabled={disabled}><legend>خروجی شبکهٔ اجتماعی</legend>
    <p className="editorial-help">قالب پیش‌فرض پست‌های این سرویس را تعیین کنید. این تنظیم روی خبرهای تازه و بازسازی خروجی اعمال می‌شود؛ خروجی قبلی هر خبر حفظ می‌شود.</p>
    <div className="editorial-settings-grid"><label>ترکیب متن پست<select value={value.format} onChange={event => onChange({ ...value, format: event.target.value as SocialOutputSettings["format"] })}>{Object.entries(socialOutputFormats).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select><small>اگر لید خالی باشد، پاراگراف نخست متن استفاده می‌شود.</small></label>
      <label>حداکثر طول پست<input type="number" required min={100} max={2000} value={value.maxLength} onChange={event => onChange({ ...value, maxLength: Number(event.target.value) })} /><small>۱۰۰ تا ۲٬۰۰۰ نویسه؛ متن ثابت هم در این سقف حساب می‌شود.</small></label>
      <label>متن ثابت ابتدای پست<input maxLength={100} value={value.prefix} onChange={event => onChange({ ...value, prefix: event.target.value })} placeholder="مثلاً 🔴 خبر فوری" /></label>
      <label>متن ثابت انتهای پست<textarea rows={2} maxLength={300} value={value.suffix} onChange={event => onChange({ ...value, suffix: event.target.value })} placeholder="مثلاً نام رسانه، هشتگ یا نشانی عمومی کانال" /></label>
    </div>
    <label className="editorial-check"><input type="checkbox" checked={value.includeImage} onChange={event => onChange({ ...value, includeImage: event.target.checked })} />تصویر خبر همراه پست باشد</label>
    <p className="editorial-help">متن از نسخهٔ اصلی خبر برداشته می‌شود و در صورت عبور از سقف، کوتاه و با «…» مشخص می‌شود. متن ثابت عیناً اضافه می‌شود. پست نهایی هر خبر همچنان جداگانه قابل ویرایش و نیازمند تأیید است.</p>
    {reserved > value.maxLength - 20 && <p role="alert" className="editorial-feedback error">متن ثابت بیش از حد طولانی است؛ برای متن خبر دست‌کم ۲۰ نویسه جا بگذارید.</p>}
  </fieldset>;
}
