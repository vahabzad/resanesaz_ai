"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api-client";
import type { DistributionWorkspace, PublicationRole } from "@/lib/contracts/sites";
import { EditorialDatePicker } from "../editorial/editorial-date-picker";
import { publicationRoleLabels } from "./publication-rules-view";

const statusLabels: Record<string, string> = { queued: "در صف", succeeded: "منتشرشده", failed: "ناموفق", cancelled: "لغوشده" };
export function PublicationComposer({ versionId, revision }: { versionId: string; revision: number }) {
  const [data, setData] = useState<DistributionWorkspace | null>(null); const [siteId, setSiteId] = useState(""); const [role, setRole] = useState<PublicationRole>("primary");
  const [scheduled, setScheduled] = useState(false); const [when, setWhen] = useState(() => new Date(Date.now() + 3600000).toISOString());
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [result, setResult] = useState(""); const [withdrawal, setWithdrawal] = useState<string | null>(null);
  const path = `/api/v1/publications/distribution/${encodeURIComponent(versionId)}`;
  useEffect(() => { let alive = true; async function refresh() { try { const value = await apiRequest<DistributionWorkspace>(path); if (alive) { setData(value); setError(""); } } catch (e) { if (alive) setError(e instanceof Error ? e.message : "دریافت توزیع ناموفق بود."); } } void refresh(); const timer = setInterval(() => void refresh(), 10000); return () => { alive = false; clearInterval(timer); }; }, [path]);
  const selected = data?.sites.find(s => s.id === siteId);
  async function submit(withdraw = false) { if (busy || !data) return; setBusy(true); setError(""); setResult(""); try {
    if (withdraw) {
      const target = data.sites.find(s => s.id === withdrawal); if (!target?.published) return;
      await apiRequest(`/api/v1/sites/${target.id}/stories/${encodeURIComponent(data.storyId)}/withdraw`, { versionId: target.published.versionId }); setWithdrawal(null); setResult("خبر از سایت برداشته شد؛ سابقهٔ انتشار حفظ شد.");
    } else {
      const value = await apiRequest<{ duplicate: boolean }>("/api/v1/publications", { siteId, versionId, role, ...(scheduled ? { scheduledAt: when } : {}) });
      setResult(value.duplicate ? "برای این نسخه و سایت قبلاً درخواست ثبت شده؛ نقش و زمان همان درخواست حفظ شد. برای تغییر زمان یا تلاش مجدد به صف بروید." : "درخواست انتشار ثبت شد. خلاصه و لینک تا موفقیت انتشار اصلی در صف می‌ماند.");
    }
    setData(await apiRequest<DistributionWorkspace>(path));
  } catch (e) { setError(e instanceof Error ? e.message : "عملیات انتشار ناموفق بود."); } finally { setBusy(false); } }
  return <section className="publication-composer"><h3>توزیع نسخهٔ {revision.toLocaleString("fa-IR")}</h3><p className="editorial-help">وضعیت تمام سایت‌های این رسانه و مسیرهای پیشنهادی را ببینید. انتخاب دستی مستقل از قواعد خودکار است.</p>
    {error && <p role="alert" className="editorial-feedback error">{error}</p>}{result && <p role="status" className="editorial-feedback">{result} <Link href="/publishing">مشاهدهٔ صف و قواعد</Link></p>}
    {!data && !error && <p role="status">در حال دریافت مقصدها…</p>}{data && !data.sites.length && <p>ابتدا در <Link href="/sites">سایت‌ها</Link> یک مقصد بسازید و فعال کنید.</p>}
    {data?.sites.map(site => <article className="publication-row" key={site.id}><div><h4>{site.name}</h4><p>{site.published ? `نسخهٔ ${site.published.revision.toLocaleString("fa-IR")} · ${site.published.withdrawn ? "از سایت برداشته‌شده" : "منتشرشده"} · ${publicationRoleLabels[site.published.role]}` : "هنوز منتشر نشده"}</p>{site.job && <small>درخواست این نسخه: {statusLabels[site.job.status]} · {publicationRoleLabels[site.job.role]} · {new Date(site.job.scheduledAt).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })}</small>}<p className="editorial-help">{site.rules.length ? `مسیرهای منطبق: ${site.rules.join("، ")}` : "قاعدهٔ فعالی منطبق نیست؛ انتخاب دستی ممکن است."}</p>{site.reason && <p className="retry-help">{site.reason}</p>}</div><div className="editorial-toolbar"><button className="secondary-button" disabled={busy || Boolean(site.reason)} onClick={() => { setSiteId(site.id); setRole(site.suggestedRole); }}>انتخاب برای انتشار</button>{site.published && !site.published.withdrawn && <button className="secondary-button editorial-stop" disabled={busy} onClick={() => setWithdrawal(site.id)}>برداشتن از سایت</button>}</div></article>)}
    {withdrawal && <div className="editorial-feedback" role="alert"><p>خبر از سایت «{data?.sites.find(s => s.id === withdrawal)?.name}» برداشته می‌شود و کارهای باز همان خبر در این سایت لغو می‌شوند. نسخهٔ تازهٔ تأییدشده ممکن است طبق قواعد دوباره منتشر شود.</p><button className="secondary-button" disabled={busy} onClick={() => setWithdrawal(null)}>انصراف</button><button className="secondary-button editorial-stop" disabled={busy} onClick={() => void submit(true)}>برداشتن خبر</button></div>}
    {selected && <form onSubmit={e => { e.preventDefault(); void submit(); }}><h4>انتشار در {selected.name}</h4><label>نقش انتشار<select disabled={busy} value={role} onChange={e => setRole(e.target.value as PublicationRole)}>{Object.entries(publicationRoleLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><p className="editorial-help">هر خبر یک سایت اصلی دارد. کپی در مقصد دیگر پیش‌فرض noindex است؛ این انتخاب تضمین رتبه یا ایندکس نیست.</p>
      <label>زمان انتشار<select disabled={busy} value={scheduled ? "scheduled" : "now"} onChange={e => setScheduled(e.target.value === "scheduled")}><option value="now">فوری</option><option value="scheduled">در تاریخ و ساعت مشخص</option></select></label>
      {scheduled && <EditorialDatePicker label="تاریخ انتشار" timeLabel="ساعت انتشار (تهران)" value={when} disabled={busy} onChange={setWhen} />}
      <button className="primary-button" disabled={busy || Boolean(selected.reason)}>{busy ? "در حال ثبت…" : "ثبت درخواست انتشار"}</button>
    </form>}
  </section>;
}
