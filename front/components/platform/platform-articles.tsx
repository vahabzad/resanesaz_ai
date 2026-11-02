"use client";
import { useEffect, useRef, useState } from "react";
import { FileText, RefreshCw, Search, Trash2 } from "lucide-react";
import type { PlatformContext } from "@/lib/contracts/context";
import type { ArticleDeletionPreview, PlatformArticleFilters, PlatformArticlesWorkspace } from "@/lib/contracts/platform-articles";
import { apiRequest } from "@/lib/api-client";
import { PlatformShell } from "./platform-shell";
import { SourceCatalogPagination } from "./source-catalog-controls";
import { ArticleDeletionDialog } from "./article-deletion-dialog";
import { displayDate } from "./source-catalog";
import { ArticleDetailDialog } from "./article-detail-dialog";

const emptyFilters: PlatformArticleFilters = { query: "", sourceId: "", category: "", status: "" };
export function PlatformArticles({ context, initialWorkspace }: { context: PlatformContext; initialWorkspace: PlatformArticlesWorkspace }) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<ArticleDeletionPreview | null>(null);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ ...filters, page: String(page), pageSize: String(pageSize) });
      try {
        const result = await apiRequest<PlatformArticlesWorkspace>(`/api/v1/platform/articles?${params}`);
        if (active) { setWorkspace(result); setError(null); }
      } catch (error) { if (active) setError(error instanceof Error ? error.message : "دریافت اخبار ناموفق بود."); }
      finally { if (active) setLoading(false); }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [filters, page, pageSize, revision]);
  function changeFilters(next: PlatformArticleFilters) { setFilters(next); setPage(1); setNotice(null); }
  async function reviewDeletion(mode: "all" | "filtered") {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null); setNotice(null);
    try { setPreview(await apiRequest<ArticleDeletionPreview>("/api/v1/platform/articles/delete-preview", { mode, filters })); }
    catch (error) { setError(error instanceof Error ? error.message : "پیش‌نمایش حذف ناموفق بود."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function confirmDeletion() {
    if (!preview || lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const result = await apiRequest<{ deletedArticles: number; deletedInboxItems: number }>("/api/v1/platform/articles/delete", { token: preview.token, confirmed: true });
      setPreview(null); setNotice(`${result.deletedArticles.toLocaleString("fa-IR")} خبر و ${result.deletedInboxItems.toLocaleString("fa-IR")} ورودی صندوق رسانه‌ها حذف شد.`); setRevision((value) => value + 1);
    } catch (error) { setError(error instanceof Error ? error.message : "حذف اخبار ناموفق بود."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <PlatformShell context={context} active="articles" title="اخبار کراول‌شده" actions={<button className="icon-button" disabled={loading || busy} onClick={() => setRevision((value) => value + 1)} aria-label="به‌روزرسانی اخبار"><RefreshCw size={18} /></button>}>
    <div className="platform-content">
      <p className="platform-muted">فهرست سراسری خبرهای دریافت‌شده؛ مدیریت این بخش فقط برای ادمین پلتفرم در دسترس است.</p>
      {error && !preview && <p className="platform-feedback platform-error" role="alert">{error}</p>}{notice && <p className="platform-feedback platform-success" role="status">{notice}</p>}
      <section className="panel" aria-busy={loading}>
        <div className="platform-section-head"><h2>اخبار دریافت‌شده</h2><span>{loading ? "در حال دریافت…" : `${workspace.total.toLocaleString("fa-IR")} خبر مطابق فیلترها`}</span></div>
        <div className="source-catalog-controls">
          <label className="source-catalog-search"><span>جست‌وجوی عنوان</span><div><Search size={16} aria-hidden="true" /><input type="search" placeholder="عنوان خبر…" value={filters.query} onChange={(event) => changeFilters({ ...filters, query: event.target.value })} /></div></label>
          <label><span>منبع</span><select value={filters.sourceId} onChange={(event) => changeFilters({ ...filters, sourceId: event.target.value })}><option value="">همهٔ منابع</option>{workspace.sources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span>دسته‌بندی منبع</span><select value={filters.category} onChange={(event) => changeFilters({ ...filters, category: event.target.value })}><option value="">همهٔ دسته‌بندی‌ها</option>{[...new Set([...workspace.categories, ...(filters.category ? [filters.category] : [])])].map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
          <label><span>وضعیت</span><select value={filters.status} onChange={(event) => changeFilters({ ...filters, status: event.target.value })}><option value="">همهٔ وضعیت‌ها</option><option value="new">جدید</option><option value="quarantined">قرنطینه</option></select></label>
          {Object.values(filters).some(Boolean) && <button type="button" onClick={() => changeFilters(emptyFilters)}>پاک‌کردن فیلترها</button>}
        </div>
        <div className="article-management-actions"><button disabled={busy || loading} onClick={() => void reviewDeletion("filtered")}><Trash2 size={14} />حذف اخبار مطابق فیلترها</button><button disabled={busy || loading} onClick={() => void reviewDeletion("all")}><Trash2 size={14} />حذف تمام اخبار</button><small>قبل از حذف، محدوده و تعداد اخبار را بررسی و تأیید می‌کنید.</small></div>
        {!workspace.articles.length ? <div className="source-empty"><FileText size={28} /><b>خبری در این محدوده پیدا نشد</b><span>فیلترها را تغییر دهید یا دریافت منابع را بررسی کنید.</span></div> : <div className="platform-table-wrap"><table className="platform-table platform-articles-table"><thead><tr><th>خبر</th><th>منبع</th><th>دسته‌بندی</th><th>وضعیت</th><th>انتشار در منبع</th><th>زمان دریافت</th></tr></thead><tbody>
          {workspace.articles.map((article) => <tr key={article.id}><td><button type="button" className="article-title-button" onClick={() => setSelectedArticleId(article.id)}>{article.title}</button><a href={article.canonicalUrl} target="_blank" rel="noreferrer">مشاهده در سایت منبع</a></td><td>{article.sourceName}</td><td>{article.categories.join("، ") || "بدون دسته‌بندی"}</td><td><span className={`platform-status ${article.status === "quarantined" ? "failed" : "active"}`}>{article.status === "quarantined" ? "قرنطینه" : "جدید"}</span>{article.quarantineReason && <small>{article.quarantineReason}</small>}</td><td>{article.publishedAt ? displayDate(article.publishedAt) : "نامشخص"}</td><td>{displayDate(article.ingestedAt)}</td></tr>)}
        </tbody></table></div>}
        {workspace.total > 0 && <SourceCatalogPagination entityLabel="خبر" page={workspace.page} pageCount={workspace.pageCount} pageSize={workspace.pageSize} total={workspace.total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />}
      </section>
    </div>
    {preview && <ArticleDeletionDialog preview={preview} sourceName={workspace.sources.find((item) => item.id === preview.filters.sourceId)?.name ?? preview.filters.sourceId} busy={busy} error={error} onConfirm={() => void confirmDeletion()} onClose={() => { setPreview(null); setError(null); }} />}
    {selectedArticleId && <ArticleDetailDialog key={selectedArticleId} id={selectedArticleId} onClose={() => setSelectedArticleId(null)} />}
  </PlatformShell>;
}
