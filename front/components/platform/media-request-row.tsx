"use client";

import { useId, useState } from "react";
import { Check, ChevronDown, Clock3, ExternalLink, Globe2, Radio, Users, X } from "lucide-react";
import type { PlatformMediaRequest } from "@/lib/contracts/media-requests";

function requestDate(value: string | null) {
  return value ? new Date(value).toLocaleString("fa-IR", { timeZone: "Asia/Tehran", dateStyle: "medium", timeStyle: "short" }) : "ثبت نشده";
}

export function MediaRequestRow({ row, busy, review }: { row: PlatformMediaRequest; busy: boolean; review: (action: "approve" | "reject", note: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const id = useId();
  const pending = row.status === "pending";
  return <article className={`media-request-card${open ? " is-open" : ""}`}>
    <div className="media-request-summary">
      <div className="media-request-identity"><span className="media-request-avatar"><Radio size={20} /></span><div><h3>{row.mediaName}</h3><p>{row.requestedBy ?? "درخواست‌کنندهٔ قبلی"}</p>{row.requesterEmail && <span className="media-request-email" dir="ltr">{row.requesterEmail}</span>}</div></div>
      <div className="media-request-overview"><span><Globe2 size={14} />{row.sites.length.toLocaleString("fa-IR")} سایت</span><span><Radio size={14} />{row.sources.length.toLocaleString("fa-IR")} منبع</span><span><Users size={14} />{row.editors.length.toLocaleString("fa-IR")} سردبیر</span></div>
      <div className="media-request-timing"><span className={`media-request-badge ${row.status}`}>{pending ? <Clock3 size={13} /> : row.status === "approved" ? <Check size={13} /> : <X size={13} />}{pending ? "در انتظار بررسی" : row.status === "approved" ? "تأییدشده" : "ردشده"}</span><time dateTime={row.submittedAt ?? undefined}>{requestDate(row.submittedAt)}</time></div>
      <button type="button" className="secondary-button media-request-toggle" aria-expanded={open} aria-controls={id} aria-label={`${open ? "بستن جزئیات" : pending ? "بررسی درخواست" : "مشاهدهٔ جزئیات"} ${row.mediaName}`} disabled={busy} onClick={() => setOpen(!open)}>{open ? "بستن جزئیات" : pending ? "بررسی درخواست" : "مشاهدهٔ جزئیات"}<ChevronDown size={15} /></button>
    </div>
    <div id={id} hidden={!open}>
      <div className="media-request-expanded">
        <div className="media-request-details">
          <section><h4><Globe2 size={16} />مشخصات و نیازهای سایت</h4>{row.sites.length ? row.sites.map(site => <div className="media-request-site" key={site.slug}><b>{site.name}</b><span className="media-request-site-path" dir="ltr">/s/{site.slug}</span><dl><div><dt>موضوع</dt><dd>{site.topics.join("، ") || "ثبت نشده"}</dd></div><div><dt>مخاطب</dt><dd>{site.audience.join("، ") || "ثبت نشده"}</dd></div><div><dt>دسته‌بندی‌ها</dt><dd>{site.categories.join("، ") || "ثبت نشده"}</dd></div><div><dt>سبک</dt><dd>{site.style || "ثبت نشده"}</dd></div></dl>{site.notes && <div className="media-request-notes"><b>توضیحات ادمین</b><p>{site.notes}</p></div>}</div>) : <p>پیش‌نویس سایت ثبت نشده است.</p>}</section>
          <div className="media-request-supporting"><section><h4><Radio size={16} />منابع درخواستی <small>{row.sources.length.toLocaleString("fa-IR")}</small></h4>{row.sources.length ? <ul>{row.sources.map((source, index) => <li key={`${source.url}-${index}`}><span>{source.sourceType === "website" ? "وب‌سایت" : "شبکهٔ اجتماعی"}</span><a href={source.url} dir="ltr" target="_blank" rel="noreferrer">{source.url}<ExternalLink size={13} /></a><div className="media-request-source-categories">{source.sourceType === "social" ? <span>دسته‌بندی برای منابع اجتماعی کاربرد ندارد.</span> : <><b>دسته‌بندی‌های درخواستی</b>{source.categoryMode === "all" ? <span className="media-request-category">همهٔ دسته‌ها</span> : source.categoryMode === "selected" && source.categories?.length ? <div>{source.categories.map(category => <span className="media-request-category" key={category.id}>{category.name ?? `دستهٔ ناموجود (${category.id})`}</span>)}</div> : <span>دسته‌بندی درخواست ثبت نشده است.</span>}</>}</div></li>)}</ul> : <p>منبعی ثبت نشده است.</p>}</section><section><h4><Users size={16} />سردبیرهای رسانه</h4><p>{row.editors.join("، ") || "سردبیری ثبت نشده است."}</p></section></div>
        </div>
        {pending ? <div className="media-request-review"><div><h4>نتیجهٔ بررسی</h4><p>یادداشت شما برای ادمین رسانه نمایش داده می‌شود. برای رد درخواست، دلیل را بنویسید.</p></div><label htmlFor={`${id}-note`}>یادداشت بررسی<textarea id={`${id}-note`} value={note} onChange={event => setNote(event.target.value)} maxLength={2000} disabled={busy} rows={3} placeholder="نکات تأیید یا دلیل رد درخواست را بنویسید…" aria-describedby={`${id}-help`} /></label><span id={`${id}-help`} className="media-request-note-help">رد درخواست به حداقل ۳ نویسه نیاز دارد.</span><div className="media-request-decision"><button type="button" className="primary-button" disabled={busy} onClick={() => void review("approve", note)}><Check size={16} />تأیید رسانه</button><button type="button" className="secondary-button media-request-reject" disabled={busy || note.trim().length < 3} onClick={() => void review("reject", note)}><X size={16} />رد درخواست</button></div><p className="media-request-effect">با تأیید، دسترسی سایت‌ساز و بررسی درخواست‌های منابع باز می‌شود؛ سایت به‌صورت خودکار ساخته نمی‌شود.</p></div> : <section className="media-request-reviewed"><h4>نتیجهٔ ثبت‌شده</h4><p>زمان بررسی: {requestDate(row.reviewedAt)}</p><p className="media-request-notes">{row.reviewNote || "یادداشتی برای این تصمیم ثبت نشده است."}</p></section>}
      </div>
    </div>
  </article>;
}
