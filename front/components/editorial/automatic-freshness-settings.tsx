"use client";
import { useId } from "react";
import { defaultAutomaticFreshness, type AutomaticFreshness } from "@/lib/contracts/editorial-settings";
import { FormSelect } from "../form-select";

export function formatAutomaticFreshness(value?: AutomaticFreshness) {
  const policy = value ?? defaultAutomaticFreshness;
  return `${policy.maxAgeHours === null ? "بدون سقف سن خبر" : `حداکثر سن خبر: ${policy.maxAgeHours.toLocaleString("fa-IR")} ساعت`} · ${policy.resumeMode === "new_only" ? "شروع تازه پس از فعال‌سازی" : "ادامهٔ بازه پس از فعال‌سازی"}`;
}
export function AutomaticFreshnessControls({ value = defaultAutomaticFreshness, disabled, onChange }: { value?: AutomaticFreshness; disabled: boolean; onChange: (value: AutomaticFreshness) => void }) {
  const id = useId();
  return <section className="automatic-freshness-settings" aria-label="تازگی خبر و فعال‌سازی دوباره">
    <h3>تازگی خبر و فعال‌سازی دوباره</h3>
    <FormSelect name={`${id}-resume`} label="پس از فعال‌سازی دوبارهٔ سردبیر" value={value.resumeMode} disabled={disabled} options={[{ value: "new_only", label: "فقط خبرهای دریافت‌شده از لحظهٔ فعال‌سازی" }, { value: "continue", label: "ادامهٔ بازهٔ قبلی، شامل خبرهای زمان توقف" }]} onChange={mode => onChange({ ...value, resumeMode: mode as AutomaticFreshness["resumeMode"] })} />
    <div className="editorial-settings-grid"><FormSelect name={`${id}-age`} label="محدودیت سن خبر" value={value.maxAgeHours === null ? "all" : "limited"} disabled={disabled} options={[{ value: "limited", label: "فقط خبرهای تازه در بازهٔ مشخص" }, { value: "all", label: "بدون سقف سن خبر" }]} onChange={mode => onChange({ ...value, maxAgeHours: mode === "all" ? null : 6 })} />{value.maxAgeHours !== null && <label>حداکثر سن خبر (ساعت)<input type="number" min={1} max={720} required disabled={disabled} value={value.maxAgeHours} onChange={event => onChange({ ...value, maxAgeHours: Number(event.target.value) })} /></label>}</div>
    <FormSelect name={`${id}-unknown`} label="خبر بدون تاریخ انتشار" value={value.unknownDatePolicy} disabled={disabled} options={[{ value: "skip", label: "وارد تحریر خودکار نشود" }, { value: "received", label: "زمان دریافت در سامانه مبنا باشد" }]} onChange={policy => onChange({ ...value, unknownDatePolicy: policy as AutomaticFreshness["unknownDatePolicy"] })} />
    <p className="editorial-help">سن خبر از تاریخ انتشار منبع محاسبه می‌شود؛ دریافت دوبارهٔ خبر قدیمی، آن را تازه نمی‌کند. خبر با تاریخ آینده تا رسیدن آن زمان وارد صف نمی‌شود. این قواعد پیش از تحریر و ثبت خروجی هم بررسی می‌شوند.</p>
    <p className="editorial-help">این تنظیمات فقط برای اجرای خودکار است؛ انتخاب دستی خبر قدیمی ممکن است. فعال‌سازی دوباره یا روشن‌کردن اجرای خودکار، طبق انتخاب بالا بازهٔ دریافت را نگه می‌دارد یا از همان لحظه شروع می‌کند. سقف سن خبر در هر دو حالت رعایت می‌شود.</p>
  </section>;
}
