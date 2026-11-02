"use client";
import { useState } from "react";
import type { EditorialWorkspace } from "@/lib/contracts/editorial";
import { editorialLanguages } from "@/lib/contracts/editorial-settings";
import { formatAutomaticStart } from "./automatic-start-settings";
import { SectionEditor } from "./section-editor";
import { SectionInputsDialog, type SectionCandidate } from "./section-inputs-dialog";
import { apiRequest } from "@/lib/api-client";

type Props = { active: boolean; workspace: EditorialWorkspace; canManage: boolean; canCreate: boolean; busy: boolean; error: string; message: string; clearFeedback: () => void; run: (action: () => Promise<void>) => Promise<void>; onQueue: (rawArticleId: string, sectionId: string) => Promise<void>; onCreate: (rawArticleId: string, sectionId: string) => Promise<void> };

export function SectionManager({ active, workspace, canManage, canCreate, busy, error, message, clearFeedback, run, onCreate, onQueue }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [inputSectionId, setInputSectionId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<SectionCandidate[]>([]);
  const section = workspace.sections.find(s => s.id === editingId);
  const inputSection = workspace.sections.find(s => s.id === inputSectionId);
  const sections = workspace.sections.filter(s => (showArchived || !s.archived) && s.name.includes(query));
  const pages = Math.max(1, Math.ceil(sections.length / 10));
  const current = Math.min(page, pages);
  async function inputs(id: string) { await run(async () => { const result = await apiRequest<SectionCandidate[]>(`/api/v1/editorial/sections/${encodeURIComponent(id)}/articles`); setCandidates(result); setInputSectionId(id); }); }
  function edit(id: string | null) { clearFeedback(); setEditingId(id); setShowForm(true); }
  return <><section id="editorial-panel-services" role="tabpanel" aria-labelledby="editorial-tab-services" hidden={!active} className="panel editorial-settings editorial-tab-panel">
    <div className="editorial-toolbar"><h3>سرویس‌های تحریریه</h3><input value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} aria-label="جست‌وجوی سرویس" placeholder="جست‌وجوی سرویس…" /><label className="editorial-check"><input type="checkbox" checked={showArchived} onChange={e => { setShowArchived(e.target.checked); setPage(1); }} />نمایش حذف‌شده‌ها</label>{canManage && <button className="primary-button" disabled={busy} onClick={() => edit(null)}>سرویس جدید</button>}</div>
    <p className="editorial-help">منابع، نگارش و اجرای خودکار هر سرویس را از «ویرایش تنظیمات» مدیریت کنید. توقف سرویس، کارهای باز دستی و خودکار آن را لغو می‌کند.</p>
    <div className="editorial-service-rows">{sections.slice((current - 1) * 10, current * 10).map(s => <article className="editorial-service-row" key={s.id}>
      <div className="editorial-service-summary"><div className="editorial-service-heading"><h4>{s.name}</h4><span className={`editorial-service-status ${s.archived || s.paused ? "stopped" : "active"}`}>{s.archived ? "حذف‌شده" : s.paused ? "متوقف" : "فعال"}</span></div>
        <p>{editorialLanguages[s.settings.language ?? "fa"]} · {s.settings.sourceIds.length ? `${s.settings.sourceIds.length.toLocaleString("fa-IR")} منبع` : "همهٔ منابع"} · خودکار: {s.autoEnabled ? `هر ${s.autoIntervalMinutes.toLocaleString("fa-IR")} دقیقه، ${s.autoBatchSize.toLocaleString("fa-IR")} خبر${s.paused ? " (متوقف)" : ""}` : "خاموش"}</p>
        <small>شروع خودکار: {formatAutomaticStart(s.settings.autoReceivedSince)}</small>{s.autoErrorCode && <p role="alert" className="editorial-feedback error">اجرای خودکار نیازمند بررسی تنظیمات یا مجوز است: {s.autoErrorCode}</p>}
      </div>
      <div className="editorial-toolbar editorial-service-row-actions">
        {!s.archived && <button className="secondary-button" disabled={busy} onClick={() => void inputs(s.id)}>اخبار ورودی</button>}
        {canManage && <><button className="secondary-button" disabled={busy} onClick={() => edit(s.id)}>ویرایش تنظیمات</button>
          {!s.archived && <button className={`secondary-button ${s.paused ? "" : "editorial-stop"}`} disabled={busy} onClick={() => void run(async () => { await apiRequest(`/api/v1/editorial/sections/${s.id}/${s.paused ? "resume" : "stop"}`, { expectedRevision: s.revision }); })}>{s.paused ? "فعال‌سازی" : "توقف سرویس"}</button>}
          <details className="editorial-service-more"><summary>بیشتر</summary><button type="button" className="secondary-button editorial-stop" disabled={busy} onClick={() => void run(async () => { await apiRequest(`/api/v1/editorial/sections/${s.id}`, { name: s.name, settings: s.settings, parentId: s.parentId, expectedRevision: s.revision, paused: s.paused, autoEnabled: false, autoIntervalMinutes: s.autoIntervalMinutes, autoBatchSize: s.autoBatchSize, archived: !s.archived }, "PATCH"); })}>{s.archived ? "بازیابی سرویس" : "حذف قابل بازیابی"}</button></details>
        </>}
      </div>
    </article>)}</div>
    {!sections.length && <p className="settings-empty">سرویسی با این فیلتر پیدا نشد.</p>}
    {pages > 1 && <nav className="editorial-toolbar" aria-label="صفحه‌بندی سرویس‌ها"><span>{sections.length.toLocaleString("fa-IR")} سرویس · صفحهٔ {current.toLocaleString("fa-IR")} از {pages.toLocaleString("fa-IR")}</span><button className="secondary-button" disabled={current <= 1} onClick={() => setPage(current - 1)}>قبلی</button><button className="secondary-button" disabled={current >= pages} onClick={() => setPage(current + 1)}>بعدی</button></nav>}
    </section>
    {canManage && showForm && <SectionEditor key={`${section?.id ?? "new"}:${section?.revision ?? 0}`} section={section} workspace={workspace} busy={busy} error={error} close={() => setShowForm(false)} save={async value => { await run(async () => {
      if (section) await apiRequest(`/api/v1/editorial/sections/${section.id}`, { ...value, expectedRevision: section.revision, archived: section.archived, paused: section.paused }, "PATCH");
      else await apiRequest("/api/v1/editorial/sections", value);
      setShowForm(false); setInputSectionId(null);
    }); }} />}
    {inputSection && <SectionInputsDialog key={inputSection.id} name={inputSection.name} candidates={candidates} busy={busy} stopped={inputSection.paused || inputSection.archived} canCreate={canCreate} error={error} message={message} onClose={() => setInputSectionId(null)} onRefresh={() => void inputs(inputSection.id)} onQueue={id => void run(() => onQueue(id, inputSection.id))} onCreate={id => { setInputSectionId(null); void run(() => onCreate(id, inputSection.id)); }} />}
  </>;
}
