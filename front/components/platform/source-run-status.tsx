import { Clock3, LoaderCircle } from "lucide-react";
import type { PlatformSourcesWorkspace } from "@/lib/contracts/sources";
import { isSocialPlatform } from "../../lib/contracts/social-platforms";

export function SourceRunStatus({ source, onSelectRun }: { source: PlatformSourcesWorkspace["sources"][number]; onSelectRun: (id: string) => void }) {
  const run = source.activeRun;
  if (!run) return null;
  const operation = run.trigger === "debug" ? "دیباگ" : run.trigger === "build" ? isSocialPlatform(source.adapterKey) ? "آزمون دریافت" : "ساخت و آزمون" : "دریافت خبر";
  return <div className="source-run-progress" aria-live="polite">
    <span className={`platform-status ${run.status}`}>{run.status === "queued" ? <Clock3 size={14} /> : <LoaderCircle size={14} className="source-run-spinner" />}{run.status === "queued" ? `${operation} در صف` : `در حال ${operation}`}</span>
    <small>{run.status === "queued" ? "هنوز شروع نشده؛ در انتظار Worker" : "اجرا شروع شده؛ گزارش خودکار تازه می‌شود"}</small>
    <small>{run.status === "queued" ? "ثبت در صف: " : "شروع: "}{new Date(run.startedAt ?? run.createdAt).toLocaleString("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}</small>
    <a href="#crawl-runs" onClick={() => onSelectRun(run.id)}>مشاهدهٔ گزارش {operation}</a>
  </div>;
}
