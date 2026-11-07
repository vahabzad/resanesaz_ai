import { LoaderCircle, Pause, Play, Settings2, UserRoundPen } from "lucide-react";
import type { ManagedSection } from "@/lib/contracts/editorial-settings";
import { editorialLanguages } from "@/lib/contracts/editorial-settings";
import type { EditorialQueueWorkspace } from "@/lib/contracts/editorial";
import { editorActivityState, editorialTime } from "@/lib/editorial-activity";
import { formatAutomaticFreshness } from "../editorial/automatic-freshness-settings";
import { formatAutomaticStart } from "../editorial/automatic-start-settings";

export function AdminEditorCard({ section, activity, activityLoaded, busy, canManage, onEdit, onToggle, onActivity }: {
  section: ManagedSection; activity?: EditorialQueueWorkspace["activity"][number]; activityLoaded: boolean; busy: boolean; canManage: boolean;
  onEdit: () => void; onToggle: () => void; onActivity: (status?: string) => void;
}) {
  const state = editorActivityState(section, activity);
  return <article className="admin-editor-card">
    <header><div className="admin-editor-identity"><span><UserRoundPen size={21} /></span><div><h3>{section.name}</h3><p>{editorialLanguages[section.settings.language ?? "fa"]} · نسخهٔ تنظیمات {section.revision.toLocaleString("fa-IR")}</p></div></div>{activityLoaded ? <span className={`admin-editor-state ${state.tone}`}>{activity?.running ? <LoaderCircle className="source-run-spinner" size={14} /> : null}{state.label}</span> : <span className="admin-editor-state">در حال دریافت فعالیت…</span>}</header>
    <p className="admin-editor-explanation">{state.help}</p>
    <div className="admin-editor-scope"><span>{section.settings.sourceIds.length + (section.settings.sourceUrls?.length ?? 0) ? `${(section.settings.sourceIds.length + (section.settings.sourceUrls?.length ?? 0)).toLocaleString("fa-IR")} منبع انتخاب‌شده` : "همهٔ منابع مجاز"}</span><span>{section.settings.categories.length ? section.settings.categories.join("، ") : "همهٔ دسته‌ها"}</span><span>{section.autoEnabled ? `بررسی هر ${section.autoIntervalMinutes.toLocaleString("fa-IR")} دقیقه · ${section.autoBatchSize.toLocaleString("fa-IR")} خبر در نوبت` : "اجرای خودکار غیرفعال"}</span></div>
    <div className="admin-editor-metrics">{([{ key: "queued", label: "در صف", value: activity?.queued }, { key: "running", label: "در حال تحریر", value: activity?.running }, { key: "succeeded", label: "خروجی موفق", value: activity?.succeeded }, { key: "review_required", label: "نیازمند بررسی", value: activity?.reviewRequired }, { key: "failed", label: "خطای اجرا", value: activity?.failed }]).map(({ key, label, value }) => <button type="button" key={key} disabled={busy || !activityLoaded} onClick={() => onActivity(key)} aria-label={`${label} · ${section.name}`} className={key === "failed" && value ? "has-error" : ""}><b>{activityLoaded ? (value ?? 0).toLocaleString("fa-IR") : "—"}</b><span>{label}</span></button>)}</div>
    <p className="admin-editor-metrics-help">برای دیدن خبرها و علت هر مورد، روی شمار آن بزنید.</p><details className="admin-editor-details"><summary>جزئیات زمان‌بندی و آخرین اجرا</summary><div className="admin-editor-times"><span>آخرین بررسی خودکار: {editorialTime(section.lastEnqueuedAt)}</span><span>آخرین پایان کار: {activityLoaded ? editorialTime(activity?.lastFinishedAt ?? null) : "در حال دریافت…"}</span><span>{formatAutomaticFreshness(section.settings.autoFreshness)}</span><span>بازهٔ خودکار: {formatAutomaticStart(section.settings.autoReceivedSince)}</span></div></details>
    <footer>{canManage && <button type="button" className="secondary-button" disabled={busy} onClick={onEdit}><Settings2 size={15} />تنظیمات</button>}<button type="button" className="secondary-button" disabled={busy} onClick={() => onActivity()}>فعالیت‌ها و خروجی‌ها</button>{canManage && <button type="button" className="secondary-button admin-editor-toggle" disabled={busy || section.archived} onClick={onToggle}>{section.paused ? <Play size={14} /> : <Pause size={14} />}{section.paused ? "فعال‌سازی" : "توقف"}</button>}</footer>
  </article>;
}
