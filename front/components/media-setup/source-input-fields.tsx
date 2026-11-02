"use client";

import { useId } from "react";
import type { SourceAccessInput } from "@/lib/contracts/media-setup";
import type { PlatformCategory } from "@/lib/contracts/platform-categories";

export function SourceInputFields({ value, categories, disabled = false, onChange }: {
  value: SourceAccessInput; categories: PlatformCategory[]; disabled?: boolean; onChange: (value: SourceAccessInput) => void;
}) {
  const id = useId();
  const selected = value.categoryMode === "all" ? categories.map(category => category.id) : value.categoryIds ?? [];
  const all = categories.length > 0 && selected.length === categories.length && selected.every(key => categories.some(category => category.id === key));
  const unavailable = selected.filter(key => !categories.some(category => category.id === key));
  function toggle(key: string) {
    const ids = selected.includes(key) ? selected.filter(item => item !== key) : [...selected, key];
    const allSelected = ids.length === categories.length && ids.every(item => categories.some(category => category.id === item));
    onChange({ ...value, categoryMode: allSelected ? "all" : "selected", categoryIds: allSelected ? [] : ids });
  }
  return <fieldset className="source-input-fields" disabled={disabled}>
    <fieldset className="media-source-type-choice"><legend>نوع منبع</legend>{([ ["website", "وب‌سایت"], ["social", "شبکهٔ اجتماعی"] ] as const).map(([type, label]) => <label className={value.sourceType === type ? "selected" : ""} key={type}><input type="radio" name={`${id}-type`} checked={value.sourceType === type} onChange={() => onChange(type === "website" ? { sourceType: type, url: value.url, categoryMode: "all", categoryIds: [] } : { sourceType: type, url: value.url })} />{label}</label>)}</fieldset>
    <label className="media-source-link-field">لینک منبع<input type="url" required maxLength={2048} pattern="https://.*" value={value.url} onChange={event => onChange({ ...value, url: event.target.value })} placeholder={value.sourceType === "website" ? "لینک وب‌سایت خبری را وارد کنید؛ مثل https://example.com" : "لینک کانال یا صفحهٔ شبکهٔ اجتماعی را وارد کنید"} dir="ltr" /></label>
    {value.sourceType === "website" && <div className="media-source-category-choice"><b>دسته‌بندی خبرهای این منبع</b><p>انتخاب این بخش فقط برای همین منبع است.</p><div className="media-source-category-options">
      <label className="media-source-all-categories"><input type="checkbox" checked={all} disabled={!categories.length} onChange={event => onChange({ ...value, categoryMode: event.target.checked ? "all" : "selected", categoryIds: [] })} /><span>همهٔ دسته‌ها</span></label>
      {categories.map(category => <label key={category.id}><input type="checkbox" checked={selected.includes(category.id)} onChange={() => toggle(category.id)} /><span>{category.nameFa}</span></label>)}
      {unavailable.map(key => <label key={key} className="source-category-unavailable"><input type="checkbox" checked onChange={() => toggle(key)} /><span>دستهٔ خارج از دسترس؛ برای حذف تیک را بردارید</span></label>)}
    </div>{!categories.length && <p>دستهٔ فعالی در کاتالوگ موجود نیست؛ سوپر ادمین باید دسته‌بندی‌ها را تعریف کند.</p>}</div>}
  </fieldset>;
}
