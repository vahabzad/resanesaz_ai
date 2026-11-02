"use client";

import { useState } from "react";
import { ClipboardList, Clock3, RefreshCw } from "lucide-react";
import type { MediaRequestsWorkspace, PlatformMediaRequest } from "@/lib/contracts/media-requests";
import { apiRequest } from "@/lib/api-client";
import { MediaRequestRow } from "./media-request-row";

const filters = [["pending", "در انتظار بررسی"], ["approved", "تأییدشده"], ["rejected", "ردشده"], ["all", "همهٔ درخواست‌ها"]] as const;

export function MediaRequests({ initial }: { initial: MediaRequestsWorkspace }) {
  const [workspace, setWorkspace] = useState(initial);
  const [status, setStatus] = useState("pending");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function load(next = status, page = workspace.page) {
    const result = await apiRequest<MediaRequestsWorkspace>(`/api/v1/platform/media-requests?${new URLSearchParams({ status: next, page: String(page) })}`);
    setWorkspace(result); setStatus(next);
  }
  async function refresh(next = status, page = workspace.page) {
    setBusy(true); setError(""); setMessage("");
    try { await load(next, page); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "دریافت درخواست‌ها ناموفق بود."); }
    finally { setBusy(false); }
  }
  async function review(row: PlatformMediaRequest, action: "approve" | "reject", note: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      await apiRequest(`/api/v1/platform/media-requests/${encodeURIComponent(row.mediaId)}`, { action, expectedRevision: row.revision, note }, "PATCH");
      setMessage(action === "approve" ? `رسانهٔ «${row.mediaName}» تأیید شد.` : `درخواست «${row.mediaName}» رد شد.`);
      try { await load(); } catch { setError("تصمیم ذخیره شد، اما تازه‌سازی فهرست ناموفق بود؛ دوباره تازه‌سازی کنید."); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ثبت تصمیم ناموفق بود."); }
    finally { setBusy(false); }
  }
  return <div className="platform-content media-requests-workspace">
    <section className="panel media-requests-heading">
      <div className="media-requests-intro"><span className="media-requests-icon"><ClipboardList size={23} /></span><div><h2>درخواست‌های ایجاد رسانه</h2><p>مشخصات رسانه و نیازهای سایت را بررسی و نتیجه را به ادمین اعلام کنید.</p></div></div>
      <div className="media-requests-pending"><Clock3 size={18} /><strong>{workspace.pending.toLocaleString("fa-IR")}</strong><span>در انتظار بررسی</span></div>
    </section>
    <section className="panel media-requests-list" aria-label="فهرست درخواست‌های رسانه">
      <div className="media-requests-toolbar"><div className="category-mapping-tabs" aria-label="فیلتر وضعیت درخواست">{filters.map(([value, label]) => <button key={value} type="button" className={status === value ? "active" : ""} aria-pressed={status === value} disabled={busy} onClick={() => void refresh(value, 1)}>{label}{value === "pending" && <span>{workspace.pending.toLocaleString("fa-IR")}</span>}</button>)}</div><button type="button" className="secondary-button" disabled={busy} onClick={() => void refresh()}><RefreshCw size={15} className={busy ? "media-requests-spinning" : ""} />تازه‌سازی</button></div>
      {error && <p role="alert" className="editorial-feedback error">{error}</p>}
      {message && <p role="status" className="editorial-feedback">{message}</p>}
      <div className="media-requests-list-caption"><span>{filters.find(([value]) => value === status)?.[1]}</span><span>{workspace.total.toLocaleString("fa-IR")} درخواست{busy && " · در حال به‌روزرسانی…"}</span></div>
      <div aria-busy={busy}>{workspace.rows.length ? workspace.rows.map(row => <MediaRequestRow key={`${row.mediaId}-${row.revision}`} row={row} busy={busy} review={(action, note) => review(row, action, note)} />) : <div className="media-requests-empty"><ClipboardList size={30} /><h3>{status === "pending" ? "درخواستی در انتظار بررسی نیست" : "درخواستی در این بخش وجود ندارد"}</h3><p>{status === "pending" ? "درخواست‌های تازه پس از تکمیل فرم راه‌اندازی توسط ادمین، اینجا نمایش داده می‌شوند." : "برای مشاهدهٔ سایر درخواست‌ها، فیلتر وضعیت را تغییر دهید."}</p></div>}</div>
      <footer className="category-mapping-pagination media-requests-pagination"><span>صفحهٔ {workspace.page.toLocaleString("fa-IR")} از {Math.max(1, workspace.pageCount).toLocaleString("fa-IR")}</span><div><button type="button" className="secondary-button" disabled={busy || workspace.page <= 1} onClick={() => void refresh(status, workspace.page - 1)}>قبلی</button><button type="button" className="secondary-button" disabled={busy || workspace.page >= workspace.pageCount} onClick={() => void refresh(status, workspace.page + 1)}>بعدی</button></div></footer>
    </section>
    <p className="media-requests-help">تأیید رسانه، بررسی درخواست‌های منابع و دسترسی سایت‌ساز را باز می‌کند. ساخت سایت و تأیید منابع جداگانه انجام می‌شوند.</p>
  </div>;
}
