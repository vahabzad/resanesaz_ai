"use client";

import {
  Activity,
  AlertTriangle,
  Check,
  ChevronLeft,
  Clock3,
  Database,
  ExternalLink,
  FileInput,
  Globe2,
  LoaderCircle,
  Plus,
  Radio,
  RefreshCw,
  Rss,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CrawlRunLiveLog, CrawlRunSummary, SourceSummary, SourcesWorkspace } from "@/lib/contracts/sources";
import type { MediaRole } from "@/lib/contracts/context";

function formatDate(value: string | null) {
  if (!value) return "هنوز اجرا نشده";
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function statusLabel(status: SourceSummary["status"]) {
  if (status === "active") return "پایدار";
  if (status === "failed") return "نیازمند بررسی";
  if (status === "paused") return "متوقف";
  return "کند";
}

function runStatusLabel(status: CrawlRunSummary["status"]) {
  if (status === "succeeded") return "موفق";
  if (status === "failed") return "ناموفق";
  if (status === "running") return "در حال اجرا";
  return "در صف";
}

export function SourcesView({ workspace, role }: { workspace: SourcesWorkspace; role: MediaRole }) {
  const router = useRouter();
  const [mutatingSourceId, setMutatingSourceId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const liveRunId = workspace.recentRuns.find((run) => run.status === "queued" || run.status === "running")?.id ?? null;
  const [liveLog, setLiveLog] = useState<CrawlRunLiveLog | null>(null);
  const liveStreamRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const activeSourceIds = useMemo(() => new Set(workspace.recentRuns
    .filter((run) => run.status === "queued" || run.status === "running")
    .map((run) => run.sourceId)), [workspace.recentRuns]);
  const canManageSources = role === "owner" || role === "admin";

  useEffect(() => {
    if (!activeSourceIds.size) return;
    const timer = window.setInterval(() => router.refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [activeSourceIds.size, router]);

  useEffect(() => {
    if (!liveRunId) return;
    let disposed = false;
    let timer: number | undefined;
    const load = async () => {
      const response = await fetch(`/api/v1/crawl-runs/${encodeURIComponent(liveRunId)}/events`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (disposed) return;
      if (response.ok) {
        const next = payload.data as CrawlRunLiveLog;
        setLiveLog(next);
        if (next.status === "queued" || next.status === "running") timer = window.setTimeout(load, 1_000);
      } else {
        setNotice({ tone: "error", text: payload?.error?.message ?? "دریافت گزارش زنده ناموفق بود." });
      }
    };
    void load();
    return () => { disposed = true; if (timer) window.clearTimeout(timer); };
  }, [liveRunId]);

  useEffect(() => {
    const stream = liveStreamRef.current;
    if (stream) stream.scrollTop = stream.scrollHeight;
  }, [liveLog?.events.length]);

  async function subscribeSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setCreating(true);
    setNotice(null);
    const form = new FormData(formElement);
    const response = await fetch("/api/v1/sources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceId: form.get("sourceId") }),
    });
    const payload = await response.json().catch(() => null);
    if (response.ok) {
      formElement.reset();
      setNotice({ tone: "success", text: "منبع از کاتالوگ پلتفرم به این رسانه متصل شد." });
      router.refresh();
    } else {
      setNotice({ tone: "error", text: payload?.error?.message ?? "اتصال منبع ناموفق بود." });
    }
    setCreating(false);
  }

  async function removeSubscription(source: SourceSummary) {
    if (!window.confirm(`اشتراک منبع «${source.name}» از این رسانه حذف شود؟ منبع سراسری و اجرای crawler حذف نخواهد شد.`)) return;
    setMutatingSourceId(source.id);
    setNotice(null);
    const response = await fetch(
      `/api/v1/sources/${encodeURIComponent(source.id)}`,
      { method: "DELETE" },
    );
    const payload = await response.json().catch(() => null);
    if (response.ok) {
      setNotice({ tone: "success", text: "اشتراک منبع از این رسانه حذف شد؛ منبع سراسری دست‌نخورده باقی ماند." });
      router.refresh();
    } else {
      setNotice({ tone: "error", text: payload?.error?.message ?? "انجام عملیات منبع ناموفق بود." });
    }
    setMutatingSourceId(null);
  }

  return (
    <div className="sources-content">
      <section className="sources-hero">
        <div>
          <span className="sources-kicker"><i />مرکز دریافت محتوا</span>
          <h2>نبض منابع خبری، زیر یک نگاه.</h2>
          <p>هر منبع با نسخهٔ مشخص، اجرای قابل ردیابی و مرز امنیتی مستقل وارد اتاق خبر می‌شود.</p>
        </div>
        <div className="sources-hero-status"><ShieldCheck size={18} /><span><b>کراولر داخلی هر سایت</b><small>Backend Node.js · Recipe نسخه‌دار · Worker مستقل</small></span></div>
      </section>

      {notice ? <div className={`source-notice ${notice.tone}`}>{notice.tone === "success" ? <Check size={17} /> : <AlertTriangle size={17} />}<span>{notice.text}</span></div> : null}

      <section className="source-kpi-grid">
        <article><span className="source-kpi-icon blue"><Radio size={19} /></span><div><small>کل منابع</small><b>{workspace.stats.total.toLocaleString("fa-IR")}</b><em>سایت‌ها و ورودی‌های فعال</em></div></article>
        <article><span className="source-kpi-icon green"><Activity size={19} /></span><div><small>منابع پایدار</small><b>{workspace.stats.healthy.toLocaleString("fa-IR")}</b><em>آمادهٔ دریافت خبر</em></div></article>
        <article><span className="source-kpi-icon red"><AlertTriangle size={19} /></span><div><small>نیازمند بررسی</small><b>{workspace.stats.failed.toLocaleString("fa-IR")}</b><em>خطای آخرین اجرا</em></div></article>
        <article><span className="source-kpi-icon violet"><FileInput size={19} /></span><div><small>اخبار دریافت‌شده</small><b>{workspace.stats.articles.toLocaleString("fa-IR")}</b><em>پس از حذف تکراری‌ها</em></div></article>
      </section>

      <div className="sources-layout">
        <div className="sources-main-column">
          <section className="panel sources-table-panel">
            <div className="sources-section-head"><div><span>اشتراک‌های این رسانه</span><h2>سلامت منابع سراسری</h2></div><button onClick={() => router.refresh()}><RefreshCw size={15} />تازه‌سازی</button></div>
            <div className="sources-table-head"><span>منبع</span><span>وضعیت</span><span>آخرین اجرا</span><span>خروجی</span><span>عملیات</span></div>
            <div className="sources-table-body">
              {workspace.sources.map((item) => (
                <article className="source-row" key={item.id}>
                  <div className="source-identity"><span>{item.adapterKey === "rss" ? <Rss size={18} /> : <Globe2 size={18} />}</span><div><b>{item.name}</b><a href={item.url} target="_blank" rel="noreferrer">{new URL(item.url).hostname}<ExternalLink size={11} /></a></div></div>
                  <div><span className={`source-health ${item.status}`}><i />{statusLabel(item.status)}</span><small>هر {item.scheduleMinutes.toLocaleString("fa-IR")} دقیقه</small></div>
                  <div className="source-time"><b>{formatDate(item.lastRunAt)}</b><small>{item.lastErrorCode ? `کد خطا: ${item.lastErrorCode}` : "اجرای زمان‌بندی‌شده"}</small></div>
                  <div className="source-output"><b>{item.articleCount.toLocaleString("fa-IR")}</b><small>خبر یکتا</small></div>
                  <div className="source-actions">
                    {activeSourceIds.has(item.id) ? <span className="run-source-button"><LoaderCircle className="spin" size={15} />در حال اجرا</span> : null}
                    {canManageSources ? <button className="source-action-button delete" disabled={mutatingSourceId !== null} onClick={() => removeSubscription(item)} aria-label={`حذف اشتراک ${item.name}`} title="حذف اشتراک رسانه">
                      <Trash2 size={14} />
                    </button> : null}
                  </div>
                </article>
              ))}
              {!workspace.sources.length ? <div className="source-empty"><Globe2 size={26} /><b>هنوز منبعی انتخاب نشده است</b><span>یک منبع آماده را از کاتالوگ پلتفرم انتخاب کنید.</span></div> : null}
            </div>
          </section>

          <section className="panel run-history-panel">
            <div className="sources-section-head"><div><span>ردیابی عملیات</span><h2>اجراهای اخیر</h2></div><span className="contract-chip">Contract v1</span></div>
            <div className="run-list">
              {workspace.recentRuns.map((run) => (
                <article key={run.id}>
                  <span className={`run-state ${run.status}`}>{run.status === "succeeded" ? <Check size={13} /> : run.status === "failed" ? <AlertTriangle size={13} /> : <Clock3 size={13} />}</span>
                  <div><b>{run.sourceName}</b><small>{run.trigger === "schedule" ? "زمان‌بندی‌شده" : "دستی"} · {formatDate(run.createdAt)}</small></div>
                  <span className={`run-label ${run.status}`}>{runStatusLabel(run.status)}</span>
                  <div className="run-metrics"><span>کشف <b>{run.discoveredCount.toLocaleString("fa-IR")}</b></span><span>جدید <b>{run.insertedCount.toLocaleString("fa-IR")}</b></span><span>تکراری <b>{run.duplicateCount.toLocaleString("fa-IR")}</b></span></div>
                  <ChevronLeft size={16} />
                </article>
              ))}
              {!workspace.recentRuns.length ? <div className="source-empty compact"><Clock3 size={22} /><b>هنوز اجرایی ثبت نشده است</b></div> : null}
            </div>
          </section>
        </div>

        <aside className="sources-side-column">
          <section className="panel add-source-card" id="add-source">
            <div className="add-source-icon"><Plus size={19} /></div>
            <span>کاتالوگ پلتفرم</span>
            <h2>انتخاب منبع آماده</h2>
            <p>ساخت و اجرای crawler فقط در فضای Platform Admin انجام می‌شود؛ اینجا فقط اشتراک رسانه مدیریت می‌شود.</p>
            <form onSubmit={subscribeSource}>
              <label><span>منبع آماده</span><select name="sourceId" required defaultValue=""><option value="" disabled>یک منبع انتخاب کنید</option>{workspace.availableSources.map((item) => <option key={item.id} value={item.id}>{item.name} — {new URL(item.url).hostname}</option>)}</select></label>
              <button disabled={creating || !workspace.availableSources.length}>{creating ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}{creating ? "در حال اتصال…" : "افزودن به رسانه"}</button>
            </form>
            {liveRunId ? <div className="live-crawl-log" aria-live="polite">
              <div className="live-crawl-head">
                <span><Activity size={15} />گزارش زنده</span>
                <b className={liveLog?.status ?? "queued"}>{liveLog?.status === "succeeded" ? "تکمیل شد" : liveLog?.status === "failed" ? "متوقف شد" : liveLog?.status === "running" ? "در حال اجرا" : "در صف"}</b>
              </div>
              <div className="live-crawl-stream" ref={liveStreamRef}>
                {liveLog?.events.length ? liveLog.events.map((event) => <div className={`live-crawl-event ${event.level}`} key={event.id}>
                  <i />
                  <span>{event.message}</span>
                  <time>{new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(event.createdAt))}</time>
                </div>) : <div className="live-crawl-wait"><LoaderCircle className="spin" size={14} />منتظر دریافت اولین رویداد…</div>}
              </div>
              {liveLog?.errorCode ? <div className="live-crawl-error"><AlertTriangle size={13} />کد پایان: {liveLog.errorCode}</div> : null}
            </div> : null}
          </section>

          <section className="source-security-card">
            <div><Database size={18} /><span><b>مالکیت داده</b><small>خبر خام سراسری است؛ Inbox و تصمیم تحریریه با mediaId جدا می‌شوند.</small></span></div>
            <div><ShieldCheck size={18} /><span><b>ورودی نامطمئن</b><small>متن خبر هیچ‌گاه دستور سیستم تلقی نمی‌شود.</small></span></div>
          </section>
        </aside>
      </div>
    </div>
  );
}
