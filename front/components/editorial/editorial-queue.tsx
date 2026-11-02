"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api-client";

type Queue = { pagination:{page:number;pageCount:number;total:number}; jobs: { id: string; title: string; sectionName: string; serviceStopped: boolean; status: string; attempts: number; errorCode: string | null; storyId: string | null; trigger: string }[]; counts: { status: string; count: number }[] };
const labels: Record<string, string> = { queued: "در صف", running: "در حال تحریر", succeeded: "آماده شد", failed: "ناموفق", cancelled: "لغوشده" };
const errors: Record<string, string> = { AUTO_START_CHANGED: "خبر خارج از بازهٔ جدید پردازش خودکار است", CODEX_AUTH_REQUIRED: "ورود Codex معتبر نیست", CODEX_RATE_LIMITED: "محدودیت ظرفیت Codex", CODEX_TIMEOUT: "زمان تحریر تمام شد", CODEX_REWRITE_FAILED: "پاسخ Codex دریافت نشد", OUTPUT_INVALID: "خروجی ساختار معتبر نداشت", CONTENT_REVIEW_REQUIRED: "خبر نیازمند بررسی دستی است", INPUT_TOO_LARGE: "متن از حد مجاز طولانی‌تر است", WORKER_INTERRUPTED: "اجرای ورکر قطع شد", ACCESS_REVOKED: "مجوز درخواست‌کننده تغییر کرده", SERVICE_STOPPED: "سرویس متوقف شد", AUTO_CONFIGURATION_INVALID: "تنظیمات پایه یا جناح سرویس معتبر نیست" };
export function EditorialQueueView({ canManage, open, refreshKey, onCounts }: { refreshKey: string; canManage: boolean; open: (id: string) => Promise<void>; onCounts?: (counts: { status: string; count: number }[]) => void }) {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [filter, setFilter] = useState("all");
  const [page,setPage] = useState(1);
  const queuePath = `/api/v1/editorial/jobs?page=${page}&pageSize=20${filter==="all"?"":"&status="+filter}`;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    async function refresh() { try { const result = await apiRequest<Queue>(queuePath); if (alive) { setQueue(result); onCounts?.(result.counts); setError(""); } } catch(e) { if (alive) setError(e instanceof Error ? e.message : "دریافت صف ناموفق بود."); } }
    void refresh(); const timer = setInterval(() => void refresh(), 10000);
    return () => { alive = false; clearInterval(timer); };
  }, [refreshKey,queuePath,onCounts]);
  async function change(id?: string, action?: "retry" | "cancel") {
    setBusy(true); setError("");
    try { if (id && action) await apiRequest(`/api/v1/editorial/jobs/${id}/${action}`, {}); const result = await apiRequest<Queue>(queuePath); setQueue(result); onCounts?.(result.counts); }
    catch(e) { setError(e instanceof Error ? e.message : "عملیات ناموفق بود."); } finally { setBusy(false); }
  }
  return <section className="panel editorial-settings"><div className="editorial-toolbar"><h3>صف تولید خبر</h3><select aria-label="وضعیت صف" value={filter} onChange={e => {setFilter(e.target.value);setPage(1);}}><option value="all">همه</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="secondary-button" disabled={busy} onClick={() => void change()}>تازه‌سازی صف</button><Link href="/ready" className="secondary-button">مخزن آمادهٔ انتشار</Link></div>
    <p>خروجی موفق وارد مخزن می‌شود و برای انتشار به تأیید انسانی نیاز دارد. صف هر ۱۰ ثانیه تازه می‌شود.</p>
    {error && <p role="alert" className="editorial-feedback error">{error}</p>}
    <div className="editorial-toolbar">{queue?.counts.map(c => <span key={c.status}>{labels[c.status] ?? c.status}: {c.count.toLocaleString("fa-IR")}</span>)}</div>
    {!queue && !error && <p>در حال دریافت صف…</p>}
    {queue?.jobs.map(j => <article className="editorial-candidate" key={j.id}><div><b dir="auto">{j.title}</b><small>{j.sectionName} · {j.trigger === "automatic" ? "خودکار" : "دستی"} · {labels[j.status]} · تلاش {j.attempts.toLocaleString("fa-IR")}</small>{j.errorCode && <p>{errors[j.errorCode] ?? "پردازش ناموفق بود"} <small dir="ltr">{j.errorCode}</small></p>}</div><div className="editorial-toolbar">{j.storyId && <button className="secondary-button" disabled={busy} onClick={() => void open(j.storyId!)}>مشاهدهٔ خروجی</button>}{canManage && ["failed", "cancelled"].includes(j.status) && j.attempts < 3 && <button className="secondary-button" disabled={busy || j.serviceStopped} title={j.serviceStopped ? "ابتدا سرویس را فعال یا بازیابی کنید" : undefined} onClick={() => void change(j.id, "retry")}>تلاش مجدد</button>}{canManage && ["queued", "running"].includes(j.status) && <button className="secondary-button" disabled={busy} onClick={() => void change(j.id, "cancel")}>لغو</button>}</div></article>)}
    {queue && !queue.jobs.length && <p>{queue.jobs.length ? "کاری با این وضعیت پیدا نشد." : "صف خالی است؛ اجرای خودکار سرویس را فعال کنید یا خبری را به صف بفرستید."}</p>}
    <nav className="editorial-toolbar" aria-label="صفحه‌بندی صف تولید">{queue && <><span>{queue.pagination.total.toLocaleString("fa-IR")} کار · صفحهٔ {queue.pagination.page.toLocaleString("fa-IR")} از {queue.pagination.pageCount.toLocaleString("fa-IR")}</span><button className="secondary-button" disabled={busy || queue.pagination.page<=1} onClick={()=>setPage(queue.pagination.page-1)}>صف قبلی</button><button className="secondary-button" disabled={busy || queue.pagination.page>=queue.pagination.pageCount} onClick={()=>setPage(queue.pagination.page+1)}>صف بعدی</button></>}</nav><small>شمارنده‌ها برای کل صف رسانه هستند؛ هر صفحه ۲۰ کار دارد.</small>
  </section>;
}
