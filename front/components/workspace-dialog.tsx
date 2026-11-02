"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowRight, X } from "lucide-react";

export function WorkspaceDialog({ title, context, loading = false, busy = false, dirty, error = "", message = "", itemLabel = "خبر", discardHelp = "برای حفظ تغییرات به ویرایش برگردید و نسخهٔ جدید را ذخیره کنید.", onClose, children, footer }: {
  title: string; context: string; loading?: boolean; busy?: boolean; dirty: boolean;
  error?: string; message?: string; itemLabel?: string; discardHelp?: string; onClose: () => void; children: ReactNode; footer?: (requestClose: () => void) => ReactNode;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorFeedback = useRef<HTMLParagraphElement>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    heading.current?.focus();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previousOverflow; if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty]);

  useEffect(() => {
    if (error) errorFeedback.current?.scrollIntoView({ block: "nearest" });
  }, [error]);

  function requestClose() {
    if (busy && !loading) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  return <dialog ref={dialog} className="story-workspace-dialog editorial-workspace" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); requestClose(); }}>
    <header className="story-workspace-header">
      <div><span className="story-workspace-context">{context}</span><h2 id={titleId} ref={heading} tabIndex={-1} dir="auto">{title}</h2></div>
      <button type="button" className="secondary-button story-workspace-back" disabled={busy && !loading} onClick={requestClose}><ArrowRight size={18} /><span>بازگشت به فهرست</span><X size={16} /></button>
    </header>
    <div className="story-workspace-content" aria-busy={loading}>
      {confirmClose && <section className="story-workspace-confirm" role="alert" aria-label="ویرایش ذخیره‌نشده">
        <strong>ویرایش‌های این {itemLabel} هنوز ذخیره نشده‌اند.</strong><p>{discardHelp}</p>
        <div><button type="button" className="primary-button" autoFocus onClick={() => { setConfirmClose(false); heading.current?.focus(); }}>ادامهٔ ویرایش</button><button type="button" className="secondary-button editorial-stop" disabled={busy} onClick={onClose}>کنارگذاشتن تغییرات و بستن</button></div>
      </section>}
      {error && <p ref={errorFeedback} className="editorial-feedback error" role="alert">{error}</p>}
      {message && <p className="editorial-feedback" role="status">{message}</p>}
      {loading ? <p className="story-workspace-loading" role="status">در حال دریافت متن و نسخه‌های خبر…</p> : children}
    </div>
    {footer && <footer className="workspace-dialog-footer">{footer(requestClose)}</footer>}
  </dialog>;
}
