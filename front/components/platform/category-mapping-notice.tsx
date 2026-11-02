"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import type { CategoryMappingSummary } from "@/lib/contracts/category-mappings";

export function CategoryMappingNotice() {
  const [count, setCount] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      try { const summary = await apiRequest<CategoryMappingSummary>("/api/v1/platform/category-mappings/summary", undefined, undefined, { signal: controller.signal }); if (!controller.signal.aborted) { setCount(summary.pending); setFailed(false); } }
      catch { if (!controller.signal.aborted) setFailed(true); }
    }
    void refresh(); const timer = setInterval(() => void refresh(), 30000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  return <span className={`category-mapping-nav-count ${count ? "attention" : ""}`} aria-live="polite" title={failed ? "دریافت وضعیت معادل‌سازی ناموفق بود" : "تعداد دسته‌های منابع بدون معادل"}>{failed ? "!" : count === null ? "…" : count.toLocaleString("fa-IR")}</span>;
}
