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
  LoaderCircle,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Rss,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { CrawlRunSummary, SourceSummary, SourcesWorkspace } from "@/lib/contracts/sources";

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

export function SourcesView({ workspace }: { workspace: SourcesWorkspace }) {
  const router = useRouter();
  const [queuingSourceId, setQueuingSourceId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const activeSourceIds = useMemo(() => new Set(workspace.recentRuns
    .filter((run) => run.status === "queued" || run.status === "running")
    .map((run) => run.sourceId)), [workspace.recentRuns]);

  useEffect(() => {
    if (!activeSourceIds.size) return;
    const timer = window.setInterval(() => router.refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [activeSourceIds.size, router]);

  async function runSource(sourceId: string) {
    setQueuingSourceId(sourceId);
    setNotice(null);
    const response = await fetch(`/api/v1/sources/${encodeURIComponent(sourceId)}/run`, { method: "POST" });
    const payload = await response.json().catch(() => null);
    if (response.ok) {
      setNotice({ tone: "success", text: payload.data.accepted ? "اجرای منبع در صف worker قرار گرفت." : "این منبع از قبل در صف یا در حال اجراست." });
      router.refresh();
    } else {
      setNotice({ tone: "error", text: payload?.error?.message ?? "اجرای منبع ناموفق بود." });
    }
    setQueuingSourceId(null);
  }

  async function createSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setNotice(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/sources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        url: form.get("url"),
        scheduleMinutes: Number(form.get("scheduleMinutes")),
      }),
    });
    const payload = await response.json().catch(() => null);
    if (response.ok) {
      event.currentTarget.reset();
      setNotice({ tone: "success", text: "منبع RSS با نسخهٔ اولیهٔ کراولر ثبت شد." });
      router.refresh();
    } else {
      setNotice({ tone: "error", text: payload?.error?.message ?? "ثبت منبع ناموفق بود." });
    }
    setCreating(false);
  }

  return (
    <div className="sources-content">
      <section className="sources-hero">
        <div>
          <span className="sources-kicker"><i />مرکز دریافت محتوا</span>
          <h2>نبض منابع خبری، زیر یک نگاه.</h2>
          <p>هر منبع با نسخهٔ مشخص، اجرای قابل ردیابی و مرز امنیتی مستقل وارد اتاق خبر می‌شود.</p>
        </div>
        <div className="sources-hero-status"><ShieldCheck size={18} /><span><b>ورودی محافظت‌شده</b><small>SSRF Guard · محدودیت ۲MB · Timeout ۱۰s</small></span></div>
      </section>

      {notice ? <div className={`source-notice ${notice.tone}`}>{notice.tone === "success" ? <Check size={17} /> : <AlertTriangle size={17} />}<span>{notice.text}</span></div> : null}

      <section className="source-kpi-grid">
        <article><span className="source-kpi-icon blue"><Radio size={19} /></span><div><small>کل منابع</small><b>{workspace.stats.total.toLocaleString("fa-IR")}</b><em>RSS فعال در این رسانه</em></div></article>
        <article><span className="source-kpi-icon green"><Activity size={19} /></span><div><small>منابع پایدار</small><b>{workspace.stats.healthy.toLocaleString("fa-IR")}</b><em>آمادهٔ دریافت خبر</em></div></article>
        <article><span className="source-kpi-icon red"><AlertTriangle size={19} /></span><div><small>نیازمند بررسی</small><b>{workspace.stats.failed.toLocaleString("fa-IR")}</b><em>خطای آخرین اجرا</em></div></article>
        <article><span className="source-kpi-icon violet"><FileInput size={19} /></span><div><small>اخبار دریافت‌شده</small><b>{workspace.stats.articles.toLocaleString("fa-IR")}</b><em>پس از حذف تکراری‌ها</em></div></article>
      </section>

      <div className="sources-layout">
        <div className="sources-main-column">
          <section className="panel sources-table-panel">
            <div className="sources-section-head"><div><span>منابع این رسانه</span><h2>وضعیت کراولرها</h2></div><button onClick={() => router.refresh()}><RefreshCw size={15} />تازه‌سازی</button></div>
            <div className="sources-table-head"><span>منبع</span><span>وضعیت</span><span>آخرین اجرا</span><span>خروجی</span><span>عملیات</span></div>
            <div className="sources-table-body">
              {workspace.sources.map((item) => (
                <article className="source-row" key={item.id}>
                  <div className="source-identity"><span><Rss size={18} /></span><div><b>{item.name}</b><a href={item.url} target="_blank" rel="noreferrer">{new URL(item.url).hostname}<ExternalLink size={11} /></a></div></div>
                  <div><span className={`source-health ${item.status}`}><i />{statusLabel(item.status)}</span><small>هر {item.scheduleMinutes.toLocaleString("fa-IR")} دقیقه</small></div>
                  <div className="source-time"><b>{formatDate(item.lastRunAt)}</b><small>{item.lastErrorCode ? `کد خطا: ${item.lastErrorCode}` : "اجرای زمان‌بندی‌شده"}</small></div>
                  <div className="source-output"><b>{item.articleCount.toLocaleString("fa-IR")}</b><small>خبر یکتا</small></div>
                  <button className="run-source-button" disabled={queuingSourceId !== null || activeSourceIds.has(item.id) || !item.enabled} onClick={() => runSource(item.id)}>
                    {queuingSourceId === item.id || activeSourceIds.has(item.id) ? <LoaderCircle className="spin" size={15} /> : <Play size={14} fill="currentColor" />}
                    {activeSourceIds.has(item.id) ? "در حال اجرا" : queuingSourceId === item.id ? "در حال صف‌بندی" : "اجرای دستی"}
                  </button>
                </article>
              ))}
              {!workspace.sources.length ? <div className="source-empty"><Rss size={26} /><b>هنوز منبعی ثبت نشده است</b><span>اولین RSS رسانه را از پنل کناری اضافه کنید.</span></div> : null}
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
            <span>اتصال منبع تازه</span>
            <h2>افزودن RSS</h2>
            <p>آدرس پیش از ذخیره از نظر عمومی‌بودن شبکه و DNS بررسی می‌شود.</p>
            <form onSubmit={createSource}>
              <label><span>نام منبع</span><input name="name" placeholder="مثلاً خبرگزاری ایرنا" minLength={2} maxLength={120} required /></label>
              <label><span>آدرس RSS</span><input name="url" dir="ltr" type="url" placeholder="https://example.com/rss" required /></label>
              <label><span>فاصلهٔ اجرا</span><select name="scheduleMinutes" defaultValue="15"><option value="5">هر ۵ دقیقه</option><option value="15">هر ۱۵ دقیقه</option><option value="30">هر ۳۰ دقیقه</option><option value="60">هر یک ساعت</option></select></label>
              <button disabled={creating}>{creating ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}{creating ? "در حال بررسی…" : "ثبت منبع"}</button>
            </form>
          </section>

          <section className="source-security-card">
            <div><Database size={18} /><span><b>مالکیت داده</b><small>تمام خروجی‌ها با mediaId ذخیره می‌شوند.</small></span></div>
            <div><ShieldCheck size={18} /><span><b>ورودی نامطمئن</b><small>متن خبر هیچ‌گاه دستور سیستم تلقی نمی‌شود.</small></span></div>
          </section>
        </aside>
      </div>
    </div>
  );
}
