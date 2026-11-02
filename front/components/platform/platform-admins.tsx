"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Edit2, LogIn, Plus, ShieldCheck, Trash2, UserRoundPlus, Users, X } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import type { PlatformMediaAdmin } from "@/lib/contracts/platform-admins";

function createdDate(value: string) {
  return new Date(value).toLocaleDateString("fa-IR", { timeZone: "Asia/Tehran", year: "numeric", month: "long", day: "numeric" });
}

export function PlatformAdmins({ initialAdmins }: { initialAdmins: PlatformMediaAdmin[] }) {
  const router = useRouter();
  const [admins, setAdmins] = useState(initialAdmins);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformMediaAdmin | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("initialPassword") ?? "");
    const confirmation = String(data.get("confirmPassword") ?? "");
    if ((password || confirmation) && password !== confirmation) {
      setError("گذرواژهٔ جدید و تکرار آن یکسان نیستند.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const payload = {
        name: data.get("name"),
        email: data.get("email"),
        ...(password ? { initialPassword: password } : {}),
      };
      const endpoint = editing ? "/api/v1/platform/admins/" + encodeURIComponent(editing.id) : "/api/v1/platform/admins";
      const admin = await apiRequest<PlatformMediaAdmin>(endpoint, payload, editing ? "PATCH" : "POST");
      setAdmins((current) => editing ? current.map((item) => item.id === admin.id ? admin : item) : [admin, ...current]);
      form.reset();
      setFormOpen(false);
      setEditing(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ساخت ادمین انجام نشد.");
    } finally {
      setPending(false);
    }
  }

  async function removeAdmin(admin: PlatformMediaAdmin) {
    if (admin.mediaCount > 0) {
      setError("حذف این ادمین ممکن نیست؛ ابتدا عضویت او را از رسانه‌هایش منتقل یا حذف کنید.");
      return;
    }
    if (!window.confirm("حساب «" + admin.name + "» و نشست‌های فعالش حذف شود؟ این کار قابل بازگشت نیست.")) return;
    setPending(true);
    setError(null);
    try {
      await apiRequest("/api/v1/platform/admins/" + encodeURIComponent(admin.id), undefined, "DELETE");
      setAdmins((current) => current.filter((item) => item.id !== admin.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "حذف ادمین انجام نشد.");
    } finally {
      setPending(false);
    }
  }

  async function enterAsAdmin(admin: PlatformMediaAdmin) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/platform/admins/" + encodeURIComponent(admin.id) + "/impersonate", { method: "POST", cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error?.message ?? "ورود به حساب ادمین انجام نشد.");
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ورود به حساب ادمین انجام نشد.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="platform-admins-page">
      <section className="inbox-heading platform-admins-heading">
        <div><span>مدیریت کاربران</span><h2>ادمین‌ها</h2><p>حساب‌های ادمین ساخته‌شده توسط سوپر ادمین را مدیریت کنید.</p></div>
        <button className="primary-button" onClick={() => { setError(null); setEditing(null); setFormOpen((open) => !open); }}>
          {formOpen && !editing ? <X size={17} /> : <Plus size={17} />}{formOpen && !editing ? "بستن فرم" : "ساخت ادمین"}
        </button>
      </section>

      {error && <p className="editorial-feedback error" role="alert">{error}</p>}

      {formOpen && (
        <form key={editing?.id ?? "new"} className="platform-admin-form panel" onSubmit={(event) => void createAdmin(event)}>
          <div className="platform-admin-form-heading"><UserRoundPlus size={19} /><div><h3>{editing ? "ویرایش حساب ادمین" : "ساخت حساب ادمین"}</h3><p>{editing ? "برای تغییر گذرواژه، فیلدهای گذرواژه را تکمیل کنید." : "این حساب تا زمانی که برایش رسانه ساخته شود، عضویت رسانه‌ای ندارد."}</p></div></div>
          <div className="platform-admin-form-grid">
            <label>نام و نام خانوادگی<input name="name" autoComplete="name" minLength={2} maxLength={120} required disabled={pending} defaultValue={editing?.name ?? ""} /></label>
            <label>ایمیل<input name="email" type="email" autoComplete="email" maxLength={254} dir="ltr" required disabled={pending} defaultValue={editing?.email ?? ""} /></label>
            <label>گذرواژهٔ {editing ? "جدید" : "اولیه"}<input name="initialPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required={!editing} disabled={pending} /></label>
            <label>تکرار گذرواژه<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required={!editing} disabled={pending} /></label>
          </div>
          <p className="platform-admin-password-note">{editing ? "تغییر گذرواژه همهٔ نشست‌های فعال ادمین را باطل می‌کند." : "گذرواژه فقط برای ساخت حساب به API ارسال می‌شود و در فهرست یا گزارش‌ها نمایش داده نمی‌شود. آن را جداگانه و امن به ادمین بدهید."}</p>
          <div className="platform-admin-form-actions"><button className="primary-button" type="submit" disabled={pending}>{pending ? "در حال ذخیره…" : editing ? "ذخیرهٔ تغییرات" : "ساخت حساب ادمین"}</button><button className="secondary-button" type="button" disabled={pending} onClick={() => { setFormOpen(false); setEditing(null); setError(null); }}>انصراف</button></div>
        </form>
      )}

      <section className="panel platform-admin-list" aria-labelledby="platform-admin-list-title">
        <header className="platform-admin-list-heading"><div><ShieldCheck size={18} /><h3 id="platform-admin-list-title">فهرست ادمین‌ها</h3></div><span>{admins.length.toLocaleString("fa-IR")} حساب</span></header>
        {admins.length === 0 ? (
          <div className="platform-admin-empty"><Users size={24} /><b>هنوز ادمینی ساخته نشده است</b><span>از دکمهٔ «ساخت ادمین» برای ایجاد اولین حساب استفاده کنید.</span><button className="secondary-button" onClick={() => setFormOpen(true)}><Plus size={15} />ساخت اولین ادمین</button></div>
        ) : (
          <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>نام</th><th>ایمیل</th><th>تعداد رسانه</th><th>تاریخ ایجاد</th><th>اقدامات</th></tr></thead><tbody>{admins.map((admin) => <tr key={admin.id}><td><b>{admin.name}</b></td><td><span dir="ltr">{admin.email}</span></td><td>{admin.mediaCount.toLocaleString("fa-IR")}</td><td>{createdDate(admin.createdAt)}</td><td><div className="platform-admin-row-actions"><button className="icon-button" title="ویرایش ادمین" aria-label={"ویرایش " + admin.name} disabled={pending} onClick={() => { setEditing(admin); setFormOpen(true); setError(null); }}><Edit2 size={16} /></button><button className="icon-button" title="ورود با دسترسی این ادمین" aria-label={"ورود با دسترسی " + admin.name} disabled={pending} onClick={() => void enterAsAdmin(admin)}><LogIn size={16} /></button><button className="icon-button danger" title="حذف ادمین" aria-label={"حذف " + admin.name} disabled={pending} onClick={() => void removeAdmin(admin)}><Trash2 size={16} /></button></div></td></tr>)}</tbody></table></div>
        )}
      </section>
    </div>
  );
}
