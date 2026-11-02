"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import type { PlatformContext } from "@/lib/contracts/context";
import type { PlatformSourcesWorkspace, CrawlRunLiveLog } from "@/lib/contracts/sources";
import { apiRequest } from "@/lib/api-client";
import { SourceCreateForm } from "./source-create-form";
import { SourceCatalog } from "./source-catalog";
import { CrawlRunsPanel } from "./crawl-runs-panel";
import { PlatformShell } from "./platform-shell";

export function PlatformSources({ context, initialWorkspace }: { context: PlatformContext; initialWorkspace: PlatformSourcesWorkspace }) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [log, setLog] = useState<CrawlRunLiveLog | null>(null);
  const actionLock = useRef(false);
  const refresh = useCallback(async () => { setWorkspace(await apiRequest<PlatformSourcesWorkspace>("/api/v1/platform/sources")); }, []);
  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const data = await apiRequest<PlatformSourcesWorkspace>("/api/v1/platform/sources");
        if (active) setWorkspace(data);
        if (selectedRunId) {
          const data = await apiRequest<CrawlRunLiveLog>(`/api/v1/platform/crawl-runs/${encodeURIComponent(selectedRunId)}/events`);
          if (active) setLog(data);
        }
      } catch (error) { if (active) setError(error instanceof Error ? error.message : "دریافت اطلاعات ناموفق بود."); }
    }
    void poll(); const timer = setInterval(() => void poll(), 5000);
    return () => { active = false; clearInterval(timer); };
  }, [selectedRunId]);
  async function action(id: string, operation: "run" | "stop" | "resume" | "build" | "debug") {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      const result = await apiRequest<{ runId?: string; accepted?: boolean }>(`/api/v1/platform/sources/${encodeURIComponent(id)}/${operation}`, {});
      if (result.runId) { setLog(null); setSelectedRunId(result.runId); }
      setNotice(result.runId && result.accepted === false ? "این منبع اجرای باز دارد؛ گزارش همان اجرا انتخاب شد و کار تکراری ساخته نشد." : operation === "debug" ? "دیباگ کراولر با Codex در صف قرار گرفت؛ گزارش خطا و آزمون اصلاحات در این اجرا نمایش داده می‌شود." : operation === "build" ? "ساخت و آزمون نسخهٔ جدید در صف قرار گرفت؛ فعال‌سازی پس از موفقیت آزمون انجام می‌شود." : operation === "run" ? "اجرا در صف Worker قرار گرفت." : operation === "stop" ? "منبع متوقف شد؛ اجراهای باز لغو شدند." : "منبع فعال شد.");
      await refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "عملیات ناموفق بود."); }
    finally { actionLock.current = false; setBusy(false); }
  }
  async function manualRefresh() { setBusy(true); setError(null); try { await refresh(); } catch { setError("به‌روزرسانی ناموفق بود. اتصال را بررسی کنید."); } finally { setBusy(false); } }
  return <PlatformShell context={context} active="sources" title="منابع و کراولرها" actions={<><button className="icon-button" onClick={manualRefresh} disabled={busy} aria-label="به‌روزرسانی"><RefreshCw size={18} /></button><a href="#create-source" className="primary-button"><Plus size={18} />ساخت کراولر</a></>}>
      <div className="platform-content"><div className="platform-summary"><div><b>{workspace.sources.filter((s) => !s.archivedAt).length.toLocaleString("fa-IR")}</b><span>منبع سراسری</span></div><div><b>{workspace.sources.filter((s) => s.enabled).length.toLocaleString("fa-IR")}</b><span>منبع فعال</span></div><div><b>{workspace.sources.filter((s) => s.activeRunId).length.toLocaleString("fa-IR")}</b><span>اجرای باز</span></div><div><b>{workspace.sources.filter((s) => s.status === "failed").length.toLocaleString("fa-IR")}</b><span>نیازمند رسیدگی</span></div></div>
        {error && <p className="platform-feedback platform-error" role="alert">{error}</p>}{notice && <p className="platform-feedback platform-success" role="status">{notice}</p>}
        <div className="platform-grid"><div className="platform-panels"><SourceCatalog onSelectRun={(id) => { setLog(null); setSelectedRunId(id); }} sources={workspace.sources} busy={busy} onAction={action} onChanged={refresh} onScheduleSaved={(id, minutes) => setWorkspace((current) => ({ ...current, sources: current.sources.map((item) => item.id === id ? { ...item, scheduleMinutes: minutes } : item) }))} /><CrawlRunsPanel runs={workspace.recentRuns} log={log} selectedRunId={selectedRunId} onSelect={(id) => { setLog(null); setSelectedRunId(id); }} /></div><aside><SourceCreateForm onCreated={async (runId) => { setLog(null); setSelectedRunId(runId); await refresh(); }} /></aside></div>
      </div>
  </PlatformShell>;
}
