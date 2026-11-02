"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Hammer, RefreshCw, ShieldCheck, X } from "lucide-react";
import { apiRequest } from "@/lib/api-client";

export type SourceAccessRequestRow = {
  id: string; mediaId: string; mediaName: string; sourceType: string; platform: string | null;
  name: string; url: string; status: string; createdAt: string; requestedBy: string | null;
  categoryMode: "all" | "selected" | null; categories: string[]; sourceId: string | null;
  crawlerReady: boolean; existingCrawlerAvailable: boolean; mediaApproved: boolean; kind: string;
};

type ReviewAction = "reject" | "grant_existing" | "queue_crawler";

function statusLabel(status: string) {
  if (status === "crawler_queued") return "در صف ساخت کراولر";
  if (status === "crawler_failed") return "ساخت کراولر ناموفق";
  if (status === "access_granted") return "دسترسی اعطا شد";
  if (status === "rejected") return "رد شده";
  return "در انتظار بررسی";
}

export function SourceAccessRequests({ initialRequests }: { initialRequests: SourceAccessRequestRow[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(id: string, action: ReviewAction) {
    setBusy(id); setError(null);
    try {
      const result = await apiRequest<{ id: string; status: string; sourceId: string | null }>(`/api/v1/platform/source-access-requests/${encodeURIComponent(id)}`, { action }, "PATCH");
      setRequests((current) => current.map((item) => item.id === id ? { ...item, status: result.status, sourceId: result.sourceId, existingCrawlerAvailable: false } : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "بررسی درخواست انجام نشد."); }
    finally { setBusy(null); }
  }

  async function refresh() {
    setError(null);
    try { setRequests(await apiRequest<SourceAccessRequestRow[]>("/api/v1/platform/source-access-requests")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "دریافت درخواست‌ها انجام نشد."); }
  }

  return <div className="platform-content">
    <section className="panel platform-source-requests">
      <div className="platform-section-head"><div><h2>درخواست‌های منابع</h2><p>هر درخواست را جداگانه بررسی کنید: دسترسی به کراولر آماده یا تأیید برای ساخت کراولر.</p></div><button className="icon-button" aria-label="به‌روزرسانی درخواست‌ها" onClick={() => void refresh()}><RefreshCw size={17} /></button></div>
      {error && <p className="editorial-feedback error" role="alert">{error}</p>}
      {!requests.length ? <div className="source-empty"><ShieldCheck size={26} /><b>درخواستی ثبت نشده است</b><span>درخواست‌های تازهٔ ادمین‌ها در این صفحه نمایش داده می‌شوند.</span></div> : <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>رسانهٔ درخواست‌کننده</th><th>منبع و لینک</th><th>دسته‌های درخواستی</th><th>وضعیت</th><th>بررسی</th></tr></thead><tbody>{requests.map((item) => {
        const canReview = item.mediaApproved && (item.status === "pending" || item.status === "crawler_failed");
        return <tr key={item.id}>
          <td><b>{item.mediaName}</b><small>{item.requestedBy ?? "ادمین"}</small></td>
          <td><b>{item.sourceType === "website" ? "وب‌سایت" : "شبکهٔ اجتماعی"}</b><a href={item.url} target="_blank" rel="noreferrer" dir="ltr">{item.url}</a></td>
          <td>{item.kind === "category_extension" && <b>درخواست افزایش دسته‌بندی</b>}{item.sourceType === "website" ? item.categoryMode === "all" ? "همهٔ دسته‌ها" : item.categories.length ? item.categories.join("، ") : "دسته‌ای انتخاب نشده" : "—"}</td>
          <td><span className={`source-request-status ${item.status}`}>{statusLabel(item.status)}</span>{item.status === "crawler_queued" && <Link className="source-request-crawler-link" href="/platform/sources">مشاهدهٔ صف کراولر</Link>}</td>
          <td>{!item.mediaApproved ? <Link href="/platform/media-requests">ابتدا درخواست رسانه را بررسی کنید</Link> : canReview ? <div className="source-request-actions">
            {item.kind === "category_extension" ? <button disabled={busy === item.id} onClick={() => void review(item.id, "grant_existing")}><ShieldCheck size={14} />تأیید دسته‌های بیشتر</button> : item.existingCrawlerAvailable ? <button disabled={busy === item.id} onClick={() => void review(item.id, "grant_existing")}><ShieldCheck size={14} />اعطای دسترسی از کراولر موجود</button> : item.crawlerReady ? <small className="source-request-blocked">کراولر آماده است، اما منبع فعلاً قابل‌ارائه به رسانه نیست. وضعیت منبع را در صفحهٔ منابع بررسی کنید.</small> : <button disabled={busy === item.id} onClick={() => void review(item.id, "queue_crawler")}><Hammer size={14} />تأیید و صف ساخت کراولر</button>}
            {item.status === "pending" && <button className="reject" disabled={busy === item.id} onClick={() => void review(item.id, "reject")}><X size={14} />رد درخواست</button>}
          </div> : <span className="source-request-done"><Check size={14} />بررسی‌شده</span>}</td>
        </tr>;
      })}</tbody></table></div>}
    </section>
  </div>;
}

