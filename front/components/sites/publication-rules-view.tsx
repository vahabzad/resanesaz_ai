"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import type { PublicationRule, PublicationRuleWorkspace, RulePreview, SiteWorkspace } from "@/lib/contracts/sites";
import { WorkspaceDialog } from "../workspace-dialog";
import { EditorialDatePicker } from "../editorial/editorial-date-picker";

export const publicationRoleLabels = { primary: "انتشار اصلی · قابل ایندکس", republication: "بازنشر متن کامل · خارج از نتایج جست‌وجو", summary: "خلاصه و لینک به اصل · خارج از نتایج جست‌وجو" };
const ruleErrors: Record<string, string> = { ACCESS_REVOKED: "مجوز مالک قاعده تغییر کرده؛ کاربر دارای مجوز، قاعده را دوباره بررسی و ذخیره کند.", SITE_STOPPED: "سایت مقصد فعال نیست؛ قاعده منتظر فعال‌شدن آن است.", SCHEDULING_FAILED: "بعضی خبرها وارد صف نشدند؛ وضعیت سایت، تأیید خبر، ظرفیت صف و نقش اصلی را بررسی کنید." };
const languages = { fa: "فارسی", en: "انگلیسی", ar: "عربی", tr: "ترکی", fr: "فرانسوی", de: "آلمانی", es: "اسپانیایی", ru: "روسی" };

