"use client";

import { AlertTriangle, ArrowUpLeft, FileInput, Filter, Inbox, Radio, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import type { InboxWorkspace } from "@/lib/contracts/inbox";

function formatDate(value: string | null) {
  if (!value) return "زمان نامشخص";
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function InboxView({ workspace }: { workspace: InboxWorkspace }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "new" | "quarantined">("all");
  const articles = useMemo(() => workspace.articles.filter((item) => {
    const matchesQuery = !query || item.title.includes(query) || item.sourceName.includes(query);
    const matchesFilter = filter === "all" || item.status === filter;
    return matchesQuery && matchesFilter;
  }), [filter, query, workspace.articles]);

  return (
    <div className="inbox-content">
      <section className="inbox-heading">
        <div><span><i />جریان واقعی ورودی</span><h2>اخبار ورودی</h2><p>خروجی خام و قابل ردیابی منابع، پیش از ورود به میز تحریریه.</p></div>
        <div className="inbox-integrity"><ShieldAlert size={18} /><span><b>محتوا نامطمئن است</b><small>هنوز هیچ متن ورودی به‌عنوان دستور یا خبر تأییدشده استفاده نمی‌شود.</small></span></div>
      </section>

      <section className="inbox-stats">
        <article><Inbox size={19} /><span><small>کل ورودی</small><b>{workspace.stats.total.toLocaleString("fa-IR")}</b></span></article>
        <article><FileInput size={19} /><span><small>خبر تازه</small><b>{workspace.stats.newCount.toLocaleString("fa-IR")}</b></span></article>
        <article><Radio size={19} /><span><small>منبع فعال در خروجی</small><b>{workspace.stats.sources.toLocaleString("fa-IR")}</b></span></article>
        <article className="warning"><AlertTriangle size={19} /><span><small>قرنطینه</small><b>{workspace.stats.quarantined.toLocaleString("fa-IR")}</b></span></article>
      </section>

      <section className="panel inbox-panel">
        <div className="inbox-toolbar">
          <div><span>صف دریافت</span><h2>آخرین خبرها</h2></div>
          <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجو در تیتر یا منبع…" /></label>
          <div className="inbox-filters"><Filter size={14} />{([['all', 'همه'], ['new', 'تازه'], ['quarantined', 'قرنطینه']] as const).map(([value, label]) => <button className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div>
        </div>
        <div className="inbox-table-head"><span>خبر</span><span>منبع</span><span>زمان انتشار</span><span>وضعیت</span><span /></div>
        <div className="inbox-articles">
          {articles.map((item) => (
            <article key={item.id}>
              <div className="inbox-story"><span>{item.sourceName.slice(0, 1)}</span><div><h3>{item.title}</h3><p>{item.summary || "این ورودی خلاصه‌ای از منبع دریافت نکرده است."}</p></div></div>
              <div className="inbox-source"><b>{item.sourceName}</b><small>RSS · Contract v1</small></div>
              <time>{formatDate(item.publishedAt ?? item.ingestedAt)}</time>
              <span className={`inbox-status ${item.status}`}><i />{item.status === "new" ? "تازه" : "قرنطینه"}</span>
              <a href={item.canonicalUrl} target="_blank" rel="noreferrer" aria-label={`مشاهده منبع ${item.title}`}><ArrowUpLeft size={16} /></a>
            </article>
          ))}
          {!articles.length ? <div className="inbox-empty"><Search size={24} /><b>خبری با این فیلتر پیدا نشد</b></div> : null}
        </div>
      </section>
    </div>
  );
}
