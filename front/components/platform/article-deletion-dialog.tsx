import { useEffect, useRef, useState } from "react";
import type { ArticleDeletionPreview } from "@/lib/contracts/platform-articles";

export function ArticleDeletionDialog({ preview, sourceName, busy, error, onConfirm, onClose }: {
  preview: ArticleDeletionPreview; sourceName: string; busy: boolean; error: string | null;
  onConfirm: () => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="article-delete-dialog" aria-labelledby="article-delete-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <h2 id="article-delete-title">{preview.mode === "all" ? "حذف تمام اخبار کراول‌شده" : "حذف اخبار مطابق فیلترها"}</h2>
    <p><strong>{preview.articleCount.toLocaleString("fa-IR")} خبر</strong> و <strong>{preview.inboxCount.toLocaleString("fa-IR")} ورودی صندوق رسانه‌ها</strong> حذف می‌شوند.</p>
    <dl><dt>منبع</dt><dd>{preview.filters.sourceId ? sourceName : "همهٔ منابع"}</dd><dt>دسته‌بندی</dt><dd>{preview.filters.category || "همهٔ دسته‌بندی‌ها"}</dd>{preview.filters.query && <><dt>جست‌وجوی عنوان</dt><dd>{preview.filters.query}</dd></>}{preview.filters.status && <><dt>وضعیت</dt><dd>{preview.filters.status === "quarantined" ? "قرنطینه" : "جدید"}</dd></>}</dl>
    <p>حذف دائمی است و تمام نتایج این محدوده را شامل می‌شود، نه فقط صفحهٔ فعلی. منابع، اشتراک‌ها و سابقهٔ اجراها حفظ می‌شوند.</p>
    <p>خبرهای دریافت‌شده پس از پیش‌نمایش حذف نمی‌شوند. کراول بعدی ممکن است خبر حذف‌شده را دوباره دریافت کند.</p>
    {error && <p className="platform-error" role="alert">{error}</p>}
    {preview.articleCount > 0 && <label>برای تأیید، کلمهٔ «حذف» را بنویسید<input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} autoComplete="off" /></label>}
    <div className="article-delete-actions"><button type="button" disabled={busy} onClick={onClose}>انصراف</button><button type="button" className="primary-button" disabled={busy || !preview.articleCount || confirmation.trim() !== "حذف"} onClick={onConfirm}>{busy ? "در حال حذف…" : "حذف دائمی"}</button></div>
  </dialog>;
}