function RuleEditor({ rule, workspace, sites, onClose, onSaved }: { rule?: PublicationRule; workspace: PublicationRuleWorkspace; sites: SiteWorkspace; onClose: () => void; onSaved: () => void }) {
  const [initial] = useState(() => ({ name: rule?.name ?? "", siteId: rule?.siteId ?? sites.sites.find(s => s.status !== "archived")?.id ?? "", enabled: rule?.enabled ?? false,
    settings: rule?.settings ?? { serviceIds: [], sectionIds: [], language: "fa", mode: "manual" as const, role: "primary" as const, approvedSince: new Date().toISOString() }, startNow: !rule }));
  const [draft, setDraft] = useState(initial); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ key: string; data: RulePreview } | null>(null);
  const key = JSON.stringify(draft); const checked = preview?.key === key ? preview.data : null;
  function updateSettings<K extends keyof PublicationRule["settings"]>(name: K, value: PublicationRule["settings"][K]) { setDraft({ ...draft, settings: { ...draft.settings, [name]: value } }); }
  function choices(field: "serviceIds" | "sectionIds", label: string) { return <fieldset><legend>{label}</legend><p className="editorial-help">بدون انتخاب یعنی همه. در هر فهرست یکی از موارد کافی است؛ شرط‌های دو فهرست باید هم‌زمان برقرار باشند.</p><div className="publication-rule-choices">{workspace.services.map(service => <label className="editorial-check" key={service.id}><input type="checkbox" disabled={busy} checked={draft.settings[field].includes(service.id)} onChange={e => updateSettings(field, e.target.checked ? [...draft.settings[field], service.id] : draft.settings[field].filter(id => id !== service.id))} />{service.name}</label>)}</div></fieldset>; }
  async function execute(save: boolean) { if (busy) return; setBusy(true); setError(""); try {
    const body = { ...draft, ...(rule ? { expectedRevision: rule.revision } : {}) };
    if (save) { await apiRequest(rule ? `/api/v1/publication-rules/${rule.id}` : "/api/v1/publication-rules", body, rule ? "PATCH" : "POST"); onSaved(); }
    else { setPreview({ key, data: await apiRequest<RulePreview>("/api/v1/publication-rules/preview", body) }); }
  } catch (e) { setError(e instanceof Error ? e.message : "ثبت قاعده ناموفق بود."); } finally { setBusy(false); } }
  return <WorkspaceDialog title={rule ? `ویرایش ${rule.name}` : "قاعدهٔ انتشار جدید"} context="سرویس تحریریه ← نسخهٔ تأییدشده ← سایت" itemLabel="قاعده" discardHelp="برای حفظ تغییرات به فرم برگردید و قاعده را ذخیره کنید." dirty={key !== JSON.stringify(initial)} busy={busy} error={error} onClose={onClose} footer={close => <><button className="secondary-button" disabled={busy} onClick={close}>انصراف</button><button className="secondary-button" disabled={busy || !draft.siteId || draft.name.trim().length < 2} onClick={() => void execute(false)}>پیش‌نمایش خبرهای واجد شرایط</button><button className="primary-button" disabled={busy || !checked} onClick={() => void execute(true)}>{busy ? "در حال بررسی…" : "ذخیرهٔ قاعده"}</button></>}>
    <div className="publication-rule-form"><label>نام قاعده<input maxLength={100} disabled={busy} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
      <label>سایت مقصد<select disabled={busy || Boolean(rule)} value={draft.siteId} onChange={e => setDraft({ ...draft, siteId: e.target.value })}>{sites.sites.filter(s => s.status !== "archived" || s.id === rule?.siteId).map(s => <option key={s.id} value={s.id}>{s.name}{s.status !== "live" ? " · غیرفعال" : ""}</option>)}</select></label>
      {choices("serviceIds", "از کدام سرویس‌های تحریریه؟")}{choices("sectionIds", "خبر در کدام بخش اصلی یا ثانویه باشد؟")}
      <label>زبان نسخه<select disabled={busy} value={draft.settings.language} onChange={e => updateSettings("language", e.target.value)}>{Object.entries(languages).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>نقش انتشار و سئو<select disabled={busy} value={draft.settings.role} onChange={e => updateSettings("role", e.target.value as PublicationRule["settings"]["role"])}>{Object.entries(publicationRoleLabels).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <p className="editorial-help">هر خبر یک سایت اصلی دارد. خلاصه و لینک تا انتشار موفق اصل منتظر می‌ماند. تغییر لحن به‌تنهایی نسخهٔ مستقل برای سئو نمی‌سازد.</p>
      <label>شیوهٔ انتشار<select disabled={busy} value={draft.settings.mode} onChange={e => updateSettings("mode", e.target.value as "manual" | "automatic")}><option value="manual">پیشنهاد برای انتخاب دستی</option><option value="automatic">خودکار پس از تأیید انسانی</option></select></label>
      <label>شروع بازهٔ تأیید خبر<select disabled={busy} value={draft.startNow ? "now" : "date"} onChange={e => setDraft({ ...draft, startNow: e.target.value === "now" })}><option value="now">فقط تأییدهای پس از ذخیرهٔ این تنظیم</option><option value="date">از تاریخ و ساعت مشخص</option></select></label>
      {!draft.startNow && <EditorialDatePicker label="تأیید خبر از تاریخ" timeLabel="ساعت تأیید (تهران)" value={draft.settings.approvedSince} disabled={busy} onChange={value => updateSettings("approvedSince", value)} />}
      <label className="editorial-check"><input type="checkbox" disabled={busy} checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} />قاعده فعال باشد</label>
      {rule && <p className="editorial-help">ذخیرهٔ تغییر، کارهای خودکارِ باز این قاعده را لغو می‌کند؛ انتشارهای انجام‌شده و درخواست‌های دستی حفظ می‌شوند. کار لغوشده بدون تلاش مجدد صریح برنمی‌گردد.</p>}
      {checked ? <div className="panel" role="status"><strong>{checked.total.toLocaleString("fa-IR")} خبر واجد شرایط · {checked.alreadyRegistered.toLocaleString("fa-IR")} مورد قبلاً ثبت شده</strong><p className="editorial-help">بررسی در {new Date(checked.checkedAt).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })}؛ داده تا زمان ذخیره ممکن است تغییر کند. فقط ۱۰ نمونه نمایش داده می‌شود.</p>{checked.samples.map(sample => <p key={sample.versionId} dir="auto">{sample.title}</p>)}</div> : <p className="editorial-help">پیش از ذخیره، پیش‌نمایش را بررسی کنید. تغییر هر گزینه، پیش‌نمایش قبلی را نامعتبر می‌کند.</p>}
    </div>
  </WorkspaceDialog>;
}

