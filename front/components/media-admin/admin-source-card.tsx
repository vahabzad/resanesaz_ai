"use client";
import { useState, type FormEvent } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import type { AdminSource, MediaOverview } from "@/lib/contracts/media-overview";

export function AdminSourceCard({ row, overview, canManage, refresh }: { row: AdminSource; overview: MediaOverview; canManage: boolean; refresh: () => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pendingIds = row.categoryRequests.filter(request => request.status === "pending").flatMap(request => request.categoryIds);
  const available = overview.categories.filter(category => !row.categoryIds.includes(category.id) && !pendingIds.includes(category.id));
  const canRequest = row.sourceType === "website" && !row.allCategories && (row.accessGranted || ["draft", "pending", "crawler_queued", "crawler_failed"].includes(row.status));
  const labels: Record<string, string> = { draft: "پیش‌نویس", pending: overview.request.status === "approved" ? "در انتظار بررسی منبع" : "منتظر تأیید رسانه", rejected: "درخواست منبع رد شده", crawler_queued: "در صف ساخت کراولر", crawler_failed: "ساخت کراولر ناموفق بود", access_granted: "دسترسی فعلاً غیرفعال است" };
  const crawlerLabels: Record<string, string> = { active: "فعال", paused: "متوقف", degraded: "نیازمند رسیدگی", failed: "خطا", building: "در حال آماده‌سازی" };
  async function act(remove: boolean) {
    setBusy(true); setError(""); setMessage("");
    try {
      await apiRequest(`/api/v1/media/sources/${encodeURIComponent(row.id)}${remove ? "" : "/categories"}`, remove ? undefined : { categoryIds: selected }, remove ? "DELETE" : "POST");
      setAdding(false); setRemoving(false); setSelected([]); setDone(remove);
      setMessage(remove ? "منبع از رسانه حذف شد." : "درخواست دسته‌های بیشتر ثبت شد؛ دسترسی فعلی شما تا زمان بررسی حفظ می‌شود.");
      try { await refresh(); } catch { setError("تغییر ذخیره شد، اما دریافت فهرست ناموفق بود؛ وضعیت را تازه‌سازی کنید."); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ثبت تغییر انجام نشد."); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); if (selected.length) void act(false); }
  return <article><div className="admin-source-card-head"><div><b>{row.name}</b><a href={row.url} dir="ltr" target="_blank" rel="noreferrer">{row.url}</a></div><span className={`admin-source-state ${row.accessGranted ? "granted" : ""}`}>{row.accessGranted ? "دسترسی تأیید شده" : labels[row.status] ?? "در حال بررسی"}</span></div><div className="admin-source-meta"><span>{row.sourceType === "website" ? "وب‌سایت" : "شبکهٔ اجتماعی"}</span>{row.crawlerStatus && <span>وضعیت کراولر: {crawlerLabels[row.crawlerStatus] ?? "نامشخص"}</span>}</div>
    {row.sourceType === "website" && <div className="admin-source-categories">{row.allCategories ? <span>همهٔ دسته‌ها</span> : row.categories.length ? row.categories.map(category => <span key={category}>{category}</span>) : <span>دسته‌ای ثبت نشده است</span>}</div>}
    {row.categoryRequests.map(request => <p className={`admin-category-request ${request.status}`} key={request.id}><b>{request.status === "pending" ? "دسته‌های در انتظار تأیید" : "درخواست قبلی دسته رد شده"}:</b> {request.categories.join("، ")}</p>)}
    {canManage && !done && <div className="admin-source-actions">{canRequest && <button className="secondary-button" type="button" disabled={busy || removing} onClick={() => setAdding(!adding)}>{adding ? <X size={14} /> : <Plus size={14} />}{adding ? "بستن درخواست دسته" : "درخواست دسته‌بندی بیشتر"}</button>}<button type="button" className="secondary-button" disabled={busy} onClick={() => { setRemoving(!removing); setAdding(false); }}><Trash2 size={14} />حذف منبع</button></div>}
    {adding && <form className="admin-additional-categories" onSubmit={submit}><fieldset disabled={busy}><legend>دسته‌های جدید موردنیاز</legend><p>دسته‌های دارای دسترسی و درخواست‌های در انتظار تأیید در این انتخاب نمایش داده نمی‌شوند.</p><div>{available.map(category => <label key={category.id}><input type="checkbox" checked={selected.includes(category.id)} onChange={event => setSelected(current => event.target.checked ? [...current, category.id] : current.filter(id => id !== category.id))} />{category.nameFa}</label>)}</div>{!available.length && <p>دستهٔ تازه‌ای برای درخواست وجود ندارد.</p>}<button type="submit" className="primary-button" disabled={!selected.length || busy}>ارسال درخواست دسته‌بندی</button></fieldset></form>}
    {removing && <div className="admin-remove-source" role="group" aria-label="تأیید حذف منبع"><p>این منبع از رسانهٔ شما حذف و دریافت خبرهایش متوقف می‌شود. درخواست‌های باز آن هم لغو می‌شوند.</p><button type="button" className="primary-button" disabled={busy} onClick={() => void act(true)}>حذف از رسانه</button><button type="button" className="secondary-button" disabled={busy} onClick={() => setRemoving(false)}>انصراف</button></div>}
    {message && <p role="status" className="editorial-feedback">{message}</p>}{error && <p role="alert" className="editorial-feedback error">{error}</p>}
  </article>;
}

