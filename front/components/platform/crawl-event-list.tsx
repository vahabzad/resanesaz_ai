"use client";

import { useState } from "react";
import type { CrawlRunLiveLog } from "@/lib/contracts/sources";
import { displayDate } from "./source-catalog";

const stageLabels: Record<string, string> = { queue: "صف", worker: "ورکر", validation: "اعتبارسنجی", discovery: "شناسایی لینک", article: "استخراج خبر", "extraction-summary": "خلاصهٔ استخراج", ingestion: "ثبت خبر", "build-analysis": "تحلیل سایت", "build-generation": "ساخت الگو", "build-test": "آزمون خبر", "build-repair": "اصلاح الگو", "build-complete": "تأیید و فعال‌سازی", "debug-analysis": "دیباگ با Codex", "article-address": "تأیید نشانی خبر" };

export function CrawlEventList({ log }: { log: CrawlRunLiveLog }) {
  const [issuesOnly, setIssuesOnly] = useState(false);
  const issues = log.events.filter((event) => event.level === "warn" || event.level === "error");
  const events = issuesOnly ? issues : log.events;
  return <>
    <div className="platform-log-tools"><label><input type="checkbox" checked={issuesOnly} onChange={(event) => setIssuesOnly(event.target.checked)} />فقط هشدارها و خطاها ({issues.length.toLocaleString("fa-IR")})</label><span>{log.events.length.toLocaleString("fa-IR")} از {log.eventCount.toLocaleString("fa-IR")} رویداد</span></div>
    {log.eventCount > log.events.length && <p className="platform-muted">آخرین ۱۱۰۰ رویداد نمایش داده می‌شود؛ رویدادهای قبلی در سابقه ذخیره‌اند.</p>}
    {!events.length && <p className="platform-muted">{issuesOnly ? "هشدار یا خطایی در این گزارش ثبت نشده است." : "درخواست در صف است؛ رویدادها پس از شروع پردازش ثبت می‌شوند."}</p>}
    {events.map((event) => <article key={event.id} className={`platform-log-event ${event.level}`}>
      <div className="platform-event-head"><b>{stageLabels[event.stage] ?? event.stage}</b><span>{event.level === "error" ? "خطا" : event.level === "warn" ? "هشدار" : "اطلاع"}</span><time>{displayDate(event.createdAt)}</time></div>
      <p>{event.message}</p>
      {event.articleUrl && <a className="platform-event-url" href={event.articleUrl} target="_blank" rel="noreferrer" dir="ltr">{event.articleUrl}</a>}
      <div className="platform-event-details">{event.errorCode && <code dir="ltr">{event.errorCode}</code>}{event.durationMs !== null && <span>مدت دریافت و استخراج: {(event.durationMs / 1000).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} ثانیه</span>}</div>
    </article>)}
  </>;
}
