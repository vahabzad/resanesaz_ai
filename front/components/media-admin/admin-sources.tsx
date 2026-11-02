"use client";
import { useState, type FormEvent } from "react";
import { Plus, Radio, X } from "lucide-react";
import { SourceInputFields } from "@/components/media-setup/source-input-fields";
import { apiRequest } from "@/lib/api-client";
import type { SourceAccessInput } from "@/lib/contracts/media-setup";
import type { MediaOverview } from "@/lib/contracts/media-overview";
import { AdminSourceCard } from "./admin-source-card";
export function AdminSources({ overview, refresh, canAdd }: { overview: MediaOverview; refresh: () => Promise<void>; canAdd: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<SourceAccessInput>({ sourceType: "website", url: "", categoryMode: "all", categoryIds: [] });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    if (value.sourceType === "website" && value.categoryMode === "selected" && !value.categoryIds?.length) { setError("حداقل یک دسته یا همهٔ دسته‌ها را انتخاب کنید."); return; }
    setBusy(true);
    try {
      await apiRequest("/api/v1/media/source-access-requests", value);
      setOpen(false); setValue({ sourceType: "website", url: "", categoryMode: "all", categoryIds: [] }); setMessage("درخواست منبع ثبت شد و نتیجهٔ بررسی در این فهرست نمایش داده می‌شود.");
      try { await refresh(); } catch { setError("منبع ثبت شد، اما دریافت فهرست ناموفق بود؛ وضعیت را تازه‌سازی کنید."); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ثبت منبع انجام نشد."); }
    finally { setBusy(false); }
  }
  return <section className="panel admin-sources"><header className="admin-section-title"><Radio size={20} /><div><h2>منابع من</h2><p>فهرست منابع و وضعیت دسترسی آن‌ها</p></div>{canAdd && <button className="primary-button" disabled={busy} type="button" onClick={() => setOpen(!open)}>{open ? <X size={15} /> : <Plus size={15} />}{open ? "بستن فرم" : "افزودن منبع جدید"}</button>}</header>
    {message && <p className="editorial-feedback" role="status">{message}</p>}{error && <p className="editorial-feedback error" role="alert">{error}</p>}
    {open && <form className="admin-source-form" onSubmit={event => void submit(event)}><SourceInputFields value={value} categories={overview.categories} onChange={setValue} disabled={busy} /><p>درخواست این منبع برای سوپر ادمین ارسال می‌شود و به معنی تأیید دسترسی نیست.</p><button className="primary-button" disabled={busy} type="submit">{busy ? "در حال ثبت…" : "ثبت درخواست منبع"}</button></form>}
    {!overview.sources.length ? <p className="admin-empty">هنوز منبعی اضافه نکرده‌اید. از «افزودن منبع جدید» استفاده کنید.</p> : <div className="admin-source-list">{overview.sources.map(row => <AdminSourceCard key={row.id} row={row} overview={overview} canManage={canAdd} refresh={refresh} />)}</div>}
  </section>;
}

