"use client";

import { useState } from "react";
import { Check, Info } from "lucide-react";
import type { EditorialFaction } from "@/lib/contracts/editorial-settings";
import { WorkspaceDialog } from "../workspace-dialog";

export function EditorialProfileEditor({ profile, existingNames, isNew, onApply, onClose }: {
  profile: EditorialFaction; existingNames: string[]; isNew: boolean;
  onApply: (value: EditorialFaction) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(profile);
  const [error, setError] = useState("");
  const dirty = draft.name !== profile.name || draft.viewpoint !== profile.viewpoint || draft.enabled !== profile.enabled;
  return <WorkspaceDialog title={isNew ? "پروفایل نگارش جدید" : `ویرایش ${profile.name}`} context="تنظیمات سراسری تحریریه · پروفایل نگارش" dirty={dirty} error={error} itemLabel="پروفایل" discardHelp="برای حفظ تغییرات، ادامهٔ ویرایش را انتخاب کنید و پروفایل را به تغییرات صفحه اضافه کنید." onClose={onClose}>
    <form className="panel editorial-settings profile-editor-form" onSubmit={event => {
      event.preventDefault();
      const value = { ...draft, name: draft.name.trim(), viewpoint: draft.viewpoint.trim() };
      if (value.name.length < 2 || value.viewpoint.length < 20) { setError("نام باید دست‌کم ۲ و تعریف دیدگاه دست‌کم ۲۰ نویسه داشته باشد."); return; }
      if (existingNames.includes(value.name)) { setError("پروفایلی با این نام وجود دارد؛ نام دیگری انتخاب کنید."); return; }
      onApply(value);
    }}>
      <div className="profile-editor-fields">
        <label>نام پروفایل<input required minLength={2} maxLength={80} value={draft.name} onChange={e => { setDraft(value => ({ ...value, name: e.target.value })); setError(""); }} placeholder="نامی که سردبیر در انتخاب دیدگاه می‌بیند" /></label>
        <label>تعریف دیدگاه و قواعد نگارش<textarea required minLength={20} maxLength={5000} rows={12} aria-describedby="profile-viewpoint-help" value={draft.viewpoint} onChange={e => { setDraft(value => ({ ...value, viewpoint: e.target.value })); setError(""); }} placeholder="زاویهٔ تحلیل، لحن، نحوهٔ انتخاب تیتر و قواعد نگارش را توضیح دهید." /></label>
        <div className="settings-field-help"><p id="profile-viewpoint-help">این تعریف، مبنای نگارش خبر در سرویس‌هایی است که این دیدگاه را انتخاب می‌کنند.</p><span>{draft.viewpoint.length.toLocaleString("fa-IR")} / ۵٬۰۰۰</span></div>
        <label className="editorial-check profile-enabled-control"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft(value => ({ ...value, enabled: e.target.checked }))} /><span><strong>قابل انتخاب برای سردبیر</strong><small>پروفایل غیرفعال در انتخاب دیدگاه برای تولید خبر تازه قابل استفاده نیست.</small></span></label>
      </div>
      <aside className="profile-editor-guide"><Info size={20} /><h3>اثر این تنظیم</h3><p>دیدگاه را اینجا تعریف می‌کنید. سردبیر شدت جهت‌گیری، طنز و رسمیت را در تنظیمات سرویس انتخاب می‌کند.</p><p>غیرفعال‌سازی روی تولید نسخه‌های تازه اثر دارد؛ سابقهٔ خبرهای قبلی حفظ می‌شود.</p><p>پس از افزودن تغییرات به صفحه، برای اعمال سراسری دکمهٔ «ثبت نسخهٔ جدید» را بزنید.</p></aside>
      <footer className="profile-editor-actions"><button type="submit" className="primary-button" disabled={!isNew && !dirty}><Check size={17} />{isNew ? "افزودن به فهرست" : "اعمال در تغییرات صفحه"}</button><span>ثبت نهایی از صفحهٔ تنظیمات انجام می‌شود.</span></footer>
    </form>
  </WorkspaceDialog>;
}
