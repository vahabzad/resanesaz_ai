"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api-client";
import type { MediaRole } from "@/lib/contracts/context";
import { PublicationTimeEditor } from "./publication-time-editor";
import { PublicationRulesView, publicationRoleLabels } from "./publication-rules-view";
import type { Publication, PublicationWorkspace, SiteWorkspace } from "@/lib/contracts/sites";

const labels = { queued: "در انتظار انتشار", succeeded: "منتشرشده", failed: "ناموفق", cancelled: "لغوشده" };
const errors: Record<string, string> = { RULE_STOPPED: "قاعدهٔ این انتشار متوقف شده است.", RULE_CHANGED: "قاعده تغییر کرده؛ کار باز قبلی لغو شده است.", PRIMARY_CONFLICT: "این خبر سایت اصلی دیگری دارد؛ نقش انتشار را بررسی کنید.", WAITING_PRIMARY: "منتظر انتشار موفق خبر در سایت اصلی است؛ هر ۳۰ ثانیه بررسی می‌شود.", ARTICLE_WITHDRAWN: "خبر از این سایت برداشته شده است.", SITE_STOPPED: "سایت متوقف یا بایگانی شده است.", ACCESS_REVOKED: "مجوز انتشارِ درخواست‌کننده تغییر کرده است.", APPROVAL_CHANGED: "نسخهٔ خبر تغییر کرده؛ آخرین نسخه را دوباره تأیید و برای انتشار انتخاب کنید.", WORKER_FAILED: "انتشار کامل نشد؛ امکان تلاش مجدد وجود دارد." };
const date = (value: string) => new Date(value).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" });

