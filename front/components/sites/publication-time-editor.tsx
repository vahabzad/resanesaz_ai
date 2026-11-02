"use client";
import { useId, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import type { Publication } from "@/lib/contracts/sites";
import { WorkspaceDialog } from "../workspace-dialog";
import { EditorialDatePicker } from "../editorial/editorial-date-picker";

export function PublicationTimeEditor({ job, onClose, onSaved }: { job: Publication; onClose: () => void; onSaved: () => void }) {
  const formId = useId();
  const [when, setWhen] = useState(() => Date.parse(job.scheduledAt) > Date.now() ? job.scheduledAt : new Date(Date.now() + 3600000).toISOString());
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <WorkspaceDialog title="تغییر زمان انتشار" context={`${job.siteName} · نسخهٔ ${job.revision.toLocaleString("fa-IR")}`} itemLabel="زمان‌بندی" discardHelp="برای ثبت زمان تازه، به ویرایش برگردید و ذخیره کنید." dirty={when !== job.scheduledAt} busy={busy} error={error} onClose={onClose} footer={close => <><span>انتشار در زمان آینده به وقت تهران</span><div><button form={formId} type="submit" className="primary-button" disabled={busy}>ثبت زمان تازه</button><button type="button" className="secondary-button" disabled={busy} onClick={close}>انصراف</button></div></>}>
    <form id={formId} className="panel editorial-settings" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(""); try { await apiRequest(`/api/v1/publications/${job.id}/reschedule`, { scheduledAt: when, expectedScheduledAt: job.scheduledAt }); onSaved(); } catch (e) { setError(e instanceof Error ? e.message : "تغییر زمان ناموفق بود."); } finally { setBusy(false); } }}><h3 dir="auto">{job.title}</h3><EditorialDatePicker value={when} disabled={busy} onChange={setWhen} label="تاریخ انتشار" timeLabel="ساعت انتشار (به وقت تهران)" /></form>
  </WorkspaceDialog>;
}
