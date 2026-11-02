"use client";
import { useState, type FormEvent } from "react";
import { Plus, LoaderCircle } from "lucide-react";
import { apiRequest } from "@/lib/api-client";

export function SourceCreateForm({ onCreated }: { onCreated: (runId: string) => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setPending(true); setError(null); setMessage(null);
    try {
      const result = await apiRequest<{ sourceId: string; runId: string }>("/api/v1/platform/sources", { name: fields.get("name"), url: fields.get("url"), adapterKey: fields.get("adapterKey"), scheduleMinutes: Number(fields.get("scheduleMinutes")) });
      form.reset(); setMessage("ساخت و آزمون کراولر در صف قرار گرفت؛ پس از تأیید نمونه‌ها فعال می‌شود.");
      await onCreated(result.runId);
    } catch (error) { setError(error instanceof Error ? error.message : "ساخت منبع ناموفق بود."); }
    finally { setPending(false); }
  }
  return <section className="panel add-source-card" id="create-source">
    <div className="add-source-icon"><Plus size={19} /></div><span>کاتالوگ سراسری</span><h2>ساخت منبع و کراولر</h2>
    <p>آدرس سایت یا خوراک RSS را وارد کنید. کراولر ساخته و روی چند خبر آزمایش می‌شود؛ پس از تأیید، منبع برای رسانه‌ها قابل انتخاب است.</p>
    <form onSubmit={submit}>
      <label><span>نام منبع</span><input name="name" required minLength={2} maxLength={120} placeholder="مثلاً خبرگزاری…" disabled={pending} /></label>
      <label><span>آدرس عمومی HTTPS</span><input name="url" type="url" dir="ltr" required maxLength={2048} pattern="https://.*" placeholder="https://example.com/news" disabled={pending} /></label>
      <label><span>نوع کراولر</span><select name="adapterKey" disabled={pending}><option value="web">وب — استخراج HTML / JSON-LD</option><option value="rss">خوراک RSS</option></select></label>
      <label><span>فاصلهٔ دریافت (دقیقه)</span><input name="scheduleMinutes" type="number" min={5} max={1440} defaultValue={15} required disabled={pending} /></label>
      <button disabled={pending}>{pending ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}{pending ? "در حال ساخت…" : "ساخت منبع و کراولر"}</button>
    </form>
    {error && <p role="alert" className="platform-error">{error}</p>}{message && <p role="status" className="platform-success">{message}</p>}
  </section>;
}
