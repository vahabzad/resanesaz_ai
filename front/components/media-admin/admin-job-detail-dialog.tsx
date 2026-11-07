"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import type { EditorialJobDetail } from "@/lib/contracts/editorial";
import { editorialJobLabels, editorialTime } from "@/lib/editorial-activity";
import { WorkspaceDialog } from "../workspace-dialog";

export function AdminJobDetailDialog({ id, canManage, busy, onClose, onRetry }: { id: string; canManage: boolean; busy: boolean; onClose: () => void; onRetry: () => void }) {
  const [detail, setDetail] = useState<EditorialJobDetail | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<EditorialJobDetail>(`/api/v1/editorial/jobs/${encodeURIComponent(id)}`, undefined, undefined, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) { setDetail(value); setError(""); } })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "دریافت جزئیات انجام نشد."); });
    return () => controller.abort();
  }, [id, attempt]);
  return <WorkspaceDialog title={detail?.title ?? "جزئیات فعالیت سردبیر"} context={detail ? `${detail.sectionName} · ${editorialJobLabels[detail.status] ?? detail.status}` : "علت و متن ورودی"} dirty={false} busy={busy} loading={!detail && !error} error={error} onClose={onClose}
    footer={close => <><span>{detail ? `تلاش ${detail.attempts.toLocaleString("fa-IR")}` : ""}</span><div>{canManage && detail?.diagnosis.canRetry && <button className="primary-button" disabled={busy} onClick={onRetry}>تلاش مجدد</button>}<button className="secondary-button" disabled={busy} onClick={close}>بستن</button></div></>}>
    {error && <button className="secondary-button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>تلاش دوباره برای دریافت جزئیات</button>}
    {detail && <div className="admin-job-detail"><section className={`admin-job-diagnosis ${detail.diagnosis.reviewRequired ? "review" : ""}`}><h3>{detail.diagnosis.title}</h3><p>{detail.diagnosis.explanation}</p><strong>اقدام پیشنهادی</strong><p>{detail.diagnosis.action}</p>{detail.errorCode && <small>کد ثبت‌شده: <code dir="ltr">{detail.errorCode}</code></small>}</section><p className="admin-job-detail-time">ثبت: {editorialTime(detail.createdAt)} · پایان: {editorialTime(detail.finishedAt)}</p><section><h3>ورودی دریافت‌شده از {detail.input.sourceName}</h3><p>این متن، ورودی اصلی این اجراست و خروجی تأییدشدهٔ سردبیر محسوب نمی‌شود.</p><div className="inbox-reader-text" dir="auto">{detail.input.content}</div></section></div>}
  </WorkspaceDialog>;
}
