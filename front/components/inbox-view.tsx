"use client";

import { ArrowUpLeft, ChevronLeft, ChevronRight, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { InboxArticle, InboxWorkspace } from "@/lib/contracts/inbox";
import { apiRequest } from "@/lib/api-client";
import { FormSelect } from "./form-select";
import { InboxArticleDialog, inboxDate } from "./inbox-article-dialog";

const initialFilters = { query: "", sourceId: "", category: "", status: "", period: "", sort: "received", page: "1" };
type Filters = typeof initialFilters;

export function InboxView({ workspace, canCreateStory = false }: { workspace: InboxWorkspace; canCreateStory?: boolean }) {
  const [result, setResult] = useState(workspace);
  const [filters, setFilters] = useState(initialFilters);
  const [selected, setSelected] = useState<InboxArticle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const filtered = Boolean(filters.query || filters.sourceId || filters.category || filters.status || filters.period);
  const params = new URLSearchParams(filters).toString();

  useEffect(() => {
    const controller = new AbortController();
    let receiving = false;
    async function receive() {
      if (receiving) return;
      receiving = true;
      try {
        const next = await apiRequest<InboxWorkspace>(`/api/v1/articles?${params}`, undefined, undefined, { signal: controller.signal });
        if (!controller.signal.aborted) { setResult(next); setError(""); setLoading(false); }
      } catch (cause) {
        if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "دریافت خبرها انجام نشد."); setLoading(false); }
      } finally { receiving = false; }
    }
    const debounce = setTimeout(() => void receive(), 300);
    const timer = setInterval(() => void receive(), 30_000);
    return () => { controller.abort(); clearTimeout(debounce); clearInterval(timer); };
  }, [params, revision]);

  function change(key: keyof Filters, value: string) {
    if (filters[key] === value && (key === "page" || filters.page === "1")) return;
    setLoading(true); setError("");
    setFilters(previous => ({ ...previous, [key]: value, ...(key === "page" ? {} : { page: "1" }) }));
  }
  function reset() { setLoading(true); setError(""); setFilters(initialFilters); setRevision(value => value + 1); }
  function refresh() { setLoading(true); setError(""); setRevision(value => value + 1); }

  return <div className="inbox-content inbox-redesign">
    <header className="inbox-page-heading"><div><h2>اخبار ورودی</h2><p>خبرهای منابع خود را پیدا کنید و برای خواندن، روی خبر بزنید.</p></div><button className="secondary-button" onClick={refresh} disabled={loading}><RefreshCw size={15} />به‌روزرسانی</button></header>
    <div className="inbox-overview"><span>کل خبرها <b>{result.stats.total.toLocaleString("fa-IR")}</b></span><span>تازه <b>{result.stats.newCount.toLocaleString("fa-IR")}</b></span><span>قرنطینه <b>{result.stats.quarantined.toLocaleString("fa-IR")}</b></span><span>منابع <b>{result.stats.sources.toLocaleString("fa-IR")}</b></span></div>
    <section className="panel inbox-browser" aria-label="فهرست و فیلتر اخبار">
      <div className="inbox-search-row"><label className="inbox-search"><Search size={18} /><input aria-label="جست‌وجوی خبر" value={filters.query} maxLength={200} onChange={event => change("query", event.target.value)} placeholder="جست‌وجو در تیتر، متن خبر یا نام منبع…" />{filters.query && <button aria-label="پاک‌کردن جست‌وجو" onClick={() => change("query", "")}><X size={16} /></button>}</label><span><SlidersHorizontal size={15} />فیلتر خبرها</span></div>
      <div className="inbox-filter-fields">
        <FormSelect name="inbox-source" label="منبع خبر" value={filters.sourceId} options={[{ value: "", label: "همهٔ منابع" }, ...result.sources.map(item => ({ value: item.id, label: item.name }))]} onChange={value => change("sourceId", value)} />
        <FormSelect name="inbox-category" label="دسته‌بندی خبر" value={filters.category} options={[{ value: "", label: "همهٔ دسته‌ها" }, ...result.categories.map(value => ({ value, label: value }))]} onChange={value => change("category", value)} />
        <FormSelect name="inbox-period" label="بازهٔ دریافت" value={filters.period} options={[{ value: "", label: "همهٔ زمان‌ها" }, { value: "24h", label: "۲۴ ساعت اخیر" }, { value: "7d", label: "۷ روز اخیر" }, { value: "30d", label: "۳۰ روز اخیر" }]} onChange={value => change("period", value)} />
        <FormSelect name="inbox-sort" label="مرتب‌سازی خبرها" value={filters.sort} options={[{ value: "received", label: "جدیدترین دریافت" }, { value: "published", label: "جدیدترین انتشار" }, { value: "oldest", label: "قدیمی‌ترین دریافت" }]} onChange={value => change("sort", value)} />
      </div>
      <div className="inbox-results-toolbar"><div className="inbox-status-tabs" aria-label="وضعیت خبر">{([["", "همه"], ["new", "تازه"], ["quarantined", "قرنطینه"]] as const).map(([value, label]) => <button key={value} aria-pressed={filters.status === value} onClick={() => change("status", value)}>{label}</button>)}</div><div className="inbox-result-count"><span role="status">{loading ? "در حال دریافت…" : error ? "دریافت انجام نشد" : `${result.total.toLocaleString("fa-IR")} خبر${filtered ? " مطابق فیلتر" : ""}`}</span>{filtered && <button onClick={reset}><X size={13} />پاک‌کردن فیلترها</button>}</div></div>
      <div className="inbox-news-list" aria-busy={loading}>
        {error ? <div className="inbox-empty" role="alert"><b>{error}</b><button className="secondary-button" onClick={refresh}>تلاش دوباره</button></div> : loading ? <div className="inbox-empty" role="status">در حال دریافت خبرها…</div> : result.articles.length ? result.articles.map(item => <article key={item.id} className="inbox-news-row">
          <button className="inbox-news-open" onClick={() => setSelected(item)} aria-label={`خواندن خبر: ${item.title}`}>
            <div className="inbox-news-meta"><b>{item.sourceName}</b>{item.categories.slice(0, 2).map(category => <span key={category}>{category}</span>)}<span className={`inbox-news-status ${item.status}`}>{item.status === "new" ? "تازه" : "قرنطینه"}</span></div>
            <h3 dir="auto">{item.title}</h3><p dir="auto">{item.summary || "برای مشاهدهٔ متن دریافت‌شده، خبر را باز کنید."}</p>
            <div className="inbox-news-bottom"><time dateTime={item.publishedAt ?? item.ingestedAt}>{item.publishedAt ? "انتشار" : "دریافت"}: {inboxDate(item.publishedAt ?? item.ingestedAt)}</time><span>خواندن خبر <ChevronLeft size={14} /></span></div>
          </button><a className="inbox-original-link" href={item.canonicalUrl} target="_blank" rel="noreferrer" aria-label={`بازکردن منبع خبر: ${item.title}`} title="بازکردن در منبع"><ArrowUpLeft size={17} /></a>
        </article>) : <div className="inbox-empty"><Search size={25} /><b>{filtered ? "خبری با این فیلترها پیدا نشد" : "هنوز خبری دریافت نشده است"}</b><p>{filtered ? "فیلترها را تغییر دهید یا پاک کنید." : "پس از دریافت از منابع تأییدشده، خبرها اینجا نمایش داده می‌شوند."}</p>{filtered && <button className="secondary-button" onClick={reset}>نمایش همهٔ خبرها</button>}</div>}
      </div>
      <footer className="inbox-pagination"><span>{result.total && !loading && !error ? `${((result.page - 1) * result.pageSize + 1).toLocaleString("fa-IR")} تا ${Math.min(result.page * result.pageSize, result.total).toLocaleString("fa-IR")} از ${result.total.toLocaleString("fa-IR")} خبر` : ""}</span><div><button className="secondary-button" aria-label="صفحهٔ قبل" disabled={loading || Boolean(error) || result.page <= 1} onClick={() => change("page", String(result.page - 1))}><ChevronRight size={15} /></button><span>صفحهٔ {result.page.toLocaleString("fa-IR")} از {result.pageCount.toLocaleString("fa-IR")}</span><button className="secondary-button" aria-label="صفحهٔ بعد" disabled={loading || Boolean(error) || result.page >= result.pageCount} onClick={() => change("page", String(result.page + 1))}><ChevronLeft size={15} /></button></div></footer>
    </section>
    {selected && <InboxArticleDialog key={selected.id} article={selected} canCreateStory={canCreateStory} onClose={() => setSelected(null)} />}
  </div>;
}
