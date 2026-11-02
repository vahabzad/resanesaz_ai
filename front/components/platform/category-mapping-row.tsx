"use client";
import { useState, type FormEvent } from "react";
import { Check, History, Plus, Save, X } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import type { CategoryMapping, CategoryMappingHistory, CategoryMappingWorkspace } from "@/lib/contracts/category-mappings";
import { FormSelect } from "@/components/form-select";
import { CategoryNameFields, type CategoryNames } from "./category-name-fields";

export function CategoryMappingRow({ row, categories, disabled, onSaving, onSaved }: {
  row: CategoryMapping; categories: CategoryMappingWorkspace["categories"]; disabled: boolean; onSaving: (busy: boolean) => void; onSaved: () => Promise<void>;
}) {
  const [selected, setSelected] = useState(row.mapped ? row.categoryId ?? "" : "");
  const [creating, setCreating] = useState(false);
  const [names, setNames] = useState<CategoryNames>({ nameFa: "", nameEn: "", nameAr: "" });
  const [error, setError] = useState("");
  const [history, setHistory] = useState<CategoryMappingHistory[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault(); setError(""); onSaving(true);
    try {
      await apiRequest(`/api/v1/platform/category-mappings/${row.id}`, { expectedRevision: row.revision, ...(creating ? { newCategory: names } : { categoryId: selected }) }, "PATCH");
      try { await onSaved(); }
      catch { setError("معادل‌سازی ذخیره شد، اما دریافت فهرست ناموفق بود؛ تازه‌سازی کنید."); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ثبت معادل‌سازی انجام نشد."); }
    finally { onSaving(false); }
  }
  async function toggleHistory() {
    if (showHistory) { setShowHistory(false); return; }
    setShowHistory(true); setHistoryError("");
    try { setHistory(await apiRequest<CategoryMappingHistory[]>(`/api/v1/platform/category-mappings/${row.id}/history`)); }
    catch { setHistoryError("دریافت سابقه انجام نشد؛ دوباره باز کنید."); }
  }
  return <article className={`category-mapping-row ${row.mapped ? "mapped" : "pending"}`}>
    <div className="category-mapping-origin"><span className={`category-mapping-status ${row.mapped ? "mapped" : "pending"}`}>{row.mapped ? <><Check size={13} />معادل‌سازی‌شده</> : "دستهٔ بدون معادل"}</span><b>{row.sourceName}</b><small dir="ltr">{row.sourceUrl}</small><div><span>دسته در سایت مرجع</span><strong>{row.rawName || "بدون دسته‌بندی در منبع"}</strong></div><small>{row.articleCount.toLocaleString("fa-IR")} خبر با این دسته</small></div>
    <form className="category-mapping-target" onSubmit={event => void save(event)}>
      {!creating ? <><FormSelect name={`category-${row.id}`} label="دستهٔ معادل در پلتفرم" required disabled={disabled} value={selected} onChange={setSelected} options={categories.map(category => ({ value: category.id, label: category.nameFa }))} />{!row.mapped && row.categoryName && <small>معادل قبلی «{row.categoryName}» غیرفعال شده است؛ دستهٔ فعال انتخاب کنید.</small>}<div className="category-mapping-row-actions"><button className="primary-button" type="submit" disabled={disabled || !selected || (row.mapped && selected === row.categoryId)}><Save size={14} />{row.mapped ? "ذخیرهٔ تغییر معادل" : "ثبت معادل‌سازی"}</button><button type="button" className="secondary-button" disabled={disabled} onClick={() => setCreating(true)}><Plus size={14} />دستهٔ جدید</button></div></> : <div className="category-mapping-quick-create"><b>ساخت دسته و استفاده برای همین ردیف</b><p>نام فارسی، انگلیسی و عربی را وارد کنید؛ دستهٔ تازه در کاتالوگ مشترک هم ثبت می‌شود.</p><div className="category-mapping-name-fields"><CategoryNameFields value={names} onChange={setNames} disabled={disabled} /></div><div className="category-mapping-row-actions"><button type="submit" className="primary-button" disabled={disabled}><Plus size={14} />ساخت دسته و معادل‌سازی</button><button type="button" className="secondary-button" disabled={disabled} onClick={() => setCreating(false)}><X size={14} />انصراف</button></div></div>}
      {error && <p className="editorial-feedback error" role="alert">{error}</p>}
      <div className="category-mapping-meta"><span>{row.mappedAt ? `آخرین تنظیم: ${new Date(row.mappedAt).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })}` : "هنوز معادلی ثبت نشده است"}</span><button type="button" onClick={() => void toggleHistory()} aria-expanded={showHistory}><History size={13} />سابقهٔ تغییرات</button></div>
      {showHistory && <div className="category-mapping-history">{historyError ? <p role="alert">{historyError}</p> : history === null ? <p>در حال دریافت سابقه…</p> : !history.length ? <p>سابقه‌ای ثبت نشده است.</p> : history.map(item => <p key={item.id}><b>{item.from ?? "بدون معادل"} ← {item.to}</b><small>{item.actor ?? "کاربر حذف‌شده"} · {new Date(item.createdAt).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })}</small></p>)}</div>}
    </form>
  </article>;
}
