"use client";

import { useState, type FormEvent } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import type { PlatformCategory } from "@/lib/contracts/platform-categories";
import { CategoryNameFields } from "./category-name-fields";

const emptyForm = { nameFa: "", nameEn: "", nameAr: "" };

export function PlatformCategories({ initialCategories }: { initialCategories: PlatformCategory[] }) {
  const [categories, setCategories] = useState(initialCategories);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<PlatformCategory | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(null);
    try {
      if (editing) {
        const updated = await apiRequest<PlatformCategory>(`/api/v1/platform/categories/${encodeURIComponent(editing.id)}`, { ...form, active: editing.active }, "PATCH");
        setCategories((items) => items.map((item) => item.id === updated.id ? updated : item));
      } else {
        const created = await apiRequest<PlatformCategory>("/api/v1/platform/categories", form);
        setCategories((items) => [...items, created].sort((a, b) => a.sortOrder - b.sortOrder));
      }
      setEditing(null); setForm(emptyForm);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ذخیرهٔ دسته‌بندی انجام نشد."); }
    finally { setPending(false); }
  }

  function startEdit(category: PlatformCategory) {
    setEditing(category); setForm({ nameFa: category.nameFa, nameEn: category.nameEn, nameAr: category.nameAr }); setError(null);
  }

  async function toggleActive(category: PlatformCategory) {
    setPending(true); setError(null);
    try {
      const updated = await apiRequest<PlatformCategory>(`/api/v1/platform/categories/${encodeURIComponent(category.id)}`, { nameFa: category.nameFa, nameEn: category.nameEn, nameAr: category.nameAr, active: !category.active }, "PATCH");
      setCategories((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تغییر وضعیت دسته‌بندی انجام نشد."); }
    finally { setPending(false); }
  }

  return <div className="platform-content platform-categories-workspace">
    <section className="panel platform-category-form-panel">
      <div className="platform-section-head"><h2>{editing ? "ویرایش دسته‌بندی" : "افزودن دسته‌بندی"}</h2>{editing && <button type="button" className="secondary-button" onClick={() => { setEditing(null); setForm(emptyForm); setError(null); }}><X size={15} />انصراف از ویرایش</button>}</div>
      <p>برای هر عنوان، معادل فارسی، انگلیسی و عربی را ثبت کنید. دسته‌های فعال برای درخواست منابع وب‌سایت نمایش داده می‌شوند.</p>
      <form className="platform-category-form" onSubmit={(event) => void save(event)}>
        <CategoryNameFields value={form} onChange={setForm} disabled={pending} />
        {error && <p className="editorial-feedback error" role="alert">{error}</p>}
        <button className="primary-button" disabled={pending}>{pending ? "در حال ذخیره…" : editing ? <><Check size={15} />ذخیرهٔ ویرایش</> : <><Plus size={15} />ثبت دسته‌بندی</>}</button>
      </form>
    </section>
    <section className="panel platform-category-list-panel">
      <div className="platform-section-head"><h2>دسته‌بندی‌ها</h2><span>{categories.length.toLocaleString("fa-IR")} مورد</span></div>
      {!categories.length ? <p className="media-setup-note">هنوز دسته‌بندی‌ای ثبت نشده است.</p> : <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>فارسی</th><th>English</th><th>العربية</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>{categories.map((item) => <tr key={item.id}><td><b>{item.nameFa}</b></td><td dir="ltr">{item.nameEn}</td><td>{item.nameAr}</td><td>{item.active ? "فعال" : "غیرفعال"}</td><td><div className="platform-row-actions"><button disabled={pending} onClick={() => startEdit(item)}><Pencil size={14} />ویرایش</button><button disabled={pending} onClick={() => void toggleActive(item)}>{item.active ? "غیرفعال‌کردن" : "فعال‌کردن"}</button></div></td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}
