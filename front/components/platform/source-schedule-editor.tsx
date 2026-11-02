"use client";
import { useRef, useState, type FormEvent } from "react";
import { Pencil, LoaderCircle } from "lucide-react";
import { apiRequest } from "@/lib/api-client";

export function SourceScheduleEditor({ sourceId, sourceName, minutes, disabled, onSaved }: {
  sourceId: string; sourceName: string; minutes: number; disabled: boolean;
  onSaved: (sourceId: string, minutes: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(minutes));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || disabled) return;
    const value = Number(draft);
    if (!Number.isInteger(value) || value < 5 || value > 1440) { setError("عدد صحیح بین ۵ و ۱۴۴۰ دقیقه وارد کنید."); return; }
    lock.current = true; setPending(true); setError(null);
    try {
      const result = await apiRequest<{ sourceId: string; scheduleMinutes: number }>(`/api/v1/platform/sources/${encodeURIComponent(sourceId)}/schedule`, { scheduleMinutes: value }, "PATCH");
      onSaved(result.sourceId, result.scheduleMinutes); setEditing(false); setSaved(true);
    } catch (error) { setError(error instanceof Error ? error.message : "ذخیرهٔ زمان‌بندی ناموفق بود."); }
    finally { lock.current = false; setPending(false); }
  }
  return <div className="source-schedule-editor">
    {editing ? <form onSubmit={save}>
      <label><span>فاصلهٔ دریافت (دقیقه)</span><input aria-label={`فاصلهٔ دریافت ${sourceName} به دقیقه`} type="number" min={5} max={1440} step={1} required value={draft} onChange={(event) => setDraft(event.target.value)} disabled={pending || disabled} autoFocus /></label>
      <div><button type="submit" disabled={pending || disabled}>{pending && <LoaderCircle size={12} className="spin" />}{pending ? "ذخیره…" : "ذخیره"}</button><button type="button" disabled={pending} onClick={() => { setEditing(false); setError(null); }}>انصراف</button></div>
    </form> : <><small>هر {minutes.toLocaleString("fa-IR")} دقیقه</small><button type="button" disabled={disabled} aria-label={`ویرایش فاصلهٔ دریافت ${sourceName}`} onClick={() => { setDraft(String(minutes)); setSaved(false); setError(null); setEditing(true); }}><Pencil size={12} />ویرایش فاصله</button></>}
    {error && <small className="platform-error" role="alert">{error}</small>}{saved && <small className="platform-success" role="status">ذخیره شد</small>}
  </div>;
}
