"use client";

import { useRef, useState, type FormEvent } from "react";
import { Check, Globe2, MessagesSquare, Pencil, Save, Trash2, X } from "lucide-react";
import type { MediaSourceAccessRequest, SourceAccessInput } from "@/lib/contracts/media-setup";
import { sourceRequestKey } from "@/lib/contracts/media-setup";
import type { PlatformCategory } from "@/lib/contracts/platform-categories";
import { detectSocialPlatform } from "../../lib/contracts/social-source";
import { socialPlatformLabels } from "../../lib/contracts/social-platforms";
import { SourceInputFields } from "./source-input-fields";

export type SourceListItem = SourceAccessInput & { id: string; saved: boolean; status: MediaSourceAccessRequest["status"] };
const statusLabels: Record<MediaSourceAccessRequest["status"], string> = { draft: "پیش‌نویس ذخیره‌شده", pending: "در انتظار بررسی", rejected: "رد شده", crawler_queued: "در صف ساخت کراولر", crawler_failed: "خطا در ساخت کراولر", access_granted: "دسترسی تأیید شده" };

export function SourceList({ items, categories, busy, setupCompleted, onEdit, onRemove, onEditingChange }: {
  items: SourceListItem[]; categories: PlatformCategory[]; busy: boolean; setupCompleted: boolean;
  onEdit: (item: SourceListItem, input: SourceAccessInput) => Promise<void>;
  onRemove: (item: SourceListItem) => void; onEditingChange: (editing: boolean) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<SourceAccessInput>({ sourceType: "website", url: "", categoryMode: "all", categoryIds: [] });
  const [error, setError] = useState("");
  const editor = useRef<HTMLFormElement>(null);
  const editButton = useRef<HTMLButtonElement | null>(null);
  function close() { setEditing(null); setError(""); onEditingChange(false); requestAnimationFrame(() => editButton.current?.focus({ preventScroll: true })); }
  function begin(item: SourceListItem, button: HTMLButtonElement) {
    editButton.current = button;
    setDraft({ sourceType: item.sourceType, url: item.url, ...(item.platform ? { platform: item.platform } : {}), ...(item.sourceType === "website" ? { categoryMode: item.categoryMode ?? "selected", categoryIds: [...item.categoryIds ?? []] } : {}) });
    setError(""); setEditing(item.id); onEditingChange(true);
    requestAnimationFrame(() => { editor.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); editor.current?.querySelector<HTMLInputElement>('input[type="url"], input[type="text"]')?.focus({ preventScroll: true }); });
  }
  async function save(event: FormEvent, item: SourceListItem) {
    event.preventDefault(); setError("");
    if (draft.sourceType === "website" && draft.categoryMode === "selected" && !draft.categoryIds?.length) { setError("حداقل یک دسته‌بندی انتخاب کنید یا همهٔ دسته‌ها را فعال کنید."); return; }
    try { await onEdit(item, { ...draft, url: draft.url.trim() }); close(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "ویرایش منبع ذخیره نشد."); }
  }
  return <section className="setup-source-list" aria-label="فهرست منابع انتخاب‌شده">
    <header><div><h2>منابع انتخاب‌شده <span>{items.length.toLocaleString("fa-IR")}</span></h2><p>{setupCompleted ? "نوع و دسته‌بندی هر منبع در کارت آن مشخص است." : "برای هر منبع، دسته‌بندی مستقل انتخاب کنید. پیش‌نویس‌های ذخیره‌شده نیز تا پایان راه‌اندازی قابل ویرایش‌اند."}</p></div>{Boolean(items.length) && <small>{items.filter(item => item.saved).length.toLocaleString("fa-IR")} ذخیره‌شده · {items.filter(item => !item.saved).length.toLocaleString("fa-IR")} ثبت‌نشده</small>}</header>
    {!items.length && <div className="setup-source-empty">هنوز منبعی اضافه نکرده‌اید. نوع، لینک و دسته‌بندی را از فرم بالا انتخاب کنید.</div>}
    {items.map((item, index) => {
      const editable = !item.saved || (!setupCompleted && (item.status === "draft" || item.status === "pending"));
      let hostname = item.url;
      try { hostname = new URL(item.url).hostname.replace(/^www\./, ""); } catch { /* Display the entered value until validated. */ }
      const platform = item.platform ?? detectSocialPlatform(item.url);
      const Icon = item.sourceType === "website" ? Globe2 : MessagesSquare;
      const duplicate = items.slice(0, index).some(other => sourceRequestKey(other.url) === sourceRequestKey(item.url));
      return <article key={item.id} className={`setup-source-card${editing === item.id ? " editing" : ""}`}>
        <div className="setup-source-card-header"><div className="setup-source-identity"><i><Icon size={19} /></i><div><b dir="ltr">{hostname}</b><span>{item.sourceType === "website" ? "وب‌سایت خبری" : platform ? socialPlatformLabels[platform] : "شبکهٔ اجتماعی"}</span></div></div><span className={`setup-source-status ${item.saved ? item.status : "unsaved"}`}>{item.saved && ["draft", "access_granted"].includes(item.status) ? <Check size={13} /> : null}{item.saved ? statusLabels[item.status] : "هنوز ذخیره نشده"}</span><div className="setup-source-actions">{editable && <><button type="button" disabled={busy || editing !== null} onClick={event => begin(item, event.currentTarget)} aria-label={`ویرایش منبع ${hostname}`}><Pencil size={14} />ویرایش</button><button type="button" className="remove" disabled={busy || editing !== null} onClick={() => onRemove(item)} aria-label={`حذف منبع ${hostname}`}><Trash2 size={14} />حذف</button></>}</div></div>
        <p className="setup-source-url" dir="ltr">{item.url}</p>
        <div className="setup-source-categories"><b>دسته‌بندی‌های انتخاب‌شده</b>{item.sourceType === "social" ? <p>برای شبکهٔ اجتماعی دسته‌بندی انتخاب نمی‌شود.</p> : item.categoryMode === "all" ? <div className="setup-source-chips"><span className="all">همهٔ دسته‌ها</span><small>همهٔ دسته‌بندی‌های این منبع درخواست می‌شوند.</small></div> : <div className="setup-source-chips">{item.categoryIds?.length ? item.categoryIds.map(key => { const category = categories.find(category => category.id === key); return <span key={key} className={category ? "" : "unavailable"}>{category?.nameFa ?? "دستهٔ خارج از دسترس"}</span>; }) : <span className="unavailable">هنوز دسته‌بندی مشخص نشده است</span>}</div>}</div>
        {duplicate && <p className="setup-source-warning">این منبع در فهرست تکراری است؛ لینک را ویرایش یا ردیف اضافه را حذف کنید.</p>}
        {!editable && <p className="setup-source-readonly">برای بررسی ارسال شده است؛ ویرایش پیش‌نویس در دسترس نیست.</p>}
        {editing === item.id && <form ref={editor} className="setup-source-editor" onSubmit={event => void save(event, item)} onKeyDown={event => { if (event.key === "Escape" && !busy) { event.preventDefault(); close(); } }}>
          <h3>ویرایش {hostname}</h3><SourceInputFields value={draft} categories={categories} onChange={setDraft} disabled={busy} />
          {error && <p className="editorial-feedback error" role="alert">{error}</p>}
          <div className="setup-source-editor-actions"><button type="submit" className="primary-button" disabled={busy}><Save size={15} />{busy ? "در حال ذخیره…" : item.saved ? "ذخیرهٔ تغییرات منبع" : "اعمال تغییرات در فهرست"}</button><button type="button" className="secondary-button" disabled={busy} onClick={close}><X size={15} />انصراف</button></div>
          <small>{item.saved ? "این تغییرات در پیش‌نویس رسانه ذخیره می‌شوند؛ ارسال برای بررسی در پایان راه‌اندازی است." : "این ردیف با دکمهٔ «ذخیرهٔ پیش‌نویس منابع و ادامه» ثبت می‌شود."}</small>
        </form>}
      </article>;
    })}
  </section>;
}