export function PublicationView(props: { initial: PublicationWorkspace; sites: SiteWorkspace["sites"]; role: MediaRole }) {
  const [tab, setTab] = useState("queue");
  return <><nav className="editorial-toolbar publication-tabs" aria-label="بخش‌های انتشار"><button className={tab === "queue" ? "primary-button" : "secondary-button"} aria-pressed={tab === "queue"} onClick={() => setTab("queue")}>صف انتشار</button><button className={tab === "rules" ? "primary-button" : "secondary-button"} aria-pressed={tab === "rules"} onClick={() => setTab("rules")}>قواعد انتشار</button></nav><div hidden={tab !== "queue"}><PublicationQueue {...props} /></div><div hidden={tab !== "rules"}><PublicationRulesView sites={{ sites: props.sites, sections: [] }} canManage={["owner", "admin", "editor", "publisher"].includes(props.role)} /></div></>;
}
function PublicationQueue({ initial, sites, role }: { initial: PublicationWorkspace; sites: SiteWorkspace["sites"]; role: MediaRole }) {
  const [withdrawal, setWithdrawal] = useState<Publication | null>(null);
  const [rescheduling, setRescheduling] = useState<Publication | null>(null);
  const [data, setData] = useState(initial); const [status, setStatus] = useState(""); const [siteId, setSiteId] = useState(""); const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const canManage = ["owner", "admin", "editor", "publisher"].includes(role);
  const path = `/api/v1/publications?page=${page}${status ? `&status=${status}` : ""}${siteId ? `&siteId=${encodeURIComponent(siteId)}` : ""}`;
  useEffect(() => { let alive = true; async function refresh() { try { const result = await apiRequest<PublicationWorkspace>(path); if (alive) { setData(result); setError(""); } } catch (e) { if (alive) setError(e instanceof Error ? e.message : "دریافت صف ناموفق بود."); } } void refresh(); const timer = setInterval(() => void refresh(), 10000); return () => { alive = false; clearInterval(timer); }; }, [path]);
  async function change(id?: string, action?: "retry" | "cancel") { if (busy) return; setBusy(true); setError(""); try { if (id && action) await apiRequest(`/api/v1/publications/${id}/${action}`, {}); setData(await apiRequest<PublicationWorkspace>(path)); } catch (e) { setError(e instanceof Error ? e.message : "عملیات انتشار ناموفق بود."); } finally { setBusy(false); } }
  return <div className="inbox-content editorial-workspace publishing-workspace">
    <section className="inbox-heading"><div><span>انتشار وب</span><h2>از تأیید سردبیر تا صفحهٔ خبر</h2><p>انتشارهای فوری و زمان‌بندی‌شده، نتیجه و تلاش‌های مجدد را برای سایت‌های همین رسانه دنبال کنید.</p></div><Link className="primary-button" href="/ready">انتخاب خبر تأییدشده</Link></section>
    <div className="publication-metrics">{Object.entries(labels).map(([key, label]) => <div className="panel" key={key}><span>{label}</span><strong>{(data.counts.find(c => c.status === key)?.count ?? 0).toLocaleString("fa-IR")}</strong></div>)}</div>
    <section className="panel editorial-settings"><div className="editorial-toolbar"><h3>صف انتشار سایت‌ها</h3><select aria-label="وضعیت انتشار" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">همهٔ وضعیت‌ها</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select aria-label="سایت مقصد" value={siteId} onChange={e => { setSiteId(e.target.value); setPage(1); }}><option value="">همهٔ سایت‌ها</option>{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select><button className="secondary-button" disabled={busy} onClick={() => void change()}>تازه‌سازی صف</button><Link className="secondary-button" href="/sites">مدیریت سایت‌ها</Link></div>
      <p className="editorial-help">زمان‌ها به وقت تهران‌اند. توقف سایت، کارهای باز آن را لغو می‌کند. تلاش مجدد انتشار، خودکارسازی تحریریه را روشن نمی‌کند.</p>
      {error && <p className="editorial-feedback error" role="alert">{error}</p>}
      {withdrawal && <div className="editorial-feedback" role="alert"><p>خبر «{withdrawal.title}» از سایت «{withdrawal.siteName}» برداشته می‌شود و کارهای باز آن لغو می‌شوند. تاریخچه حفظ می‌شود؛ نسخهٔ تازه ممکن است طبق قواعد دوباره منتشر شود.</p><button className="secondary-button" disabled={busy} onClick={() => setWithdrawal(null)}>انصراف</button><button className="secondary-button editorial-stop" disabled={busy} onClick={async () => { if (busy) return; setBusy(true); setError(""); try { await apiRequest(`/api/v1/sites/${withdrawal.siteId}/stories/${withdrawal.storyId}/withdraw`, { versionId: withdrawal.versionId }); setWithdrawal(null); setData(await apiRequest<PublicationWorkspace>(path)); } catch (e) { setError(e instanceof Error ? e.message : "برداشتن خبر ناموفق بود."); } finally { setBusy(false); } }}>برداشتن خبر از سایت</button></div>}
      {!data.jobs.length && <div className="settings-empty"><h4>کاری با این فیلتر وجود ندارد.</h4><p>در مخزن آمادهٔ انتشار، نسخهٔ تأییدشده را باز و سایت مقصد را انتخاب کنید.</p></div>}
      {data.jobs.map(job => <article className="publication-row" key={job.id}><div><h4 dir="auto">{job.title}</h4><p>{job.siteName} · نسخهٔ {job.revision.toLocaleString("fa-IR")} · {labels[job.status]} · تلاش {job.attempts.toLocaleString("fa-IR")} از ۳</p><small>زمان درخواست‌شده: {date(job.scheduledAt)}{job.finishedAt ? ` · نتیجه: ${date(job.finishedAt)}` : ""}</small>{job.errorCode && <p className="publication-error">{errors[job.errorCode] ?? "انتشار نیازمند بررسی است."}</p>}</div><div className="editorial-toolbar">
        <small>{publicationRoleLabels[job.role]} · {job.ruleName ? `قاعده: ${job.ruleName}` : "درخواست دستی"}</small>
        {job.isWithdrawn && <small className="retry-help">خبر از سایت برداشته شده؛ نتیجهٔ قبلی برای تاریخچه حفظ شده است.</small>}
        {job.status === "succeeded" && !job.isWithdrawn && job.siteStatus === "live" && job.resultPath && <a className="secondary-button" href={job.resultPath} target="_blank" rel="noreferrer">مشاهدهٔ خبر روی سایت</a>}
        {canManage && job.status === "succeeded" && !job.isWithdrawn && job.publishedVersionId === job.versionId && <button className="secondary-button editorial-stop" disabled={busy} onClick={() => setWithdrawal(job)}>برداشتن از سایت</button>}
        {job.status === "succeeded" && job.siteStatus !== "live" && <small className="retry-help">سایت متوقف است؛ خبر پس از فعال‌سازی دوباره در دسترس خواهد بود.</small>}
        {canManage && job.status !== "succeeded" && <button className="secondary-button" disabled={busy || job.siteStatus !== "live" || job.attempts >= 3 || job.errorCode === "APPROVAL_CHANGED"} onClick={() => setRescheduling(job)}>تغییر زمان</button>}
        {canManage && job.status === "queued" && <button className="secondary-button editorial-stop" disabled={busy} onClick={() => void change(job.id, "cancel")}>لغو انتشار</button>}
        {canManage && ["failed", "cancelled"].includes(job.status) && <div><button className="secondary-button" disabled={busy || job.attempts >= 3 || job.siteStatus !== "live" || job.errorCode === "APPROVAL_CHANGED"} onClick={() => void change(job.id, "retry")}>تلاش مجدد فوری</button>{job.attempts >= 3 ? <small className="retry-help">سه تلاش انجام شده؛ نیازمند بررسی است.</small> : job.siteStatus !== "live" ? <small className="retry-help">ابتدا سایت را در بخش سایت‌ها فعال کنید.</small> : job.errorCode === "APPROVAL_CHANGED" ? <small className="retry-help">نسخهٔ تازه را از مخزن برای انتشار انتخاب کنید.</small> : null}</div>}
      </div></article>)}
      <nav className="editorial-toolbar" aria-label="صفحه‌بندی انتشار"><span>{data.pagination.total.toLocaleString("fa-IR")} کار · صفحهٔ {data.pagination.page.toLocaleString("fa-IR")} از {data.pagination.pageCount.toLocaleString("fa-IR")}</span><button className="secondary-button" disabled={busy || data.pagination.page <= 1} onClick={() => setPage(data.pagination.page - 1)}>قبلی</button><button className="secondary-button" disabled={busy || data.pagination.page >= data.pagination.pageCount} onClick={() => setPage(data.pagination.page + 1)}>بعدی</button></nav>
    </section>
    {rescheduling && <PublicationTimeEditor key={rescheduling.id} job={rescheduling} onClose={() => setRescheduling(null)} onSaved={() => { setRescheduling(null); void change(); }} />}
  </div>;
}
