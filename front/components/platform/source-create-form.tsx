"use client";
import { useState, type FormEvent } from "react";
import { Plus, LoaderCircle } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { isSocialPlatform, socialPlatformKeys, socialPlatformLabels } from "../../lib/contracts/social-platforms";

const socialExamples: Record<string, string> = {
  telegram: "https://t.me/channel", bale: "https://ble.ir/channel", eitaa: "https://eitaa.com/channel",
  instagram: "https://www.instagram.com/username", x: "https://x.com/username", facebook: "https://www.facebook.com/pagename",
  youtube: "https://www.youtube.com/@channel", tiktok: "https://www.tiktok.com/@username", aparat: "https://www.aparat.com/channel",
  rubika: "https://rubika.ir/channel", rubino: "https://rubino.ir/username", soroush: "https://splus.ir/channel", shad: "https://web.shad.ir/#c=CHANNEL_GUID",
};

export function SourceCreateForm({ onCreated }: { onCreated: (runId: string) => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [adapter, setAdapter] = useState("web");
  const social = isSocialPlatform(adapter);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setPending(true); setError(null); setMessage(null);
    try {
      const result = await apiRequest<{ sourceId: string; runId: string }>("/api/v1/platform/sources", { name: fields.get("name"), url: fields.get("url"), adapterKey: fields.get("adapterKey"), scheduleMinutes: Number(fields.get("scheduleMinutes")) });
      form.reset(); setAdapter("web"); setMessage(social ? "آزمون دریافت با کراولر آمادهٔ پلتفرم در صف قرار گرفت؛ پس از موفقیت، منبع فعال می‌شود." : "ساخت و آزمون کراولر در صف قرار گرفت؛ پس از تأیید نمونه‌ها فعال می‌شود.");
      await onCreated(result.runId);
    } catch (error) { setError(error instanceof Error ? error.message : "ساخت منبع ناموفق بود."); }
    finally { setPending(false); }
  }
  return <section className="panel add-source-card" id="create-source">
    <div className="add-source-icon"><Plus size={19} /></div><span>کاتالوگ سراسری</span><h2>افزودن منبع</h2>
    <p>{social ? "پلتفرم و لینک عمومی کانال یا صفحه را انتخاب کنید. کراولر مرورگری آماده، دریافت را آزمایش می‌کند. برای منابع نیازمند حساب، ورود مرورگری باید روی میزبان انجام شده باشد." : "آدرس سایت یا خوراک RSS را وارد کنید. کراولر ساخته و روی چند خبر آزمایش می‌شود؛ پس از تأیید، منبع برای رسانه‌ها قابل انتخاب است."}</p>
    <form onSubmit={submit}>
      <label><span>نوع منبع</span><select name="adapterKey" value={adapter} onChange={event => setAdapter(event.target.value)} disabled={pending}><option value="web">وب‌سایت — ساخت کراولر</option><option value="rss">خوراک RSS</option><optgroup label="شبکه‌های اجتماعی — کراولر مرورگری آماده">{socialPlatformKeys.map(key => <option key={key} value={key}>{socialPlatformLabels[key]}</option>)}</optgroup></select></label>
      <label><span>نام منبع</span><input name="name" required minLength={2} maxLength={120} placeholder="مثلاً خبرگزاری…" disabled={pending} /></label>
      <label><span>{social ? "لینک عمومی کانال یا صفحه" : "آدرس عمومی HTTPS"}</span><input name="url" type="url" dir="ltr" required maxLength={2048} pattern="https://.*" placeholder={socialExamples[adapter] ?? "https://example.com/news"} disabled={pending} /></label>
      <label><span>فاصلهٔ دریافت (دقیقه)</span><input name="scheduleMinutes" type="number" min={5} max={1440} defaultValue={15} required disabled={pending} /></label>
      <button disabled={pending}>{pending ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}{pending ? "در حال ثبت…" : social ? "افزودن و آزمون دریافت" : "ساخت منبع و کراولر"}</button>
    </form>
    {error && <p role="alert" className="platform-error">{error}</p>}{message && <p role="status" className="platform-success">{message}</p>}
  </section>;
}