export function PublicationRulesView({ sites, canManage }: { sites: SiteWorkspace; canManage: boolean }) {
  const [data, setData] = useState<PublicationRuleWorkspace | null>(null); const [editing, setEditing] = useState<PublicationRule | "new" | null>(null);
  const [error, setError] = useState(""); const [query, setQuery] = useState(""); const [page, setPage] = useState(1);
  async function refresh() { try { setData(await apiRequest<PublicationRuleWorkspace>("/api/v1/publication-rules")); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "دریافت قواعد ناموفق بود."); } }
  useEffect(() => { let alive = true; apiRequest<PublicationRuleWorkspace>("/api/v1/publication-rules").then(result => { if (alive) setData(result); }).catch(e => { if (alive) setError(e instanceof Error ? e.message : "دریافت قواعد ناموفق بود."); }); return () => { alive = false; }; }, []);
  const rows = data?.rules.filter(rule => `${rule.name} ${sites.sites.find(s => s.id === rule.siteId)?.name ?? ""}`.includes(query)) ?? [];
  const pages = Math.max(1, Math.ceil(rows.length / 10)); const current = Math.min(page, pages);
  return <div className="inbox-content editorial-workspace"><section className="inbox-heading"><div><span>مسیر توزیع خبر</span><h2>چه خبری، از کدام سردبیر، به کدام سایت؟</h2><p>هر سایت می‌تواند خروجی چند سرویس را بگیرد. اتصال بات‌ها در مرحلهٔ انتشار اجتماعی اضافه می‌شود.</p></div>{canManage && <button className="primary-button" disabled={!data || !sites.sites.some(s => s.status !== "archived")} onClick={() => setEditing("new")}>قاعدهٔ جدید</button>}</section>
    {error && <p role="alert" className="editorial-feedback error">{error} <button className="secondary-button" onClick={() => void refresh()}>دریافت دوباره</button></p>}
    <section className="panel editorial-settings"><div className="editorial-toolbar"><h3>قواعد انتشار سایت‌ها</h3><input aria-label="جست‌وجوی قواعد انتشار" placeholder="نام قاعده یا سایت…" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></div>
      {!data && !error && <p role="status">در حال دریافت قواعد…</p>}{data && !rows.length && <p className="settings-empty">قاعده‌ای با این مشخصات وجود ندارد. ابتدا سایت بسازید، سپس مسیر دریافت محتوای آن را تعیین کنید.</p>}
      {rows.slice((current - 1) * 10, current * 10).map(rule => <article className="publication-row" key={rule.id}><div><h4>{rule.name}</h4><p>{sites.sites.find(s => s.id === rule.siteId)?.name ?? "سایت"} · {rule.enabled ? "فعال" : "متوقف"} · {rule.settings.mode === "automatic" ? "خودکار پس از تأیید" : "پیشنهاد دستی"}</p><small>{publicationRoleLabels[rule.settings.role]} · تأیید از {new Date(rule.settings.approvedSince).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })}</small><p className="editorial-help">سرویس‌ها: {rule.settings.serviceIds.length ? rule.settings.serviceIds.map(id => data?.services.find(s => s.id === id)?.name ?? "سرویس بایگانی‌شده").join("، ") : "همه"} · زبان: {languages[rule.settings.language as keyof typeof languages]}</p>{rule.lastErrorCode && <p className="publication-error">{ruleErrors[rule.lastErrorCode] ?? "قاعده نیازمند بررسی است."}</p>}</div>{canManage && <button className="secondary-button" onClick={() => setEditing(rule)}>تنظیم / توقف قاعده</button>}</article>)}
      <nav className="editorial-toolbar" aria-label="صفحه‌بندی قواعد"><span>{rows.length.toLocaleString("fa-IR")} قاعده · {current.toLocaleString("fa-IR")} از {pages.toLocaleString("fa-IR")}</span><button className="secondary-button" disabled={current <= 1} onClick={() => setPage(current - 1)}>قبلی</button><button className="secondary-button" disabled={current >= pages} onClick={() => setPage(current + 1)}>بعدی</button></nav>
    </section>{editing && data && <RuleEditor key={editing === "new" ? "new" : `${editing.id}:${editing.revision}`} rule={editing === "new" ? undefined : editing} workspace={data} sites={sites} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void refresh(); }} />}
  </div>;
}
