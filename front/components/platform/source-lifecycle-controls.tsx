"use client";
import { useRef, useState } from "react";
import { Trash2, RotateCcw } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import type { PlatformSourcesWorkspace } from "@/lib/contracts/sources";

export function SourceLifecycleControls({ source, disabled, onChanged }: {
  source: PlatformSourcesWorkspace["sources"][number]; disabled: boolean; onChanged: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const mode = !source.mediaDeliveryEnabled ? "media_disabled" : source.visibleToMedia ? "public" : "catalog_hidden";
  async function change(operation: "visibility" | "delete" | "restore", value?: string) {
    if (lock.current || disabled) return;
    if (operation === "delete" && !window.confirm(`کراولر «${source.name}» حذف شود؟ دریافت متوقف و اجراهای باز لغو می‌شوند. اخبار و سابقه حفظ می‌شوند و امکان بازیابی دارید.`)) return;
    lock.current = true; setPending(true); setError(null);
    try {
      const path = `/api/v1/platform/sources/${encodeURIComponent(source.id)}`;
      await apiRequest(operation === "delete" ? path : `${path}/${operation}`, operation === "visibility" ? { mode: value } : operation === "restore" ? {} : undefined, operation === "delete" ? "DELETE" : operation === "visibility" ? "PATCH" : "POST");
      await onChanged();
    } catch (error) { setError(error instanceof Error ? error.message : "عملیات ناموفق بود."); }
    finally { lock.current = false; setPending(false); }
  }
  return <div className="source-lifecycle-controls">
    {source.archivedAt ? <button disabled={disabled || pending} onClick={() => void change("restore")}><RotateCcw size={13} />{pending ? "در حال بازیابی…" : "بازیابی"}</button> : <>
      <label><span>نمایش و دریافت رسانه‌ها</span><select aria-label={`نمایش ${source.name} برای رسانه‌ها`} value={mode} disabled={disabled || pending} onChange={(event) => void change("visibility", event.target.value)}>
        <option value="public">قابل مشاهده و دریافت</option><option value="catalog_hidden">پنهان؛ ادامه برای مشترکان قبلی</option><option value="media_disabled">پنهان؛ قطع دریافت برای همه</option>
      </select></label><button className="platform-error" disabled={disabled || pending} onClick={() => void change("delete")}><Trash2 size={13} />حذف کراولر</button>
    </>}
    {pending && <small role="status">در حال ذخیره…</small>}{error && <small className="platform-error" role="alert">{error}</small>}
  </div>;
}
