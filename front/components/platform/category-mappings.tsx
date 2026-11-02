"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { RefreshCw, Search } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import type { CategoryMappingWorkspace } from "@/lib/contracts/category-mappings";
import { CategoryMappingRow } from "./category-mapping-row";

type Filters = { status: "pending" | "mapped" | "all"; q: string; page: number };
export function CategoryMappings({ initialWorkspace }: { initialWorkspace: CategoryMappingWorkspace }) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [filters, setFilters] = useState<Filters>({ status: "pending", q: "", page: 1 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const latest = useRef(filters);
  useEffect(() => { latest.current = filters; }, [filters]);
  const load = useCallback(async (next = latest.current) => {
    const request = ++sequence.current; setLoading(true); setError("");
    try {
      const result = await apiRequest<CategoryMappingWorkspace>(`/api/v1/platform/category-mappings?${new URLSearchParams({ status: next.status, q: next.q, page: String(next.page) })}`);
      if (request === sequence.current) { setWorkspace(result); setFilters(next); }
    } catch (cause) { if (request === sequence.current) setError(cause instanceof Error ? cause.message : "دریافت معادل‌سازی‌ها انجام نشد."); throw cause; }
    finally { if (request === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => { const timer = setInterval(() => { if (!saving) void load().catch(() => {}); }, 30000); return () => clearInterval(timer); }, [saving, load]);
  function submitSearch(event: FormEvent) { event.preventDefault(); void load({ ...filters, q: search.trim(), page: 1 }).catch(() => {}); }
  return <div className="platform-content category-mappings-workspace">
    <section className="panel category-mappings-intro"><div><h2>دسته‌های منابع را به دسته‌های مشترک وصل کنید</h2><p>هر دستهٔ سایت مرجع یک‌بار معادل‌سازی می‌شود و روی خبرهای موجود و بعدی همان منبع اعمال می‌شود. وضعیت خود خبرها تغییر نمی‌کند.</p></div><div className={`category-mapping-notification ${workspace.summary.pending ? "attention" : ""}`} role="status"><b>{workspace.summary.pending.toLocaleString("fa-IR")}</b><span>دستهٔ منبع بدون معادل</span></div></section>
    <section className="panel category-mappings-panel"><div className="category-mapping-toolbar"><div className="category-mapping-tabs" aria-label="وضعیت معادل‌سازی">{([ ["pending", "بدون معادل", workspace.summary.pending], ["mapped", "معادل‌سازی‌شده", workspace.summary.mapped], ["all", "همه", workspace.summary.total] ] as const).map(([status, label, count]) => <button type="button" key={status} disabled={loading || saving} aria-pressed={filters.status === status} className={filters.status === status ? "active" : ""} onClick={() => void load({ ...filters, status, page: 1 }).catch(() => {})}>{label}<span>{count.toLocaleString("fa-IR")}</span></button>)}</div><button type="button" className="secondary-button" disabled={loading || saving} onClick={() => void load().catch(() => {})}><RefreshCw size={14} />تازه‌سازی</button></div>
      <form className="category-mapping-search" onSubmit={submitSearch}><label><Search size={15} /><input aria-label="جست‌وجوی منبع یا دسته" value={search} onChange={event => setSearch(event.target.value)} placeholder="نام منبع، دستهٔ مرجع یا دستهٔ پلتفرم…" maxLength={200} /></label><button className="secondary-button" disabled={loading || saving}>جست‌وجو</button></form>
      {error && <p className="editorial-feedback error" role="alert">{error}</p>}
      <div aria-busy={loading} className="category-mapping-rows">{!workspace.rows.length ? <p className="category-mapping-empty">{filters.q ? "نتیجه‌ای برای این جست‌وجو پیدا نشد." : filters.status === "pending" ? "دستهٔ بدون معادلی وجود ندارد؛ دسته‌های تازه پس از کراول در این فهرست ظاهر می‌شوند." : "معادل‌سازی‌ای در این بخش وجود ندارد."}</p> : workspace.rows.map(row => <CategoryMappingRow key={`${row.id}-${row.revision}`} row={row} categories={workspace.categories} disabled={loading || saving} onSaving={setSaving} onSaved={() => load()} />)}</div>
      <footer className="category-mapping-pagination"><span>{workspace.total.toLocaleString("fa-IR")} دسته · صفحهٔ {workspace.page.toLocaleString("fa-IR")} از {workspace.pageCount.toLocaleString("fa-IR")}</span><div><button type="button" className="secondary-button" disabled={loading || saving || workspace.page <= 1} onClick={() => void load({ ...filters, page: workspace.page - 1 }).catch(() => {})}>قبلی</button><button type="button" className="secondary-button" disabled={loading || saving || workspace.page >= workspace.pageCount} onClick={() => void load({ ...filters, page: workspace.page + 1 }).catch(() => {})}>بعدی</button></div></footer>
    </section>
  </div>;
}
