"use client";
import { useState } from "react";
import type { EditorialWorkspace } from "@/lib/contracts/editorial";
import { editorialLanguages } from "@/lib/contracts/editorial-settings";

export const editorialStatusLabels = { ready: "تحریرشده؛ نیازمند تأیید", draft: "پیش‌نویس", approved: "تأییدشده", rejected: "ردشده", changes_requested: "نیازمند اصلاح" };
export function EditorialStoryList({ data, readyOnly, busy, search, open }: { data: EditorialWorkspace; readyOnly: boolean; busy: boolean; search: (query: string) => Promise<void>; open: (id: string) => Promise<void> }) {
  const [filters, setFilters] = useState({ query: "", status: "", sectionId: "", sourceId: "", language: "", from: "", to: "", pageSize: "20" });
  function params(page: number) {
    const query = new URLSearchParams({ page: String(page), pageSize: filters.pageSize });
    Object.entries(filters).forEach(([key, value]) => { if (value && key !== "pageSize") query.set(key, key === "from" ? `${value}T00:00:00+03:30` : key === "to" ? `${value}T23:59:59.999+03:30` : value); });
    return query.toString();
  }
  const pagination = data.pagination;
  const update = (key: keyof typeof filters, value: string) => setFilters(f => ({ ...f, [key]: value }));
  return <section className="panel editorial-settings"><h3>{readyOnly ? "خبرهای آمادهٔ بررسی و انتشار" : "خبرهای تحریریه"}</h3><p className="editorial-help">برای خواندن، ویرایش و بررسی نسخه‌ها، روی خبر بزنید؛ خبر در پنجرهٔ کاری مستقل باز می‌شود.</p>
    <form className="editorial-list-filters" onSubmit={e => { e.preventDefault(); void search(params(1)); }}>
      <label>جست‌وجوی عنوان<input value={filters.query} maxLength={200} onChange={e => update("query", e.target.value)} /></label>
      <label>وضعیت<select value={filters.status} onChange={e => update("status", e.target.value)}><option value="">همهٔ وضعیت‌ها</option>{Object.entries(editorialStatusLabels).filter(([value]) => !readyOnly || ["ready", "approved"].includes(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>بخش تحریریه<select value={filters.sectionId} onChange={e => update("sectionId", e.target.value)}><option value="">همهٔ بخش‌ها</option>{data.sections.map(s => <option key={s.id} value={s.id}>{s.name}{s.archived ? " (حذف‌شده)" : ""}</option>)}</select></label>
      <label>منبع خبر<select value={filters.sourceId} onChange={e => update("sourceId", e.target.value)}><option value="">همهٔ منابع</option>{data.inputOptions.sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>زبان<select value={filters.language} onChange={e => update("language", e.target.value)}><option value="">همهٔ زبان‌ها</option>{Object.entries(editorialLanguages).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>از تاریخ ویرایش<input type="date" value={filters.from} onChange={e => update("from", e.target.value)} /></label>
      <label>تا تاریخ ویرایش<input type="date" min={filters.from || undefined} value={filters.to} onChange={e => update("to", e.target.value)} /></label>
      <label>تعداد در صفحه<select value={filters.pageSize} onChange={e => update("pageSize", e.target.value)}>{[10,20,50].map(n => <option key={n} value={n}>{n.toLocaleString("fa-IR")}</option>)}</select></label>
      <button className="primary-button" disabled={busy}>اعمال فیلتر</button><button type="button" className="secondary-button" disabled={busy} onClick={() => { setFilters({ query:"",status:"",sectionId:"",sourceId:"",language:"",from:"",to:"",pageSize:"20" }); void search("page=1&pageSize=20"); }}>پاک‌کردن فیلترها</button>
    </form>
    <p className="editorial-help">تاریخ‌ها میلادی و بر اساس ساعت تهران‌اند. فیلتر بخش، بخش اصلی و ثانویه را در بر می‌گیرد.</p>
    {data.stories.map(s => <button key={s.id} className="editorial-story-row" disabled={busy} onClick={() => void open(s.id)}><span className="editorial-story-heading"><b dir="auto">{s.title}</b><small className="editorial-story-source">منبع: {s.sourceNames?.length ? s.sourceNames.join("، ") : "ثبت نشده"}</small></span><span>{s.sectionName} · {editorialLanguages[s.language as keyof typeof editorialLanguages]}</span><span className={`editorial-state ${s.status}`}>{editorialStatusLabels[s.status]}</span><small>نسخهٔ {s.revision.toLocaleString("fa-IR")} · {new Date(s.updatedAt).toLocaleString("fa-IR")}</small></button>)}
    {!data.stories.length && <p className="inbox-empty">{pagination.total ? "صفحه را تازه‌سازی کنید." : "خبری با این شرایط پیدا نشد؛ فیلترها را بررسی کنید یا از میز تحریریه خبر اضافه کنید."}</p>}
    <nav aria-label="صفحه‌بندی اخبار" className="editorial-toolbar"><span>{pagination.total.toLocaleString("fa-IR")} خبر · صفحهٔ {pagination.page.toLocaleString("fa-IR")} از {pagination.pageCount.toLocaleString("fa-IR")}</span><button className="secondary-button" disabled={busy || pagination.page <= 1} onClick={() => void search(params(pagination.page - 1))}>قبلی</button><button className="secondary-button" disabled={busy || pagination.page >= pagination.pageCount} onClick={() => void search(params(pagination.page + 1))}>بعدی</button><button className="secondary-button" disabled={busy} onClick={() => void search(params(pagination.page))}>تازه‌سازی فهرست</button></nav>
  </section>;
}
