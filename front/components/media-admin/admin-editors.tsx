"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Plus, RefreshCw, UserRoundPen } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import type { EditorialDetail, EditorialQueueWorkspace, EditorialWorkspace } from "@/lib/contracts/editorial";
import type { ManagedSection } from "@/lib/contracts/editorial-settings";
import type { PlatformCategory } from "@/lib/contracts/platform-categories";
import { AdminEditorCard } from "./admin-editor-card";
import { AdminEditorDialog, type EditorSettingsInput } from "./admin-editor-dialog";
import { AdminEditorJobs } from "./admin-editor-jobs";
import { AdminJobDetailDialog } from "./admin-job-detail-dialog";
import { WorkspaceDialog } from "../workspace-dialog";
import { RenditionPreview } from "../editorial/rendition-preview";

export function AdminEditors({ initial, canManage }: { initial?: EditorialWorkspace; canManage: boolean }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState(initial ?? null);
  const [queue, setQueue] = useState<EditorialQueueWorkspace | null>(null);
  const [categories, setCategories] = useState<PlatformCategory[]>([]);
  const [selectedSection, setSelectedSection] = useState("");
  const [view, setView] = useState<"editors" | "activity">("editors");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editor, setEditor] = useState<{ section: ManagedSection | null } | null>(null);
  const [output, setOutput] = useState<{ loading: boolean; detail: EditorialDetail | null; error: string } | null>(null);
  const requestId = useRef(0);
  const outputRequest = useRef(0);
  const actionLock = useRef(false);
  const queuePath = `/api/v1/editorial/jobs?${new URLSearchParams({ page: String(page), pageSize: "10", ...(selectedSection ? { sectionId: selectedSection } : {}), ...(status === "all" ? {} : { status }) })}`;
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const request = ++requestId.current;
    try {
      const [data, jobs, catalog] = await Promise.all([apiRequest<EditorialWorkspace>("/api/v1/editorial", undefined, undefined, { signal }), apiRequest<EditorialQueueWorkspace>(queuePath, undefined, undefined, { signal }), apiRequest<PlatformCategory[]>("/api/v1/media/source-categories", undefined, undefined, { signal })]);
      if (signal?.aborted || request !== requestId.current) return;
      setWorkspace(data); setQueue(jobs); setCategories(catalog); setLoadError("");
    } catch (cause) { if (!signal?.aborted && request === requestId.current) setLoadError(cause instanceof Error ? cause.message : "دریافت سردبیرها و فعالیت‌ها ناموفق بود."); }
    finally { if (!signal?.aborted && request === requestId.current) setRefreshing(false); }
  }, [queuePath]);
  useEffect(() => { const controller = new AbortController(); const first = setTimeout(() => void refresh(controller.signal), 0); const timer = setInterval(() => void refresh(controller.signal), 10000); return () => { controller.abort(); clearTimeout(first); clearInterval(timer); }; }, [refresh]);
  useEffect(() => () => { outputRequest.current++; }, []);
  async function run(action: () => Promise<void>, success: string) {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError(""); setMessage("");
    try { await action(); setMessage(success); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "ثبت تغییر ناموفق بود."); }
    finally { actionLock.current = false; setBusy(false); }
  }
  async function save(input: EditorSettingsInput) {
    if (!editor) return;
    await run(async () => {
      const section = editor.section;
      if (section) await apiRequest(`/api/v1/editorial/sections/${encodeURIComponent(section.id)}`, { ...input, expectedRevision: section.revision, archived: section.archived, paused: section.paused }, "PATCH");
      else await apiRequest("/api/v1/editorial/sections", input);
      setEditor(null);
    }, "تنظیمات سردبیر ذخیره شد؛ کارهای قبلی تنظیمات ثبت‌شدهٔ خود را حفظ می‌کنند.");
  }
  async function showOutput(id: string) {
    const request = ++outputRequest.current;
    setOutput({ loading: true, detail: null, error: "" });
    try { const detail = await apiRequest<EditorialDetail>(`/api/v1/editorial/stories/${encodeURIComponent(id)}`); if (request === outputRequest.current) setOutput({ loading: false, detail, error: "" }); }
    catch (cause) { if (request === outputRequest.current) setOutput({ loading: false, detail: null, error: cause instanceof Error ? cause.message : "دریافت خروجی ناموفق بود." }); }
  }
  const sections = workspace?.sections.filter(section => !section.archived) ?? [];
  function openActivity(sectionId: string, nextStatus = "all") {
    if (busy) return;
    setSelectedSection(sectionId); setStatus(nextStatus); setQueue(null); setPage(1); setView("activity");
  }
  const version = output?.detail?.versions[0];
  return <div className="admin-editors editorial-workspace">
    <section className="panel admin-editors-heading"><div><span className="eyebrow">تحریریهٔ رسانه</span><h2>سردبیرهای من</h2><p>پرامپت‌ها، ورودی و اجرای خودکار هر سردبیر را مدیریت و نتیجهٔ کارش را دنبال کنید.</p></div><div><button type="button" className="secondary-button" disabled={busy || refreshing} onClick={() => { setRefreshing(true); void refresh(); }}><RefreshCw size={15} className={refreshing ? "source-run-spinner" : ""} />تازه‌سازی</button>{canManage && <button type="button" className="primary-button" disabled={busy || !workspace} onClick={() => { setError(""); setEditor({ section: null }); }}><Plus size={16} />افزودن سردبیر</button>}</div></section>
    {(loadError || (!editor && error)) && <p role="alert" className="editorial-feedback error">{loadError || error}</p>}
    {message && <p role="status" className="editorial-feedback">{message}</p>}
    {!workspace ? <section className="panel admin-empty">{loadError ? "اطلاعات دریافت نشد؛ دوباره تازه‌سازی کنید." : "در حال دریافت سردبیرها…"}</section> : <>
      <nav className="admin-editor-navigation" aria-label="نمای تحریریه"><button type="button" aria-pressed={view === "editors"} onClick={() => setView("editors")}><UserRoundPen size={17} />سردبیرها <span>{sections.length.toLocaleString("fa-IR")}</span></button><button type="button" aria-pressed={view === "activity"} onClick={() => setView("activity")}><Activity size={17} />فعالیت‌ها و خروجی‌ها</button><small>فعالیت‌ها هر ۱۰ ثانیه به‌روز می‌شوند</small></nav>
      <div hidden={view !== "editors"}><div className="admin-editor-list">{sections.length ? sections.map(section => <AdminEditorCard key={section.id} section={section} activity={queue?.activity.find(item => item.sectionId === section.id)} activityLoaded={Boolean(queue)} busy={busy} canManage={canManage} onEdit={() => { setError(""); setEditor({ section }); }} onToggle={() => void run(async () => { await apiRequest(`/api/v1/editorial/sections/${encodeURIComponent(section.id)}/${section.paused ? "resume" : "stop"}`, { expectedRevision: section.revision }); }, section.paused ? "سردبیر فعال شد؛ وضعیت اجرای خودکار طبق تنظیمات آن است." : "سردبیر متوقف شد و کارهای باز آن لغو شدند.")} onActivity={nextStatus => openActivity(section.id, nextStatus)} />) : <section className="panel admin-empty"><UserRoundPen size={28} /><h2>هنوز سردبیری ساخته نشده است</h2><p>برای تعریف پرامپت، منابع و اجرای خودکار، یک سردبیر اضافه کنید.</p></section>}</div></div>
      <div hidden={view !== "activity"}>
      <AdminEditorJobs error={loadError} queue={queue} sections={workspace.sections} sectionId={selectedSection} status={status} busy={busy} loading={refreshing || !queue} canManage={canManage} onSection={id => { setSelectedSection(id); setQueue(null); setPage(1); }} onStatus={value => { setStatus(value); setQueue(null); setPage(1); }} onPage={value => { setQueue(null); setPage(value); }} onAction={(id, action) => void run(async () => { await apiRequest(`/api/v1/editorial/jobs/${encodeURIComponent(id)}/${action}`, {}); }, action === "retry" ? "کار دوباره در صف قرار گرفت." : "کار لغو شد.")} onDetail={setJobId} onOutput={id => void showOutput(id)} />
      </div>
    </>}
    {jobId && <AdminJobDetailDialog key={jobId} id={jobId} canManage={canManage} busy={busy} onClose={() => setJobId(null)} onRetry={() => { const id = jobId; setJobId(null); void run(async () => { await apiRequest(`/api/v1/editorial/jobs/${encodeURIComponent(id)}/retry`, {}); }, "کار دوباره در صف قرار گرفت."); }} />}
    {editor && workspace && <AdminEditorDialog section={editor.section} workspace={workspace} categories={categories} busy={busy} error={error} onClose={() => { setEditor(null); setError(""); }} onSave={save} />}
    {output && <WorkspaceDialog title={version?.title ?? "خروجی سردبیر"} context="فعالیت سردبیرها · مشاهدهٔ خروجی" dirty={false} loading={output.loading} error={output.error} onClose={() => { outputRequest.current++; setOutput(null); }}><section className="editorial-settings">{version ? <RenditionPreview value={version.renditions} editable={false} change={() => {}} /> : !output.loading && !output.error ? <p>نسخه‌ای برای نمایش ثبت نشده است.</p> : null}</section></WorkspaceDialog>}
  </div>;
}
