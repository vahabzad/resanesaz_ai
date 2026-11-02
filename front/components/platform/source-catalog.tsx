import { Play, Pause, Radio, LoaderCircle } from "lucide-react";
import type { PlatformSourcesWorkspace } from "@/lib/contracts/sources";
import { SourceRunStatus } from "./source-run-status";
import { SourceScheduleEditor } from "./source-schedule-editor";
import { SourceLifecycleControls } from "./source-lifecycle-controls";
import { useState } from "react";
import { CrawlerBuildReport } from "./crawler-build-report";
import { emptyCatalogFilters, SourceCatalogControls, SourceCatalogPagination } from "./source-catalog-controls";

function normalizeSearch(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[\u064b-\u065f\u0670\u0640\u200c]/g, "").replace(/\s+/g, " ").trim();
}

export const statusLabels: Record<string, string> = { active: "فعال", degraded: "نیازمند بررسی", failed: "ناموفق", paused: "متوقف", building: "در حال ساخت", queued: "در صف", running: "در حال اجرا", succeeded: "موفق" };
export function displayDate(value: string | null) {
  return value ? new Date(value).toLocaleString("fa-IR", { timeZone: "Asia/Tehran", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "هنوز اجرا نشده";
}
export function SourceCatalog({ sources, busy, onAction, onScheduleSaved, onChanged, onSelectRun }: {
  sources: PlatformSourcesWorkspace["sources"]; busy: boolean;
  onAction: (id: string, action: "run" | "stop" | "resume" | "build" | "debug") => void;
  onScheduleSaved: (id: string, minutes: number) => void;
  onChanged: () => Promise<void>;
  onSelectRun: (id: string) => void;
}) {
  const [filters, setFilters] = useState(emptyCatalogFilters);
  const [requestedPage, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const terms = normalizeSearch(filters.query).split(" ").filter(Boolean);
  const availableSources = sources.filter((item) => filters.showArchived || !item.archivedAt);
  const matchingSources = availableSources.filter((item) => {
    if (filters.status === "open-run" ? !item.activeRunId : filters.status && item.status !== filters.status) return false;
    if (filters.adapter && item.adapterKey !== filters.adapter) return false;
    const visibility = !item.mediaDeliveryEnabled ? "delivery-disabled" : item.visibleToMedia ? "public" : "catalog-hidden";
    if (filters.visibility && filters.visibility !== visibility) return false;
    const searchable = normalizeSearch(`${item.name} ${item.url}`);
    return terms.every((term) => searchable.includes(term));
  });
  const pageCount = Math.max(1, Math.ceil(matchingSources.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const displayedSources = matchingSources.slice((page - 1) * pageSize, page * pageSize);
  return <section className="panel"><div className="platform-section-head"><h2>منابع و کراولرها</h2><span>{matchingSources.length.toLocaleString("fa-IR")} از {availableSources.length.toLocaleString("fa-IR")} منبع</span></div>
    <SourceCatalogControls filters={filters} onChange={(next) => { setFilters(next); setPage(1); }} />
    {!displayedSources.length ? <div className="source-empty"><Radio size={28} /><b>{sources.length ? "کراولری با این فیلترها پیدا نشد" : "هنوز منبعی ساخته نشده"}</b><span>{sources.length ? "جست‌وجو یا فیلترها را تغییر دهید؛ منابع حذف‌شده هم قابل نمایش‌اند." : "اولین منبع را از فرم کنار صفحه بسازید."}</span></div> : <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>منبع</th><th>کراولر</th><th>وضعیت</th><th>آخرین دریافت موفق</th><th>خبر خام</th><th>عملیات</th></tr></thead><tbody>
      {displayedSources.map((item) => <tr key={item.id}><td><b>{item.name}</b>{item.archivedAt && <small>حذف‌شده · {displayDate(item.archivedAt)}</small>}<a href={item.url} target="_blank" rel="noreferrer" dir="ltr">{new URL(item.url).hostname}</a>{item.lastErrorCode && !item.activeRunId && <small className="platform-error">{item.lastErrorCode}</small>}</td>
        <td><b>{item.adapterKey === "web" ? "وب" : "RSS"} · نسخه {item.crawlerVersion?.toLocaleString("fa-IR") ?? "—"}</b><CrawlerBuildReport source={item} /><SourceScheduleEditor sourceId={item.id} sourceName={item.name} minutes={item.scheduleMinutes} disabled={busy || !!item.archivedAt} onSaved={onScheduleSaved} /></td>
        <td>{item.activeRun ? <SourceRunStatus source={item} onSelectRun={onSelectRun} /> : <span className={`platform-status ${item.status}`}>{statusLabels[item.status]}</span>}</td><td>{displayDate(item.lastSuccessAt)}</td><td>{item.articleCount.toLocaleString("fa-IR")}</td>
        <td>{!item.archivedAt && <div className="platform-row-actions"><button disabled={busy || !item.enabled || !!item.activeRunId} onClick={() => onAction(item.id, "run")}><Play size={14} />اجرا</button><button disabled={busy || (!item.enabled && item.buildStatus !== "active" && item.status !== "building")} onClick={() => onAction(item.id, item.enabled || item.status === "building" ? "stop" : "resume")}><Pause size={14} />{item.enabled || item.status === "building" ? "توقف" : "فعال‌سازی"}</button><button disabled={busy || !!item.activeRunId} onClick={() => onAction(item.id, "build")}>ساخت و آزمون مجدد</button><button disabled={busy || !!item.activeRunId || item.adapterKey !== "web"} title={item.adapterKey === "web" ? "بررسی الگوی فعلی و خطاها با Codex و آزمون نسخهٔ اصلاح‌شده" : "برای RSS از ساخت و آزمون مجدد استفاده کنید"} onClick={() => onAction(item.id, "debug")}>{item.activeRun?.trigger === "debug" ? <><LoaderCircle size={14} className="source-run-spinner" />{item.activeRun.status === "queued" ? "دیباگ در صف" : "در حال دیباگ"}</> : "دیباگ کراولر"}</button></div>}<SourceLifecycleControls source={item} disabled={busy} onChanged={onChanged} /></td></tr>)}
    </tbody></table></div>}
    {!!matchingSources.length && <SourceCatalogPagination page={page} pageCount={pageCount} pageSize={pageSize} total={matchingSources.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
  </section>;
}
