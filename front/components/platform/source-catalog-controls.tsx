import { socialPlatformKeys, socialPlatformLabels } from "../../lib/contracts/social-platforms";
import { Search } from "lucide-react";

export type CatalogFilters = {
  query: string;
  status: string;
  adapter: string;
  visibility: string;
  showArchived: boolean;
};

export const emptyCatalogFilters: CatalogFilters = {
  query: "", status: "", adapter: "", visibility: "", showArchived: false,
};

export function SourceCatalogControls({ filters, onChange }: {
  filters: CatalogFilters;
  onChange: (filters: CatalogFilters) => void;
}) {
  const hasFilters = Object.values(filters).some(Boolean);
  return <div className="source-catalog-controls">
    <label className="source-catalog-search"><span>جست‌وجوی کراولر</span><div><Search size={16} aria-hidden="true" /><input type="search" placeholder="نام یا آدرس سایت…" value={filters.query} onChange={(event) => onChange({ ...filters, query: event.target.value })} /></div></label>
    <label><span>وضعیت</span><select value={filters.status} onChange={(event) => onChange({ ...filters, status: event.target.value })}>
      <option value="">همهٔ وضعیت‌ها</option><option value="active">فعال</option><option value="degraded">نیازمند بررسی</option><option value="failed">ناموفق</option><option value="paused">متوقف</option><option value="building">در حال ساخت</option><option value="open-run">دارای اجرای باز</option>
    </select></label>
    <label><span>نوع کراولر</span><select value={filters.adapter} onChange={(event) => onChange({ ...filters, adapter: event.target.value })}>
      <option value="">همهٔ انواع</option><option value="web">وب</option><option value="rss">RSS</option>{socialPlatformKeys.map(key => <option key={key} value={key}>{socialPlatformLabels[key]}</option>)}
    </select></label>
    <label><span>دسترسی رسانه‌ها</span><select value={filters.visibility} onChange={(event) => onChange({ ...filters, visibility: event.target.value })}>
      <option value="">همهٔ حالت‌ها</option><option value="public">عمومی</option><option value="catalog-hidden">پنهان از کاتالوگ</option><option value="delivery-disabled">قطع دریافت رسانه‌ها</option>
    </select></label>
    <label className="platform-archive-filter"><input type="checkbox" checked={filters.showArchived} onChange={(event) => onChange({ ...filters, showArchived: event.target.checked })} />نمایش حذف‌شده‌ها</label>
    {hasFilters && <button type="button" onClick={() => onChange(emptyCatalogFilters)}>پاک‌کردن فیلترها</button>}
  </div>;
}

export function SourceCatalogPagination({ page, pageCount, pageSize, total, onPageChange, onPageSizeChange, entityLabel = "کراولر" }: {
  page: number; pageCount: number; pageSize: number; total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  entityLabel?: string;
}) {
  const number = (value: number) => value.toLocaleString("fa-IR");
  return <div className="source-catalog-pagination">
    <span aria-live="polite">نمایش {number((page - 1) * pageSize + 1)} تا {number(Math.min(page * pageSize, total))} از {number(total)} {entityLabel}</span>
    <label>تعداد در صفحه <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>{[10, 20, 50].map((size) => <option key={size} value={size}>{number(size)}</option>)}</select></label>
    <nav aria-label={`صفحه‌بندی ${entityLabel}`}>
      <button type="button" disabled={page === 1} onClick={() => onPageChange(1)}>اول</button>
      <button type="button" disabled={page === 1} onClick={() => onPageChange(page - 1)}>قبلی</button>
      <span>صفحه {number(page)} از {number(pageCount)}</span>
      <button type="button" disabled={page === pageCount} onClick={() => onPageChange(page + 1)}>بعدی</button>
      <button type="button" disabled={page === pageCount} onClick={() => onPageChange(pageCount)}>آخر</button>
    </nav>
  </div>;
}
