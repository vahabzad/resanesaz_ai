import type { CrawlRunLiveLog, CrawlRunSummary } from "@/lib/contracts/sources";
import { displayDate, statusLabels } from "./source-catalog";
import { CrawlEventList } from "./crawl-event-list";

function runLabel(run: { status: string; errorCode: string | null }) {
  return run.errorCode === "PARTIAL_EXTRACTION" ? "تکمیل با خطای استخراج" : statusLabels[run.status];
}

export function CrawlRunsPanel({ runs, log, selectedRunId, onSelect }: {
  runs: CrawlRunSummary[]; log: CrawlRunLiveLog | null; selectedRunId: string | null; onSelect: (id: string) => void;
}) {
  return <section id="crawl-runs" className="panel"><div className="platform-section-head"><h2>اجراها و گزارش دریافت</h2><span>۳۰ اجرای اخیر</span></div>
    <div className="platform-runs"><div className="platform-run-list">{!runs.length && <p className="platform-muted">هنوز اجرایی ثبت نشده است.</p>}{runs.map((run) => <button key={run.id} className={selectedRunId === run.id ? "selected" : ""} onClick={() => onSelect(run.id)}><div><b>{run.sourceName}</b><span className={`platform-status ${run.errorCode === "PARTIAL_EXTRACTION" ? "degraded" : run.status}`}>{runLabel(run)}</span></div><small>{displayDate(run.createdAt)} · {run.trigger === "debug" ? "دیباگ با Codex" : run.trigger === "build" ? "ساخت و آزمون" : run.trigger === "manual" ? "دستی" : "زمان‌بندی"}</small><small>{run.insertedCount.toLocaleString("fa-IR")} جدید · {run.duplicateCount.toLocaleString("fa-IR")} تکراری · {run.quarantinedCount.toLocaleString("fa-IR")} {run.failedCount === null && run.finishedAt ? "قرنطینه/ناموفق (گزارش قدیمی)" : "قرنطینه"}{run.failedCount !== null && ` · ${run.failedCount.toLocaleString("fa-IR")} ${["build", "debug"].includes(run.trigger) ? "نمونهٔ ناموفق" : "استخراج ناموفق"}`}</small></button>)}</div>
      <div className="platform-log" aria-live="polite">{!selectedRunId ? <p className="platform-muted">برای مشاهدهٔ گزارش، یک اجرا را انتخاب کنید.</p> : !log ? <p className="platform-muted">در حال دریافت گزارش…</p> : <><h3>{log.sourceName} · {runLabel(log)}</h3>{log.errorCode && <p className="platform-error">کد خطا: {log.errorCode}</p>}<CrawlEventList key={log.runId} log={log} /></>}</div>
    </div>
  </section>;
}
