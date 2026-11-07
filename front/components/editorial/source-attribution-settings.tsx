"use client";
import { defaultSourceAttribution, type SourceAttributionSettings } from "@/lib/contracts/editorial-settings";
import { FormSelect } from "../form-select";

export function SourceAttributionControls({ value = defaultSourceAttribution, disabled, onChange }: { value?: SourceAttributionSettings; disabled?: boolean; onChange: (value: SourceAttributionSettings) => void }) {
  const options = [{ value: "named", label: "ذکر نام دقیق منبع" }, { value: "omit", label: "بدون معرفی منبع در متن" }];
  return <div className="service-editor-group-body"><p>برای خبرهای دریافتی از هر نوع منبع، شیوهٔ معرفی منبع را انتخاب کنید. این انتخاب در متن خبر و نسخهٔ اجتماعیِ تولیدهای بعدی اعمال می‌شود.</p><div className="editorial-settings-grid"><FormSelect name="attribution-social" label="منابع شبکه‌های اجتماعی" options={options} value={value.social} disabled={disabled} onChange={social => onChange({ ...value, social: social as SourceAttributionSettings["social"] })} /><FormSelect name="attribution-website" label="منابع وب‌سایت" options={options} value={value.website} disabled={disabled} onChange={website => onChange({ ...value, website: website as SourceAttributionSettings["website"] })} /></div><p>با ذکر منبع اجتماعی، نام کانال یا پیج همراه نام شبکه می‌آید؛ اگر نام ثبت نشده باشد از آیدی آن استفاده می‌شود. نام دامنه جای کانال نوشته نمی‌شود.</p><p>«بدون معرفی منبع» عبارت‌هایی مثل «بر اساس مطلب منتشرشده در…» را حذف می‌کند. نام گویندهٔ نقل‌قول و انتساب ادعاها حفظ می‌شود؛ نام منبع در سابقهٔ داخلی خبر باقی می‌ماند.</p></div>;
}
