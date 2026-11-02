"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import type { EditorialFaction } from "@/lib/contracts/editorial-settings";

export function EditorialProfileList({ profiles, savedProfiles, busy, onEdit, onAdd, onAddSuggestions, onRemove }: {
  profiles: EditorialFaction[]; savedProfiles: EditorialFaction[]; busy: boolean;
  onEdit: (profile: EditorialFaction) => void; onAdd: () => void; onAddSuggestions: () => void; onRemove: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [removeId, setRemoveId] = useState<string | null>(null);
  const filtered = profiles.filter(profile => profile.name.includes(query.trim()) && (status === "all" || profile.enabled === (status === "active")));
  return <section className="panel editorial-settings platform-profile-list" aria-labelledby="profile-list-title">
    <header className="settings-panel-heading"><div><h3 id="profile-list-title">پروفایل‌های نگارش</h3><p>دیدگاه‌ها و جناح‌های مجاز برای انتخاب سردبیر</p></div><div className="profile-list-header-actions"><button type="button" className="secondary-button" disabled={busy || profiles.length >= 30} onClick={onAddSuggestions}>افزودن دیدگاه‌های پیشنهادی</button><button type="button" className="secondary-button" disabled={busy || profiles.length >= 30} onClick={onAdd}><Plus size={17} />پروفایل جدید</button></div></header>
    <div className="profile-list-filters"><label><span><Search size={15} />جست‌وجوی پروفایل</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="جست‌وجو با نام…" disabled={busy} /></label><label>نمایش<select value={status} onChange={e => setStatus(e.target.value)} disabled={busy}><option value="all">همهٔ پروفایل‌ها</option><option value="active">فعال</option><option value="inactive">غیرفعال</option></select></label></div>
    <p className="profile-list-count">{filtered.length.toLocaleString("fa-IR")} از {profiles.length.toLocaleString("fa-IR")} پروفایل · حداکثر ۳۰ پروفایل</p>
    <div className="profile-list-rows">{filtered.map(profile => {
      const saved = savedProfiles.find(item => item.id === profile.id);
      const changed = !saved || saved.name !== profile.name || saved.viewpoint !== profile.viewpoint || saved.enabled !== profile.enabled;
      return <article className="profile-list-row" key={profile.id}>
        <div className="profile-row-heading"><h4>{profile.name}</h4><span className={`editorial-service-status ${profile.enabled ? "active" : "stopped"}`}>{profile.enabled ? "فعال" : "غیرفعال"}</span>{changed && <small className="profile-unsaved">{saved ? "تغییر ثبت‌نشده" : "جدید؛ ثبت‌نشده"}</small>}</div>
        <p className="profile-row-preview">{profile.viewpoint}</p>
        <div className="profile-row-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => onEdit(profile)} aria-label={`ویرایش پروفایل ${profile.name}`}><Pencil size={15} />مشاهده و ویرایش</button><button type="button" className="secondary-button profile-remove" disabled={busy} onClick={() => setRemoveId(profile.id)} aria-label={`حذف پروفایل ${profile.name}`}><Trash2 size={15} />حذف</button></div>
        {removeId === profile.id && <div className="profile-remove-confirm" role="alert"><strong>«{profile.name}» از نسخهٔ جدید حذف شود؟</strong><p>پس از ثبت نسخه، سرویس‌های وابسته برای تولید خبر تازه به دیدگاه دیگری نیاز دارند. سابقهٔ خبرها حفظ می‌شود.</p><div><button type="button" className="secondary-button editorial-stop" disabled={busy} onClick={() => { onRemove(profile.id); setRemoveId(null); }}>حذف از تغییرات صفحه</button><button type="button" className="secondary-button" disabled={busy} onClick={() => setRemoveId(null)}>انصراف</button></div></div>}
      </article>;
    })}</div>
    {!filtered.length && <div className="settings-empty"><h4>{profiles.length ? "پروفایلی با این شرایط پیدا نشد" : "هنوز پروفایلی تعریف نشده"}</h4><p>{profiles.length ? "نام جست‌وجو یا فیلتر وضعیت را تغییر دهید." : "بدون پروفایل، سردبیر می‌تواند از حالت بدون جهت استفاده کند."}</p></div>}
  </section>;
}
