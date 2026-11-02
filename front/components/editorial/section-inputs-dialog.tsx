"use client";

import { useState } from "react";
import { WorkspaceDialog } from "../workspace-dialog";

export type SectionCandidate = { id: string; title: string; sourceName: string; categories: string[] };

export function SectionInputsDialog({ name, candidates, busy, stopped, canCreate, error, message, onClose, onRefresh, onCreate, onQueue }: {
  name: string; candidates: SectionCandidate[]; busy: boolean; stopped: boolean; canCreate: boolean; error: string; message: string;
  onClose: () => void; onRefresh: () => void; onCreate: (id: string) => void; onQueue: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const matches = candidates.filter(item => `${item.title} ${item.sourceName} ${item.categories.join(" ")}`.includes(query.trim()));
  const pages = Math.max(1, Math.ceil(matches.length / 10));
  const current = Math.min(page, pages);
  return <WorkspaceDialog title={`ورودی ${name}`} context="میز تحریریه · انتخاب خبر" dirty={false} busy={busy} error={error} message={message} onClose={onClose}>
    <section className="panel editorial-settings">
      <div className="editorial-toolbar"><label>جست‌وجوی خبر ورودی<input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label><button type="button" className="secondary-button" disabled={busy} onClick={onRefresh}>تازه‌سازی ورودی‌ها</button></div>
      <p className="editorial-help">حداکثر ۵۰ خبر سالم اخیر منطبق با منابع و دسته‌بندی‌های سرویس. انتخاب دستی به نقطهٔ شروع خودکار محدود نیست.</p>
      {stopped && <p className="editorial-feedback">سرویس متوقف است؛ برای ساخت پیش‌نویس یا افزودن به صف ابتدا سرویس را فعال کنید.</p>}
      {matches.slice((current - 1) * 10, current * 10).map(item => <article className="editorial-candidate" key={item.id}><div><b dir="auto">{item.title}</b><small>{item.sourceName} · {item.categories.join("، ") || "بدون دسته‌بندی"}</small></div><div className="editorial-toolbar"><button type="button" className="secondary-button" disabled={busy || stopped || !canCreate} onClick={() => onCreate(item.id)}>پیش‌نویس دستی</button><button type="button" className="primary-button" disabled={busy || stopped || !canCreate} onClick={() => onQueue(item.id)}>صف تحریر با Codex</button></div></article>)}
      {!matches.length && <p className="settings-empty">{query ? "خبری با این جست‌وجو پیدا نشد." : "خبر سالمی با ورودی این سرویس در صندوق رسانه نیست."}</p>}
      <nav className="editorial-toolbar" aria-label="صفحه‌بندی ورودی سرویس"><span>{matches.length.toLocaleString("fa-IR")} خبر · صفحهٔ {current.toLocaleString("fa-IR")} از {pages.toLocaleString("fa-IR")}</span><button type="button" className="secondary-button" disabled={busy || current === 1} onClick={() => setPage(current - 1)}>قبلی</button><button type="button" className="secondary-button" disabled={busy || current === pages} onClick={() => setPage(current + 1)}>بعدی</button></nav>
    </section>
  </WorkspaceDialog>;
}
