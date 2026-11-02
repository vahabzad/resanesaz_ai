"use client";
import { useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api-client";
import type { MediaRole } from "@/lib/contracts/context";
import type { MediaSite, SiteWorkspace } from "@/lib/contracts/sites";
import { SiteEditor } from "./site-editor";
import { WorkspaceDialog } from "../workspace-dialog";

export const siteStatusLabels = { draft: "پیش‌نویس", live: "فعال و عمومی", paused: "متوقف", archived: "بایگانی‌شده" };
export function SitesView({ initial, role }: { initial: SiteWorkspace; role: MediaRole }) {
  const [data, setData] = useState(initial); const [editing, setEditing] = useState<MediaSite | "new" | null>(null);
  const [preview, setPreview] = useState<MediaSite | null>(null); const [query, setQuery] = useState(""); const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const canManage = ["owner", "admin", "publisher"].includes(role); const canArchive = ["owner", "admin"].includes(role);
  async function run(action: () => Promise<void>) { if (busy) return; setBusy(true); setError(""); setMessage(""); try { await action(); setData(await apiRequest<SiteWorkspace>("/api/v1/sites")); } catch (e) { setError(e instanceof Error ? e.message : "عملیات سایت ناموفق بود."); } finally { setBusy(false); } }
  const sites = data.sites.filter(site => (showArchived || site.status !== "archived") && `${site.name} ${site.slug}`.includes(query));
  return <div className="inbox-content editorial-workspace sites-workspace">
    <section className="inbox-heading"><div><span>انتشار وب رسانه</span><h2>سایت شما، با خبرهای تأییدشده</h2><p>هویت و بلوک‌های سایت را طراحی کنید، پیش‌نمایش بگیرید و طراحی آماده را فعال کنید.</p></div>{canManage && <button className="primary-button" onClick={() => { setError(""); setEditing("new"); }}>سایت جدید</button>}</section>
    {error && !editing && <p className="editorial-feedback error" role="alert">{error}</p>}{message && <p className="editorial-feedback" role="status">{message}</p>}
    <section className="panel editorial-settings"><div className="editorial-toolbar"><h3>سایت‌های رسانه</h3><input aria-label="جست‌وجوی سایت" placeholder="نام یا شناسهٔ سایت…" value={query} onChange={e => setQuery(e.target.value)} /><label className="editorial-check"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />نمایش بایگانی‌شده‌ها</label><Link className="secondary-button" href="/publishing">صف انتشار</Link></div>
      {!sites.length && <div className="settings-empty"><h4>{data.sites.length ? "سایتی با این فیلتر پیدا نشد." : "نخستین سایت رسانه را بسازید"}</h4><p>ساخت سایت آن را عمومی نمی‌کند؛ ابتدا طراحی و پیش‌نمایش را بررسی کنید.</p></div>}
      {sites.map(site => <article className="site-management-row" key={site.id}><div><div className="editorial-service-heading"><h4>{site.name}</h4><span className={`editorial-service-status ${site.status === "live" ? "active" : "stopped"}`}>{siteStatusLabels[site.status]}</span></div><p dir="ltr">/s/{site.slug}</p><small>{site.spec.layout === "lead" ? "خبر اصلی برجسته" : "شبکهٔ کارت‌ها"} · {site.spec.blocks.length.toLocaleString("fa-IR")} بلوک · نسخهٔ طراحی {site.revision.toLocaleString("fa-IR")}</small>{site.status === "live" && JSON.stringify(site.spec) !== JSON.stringify(site.liveSpec) && <p className="site-draft-note">طراحی ذخیره‌شده هنوز عمومی نشده است؛ پیش‌نمایش را بررسی و «انتشار طراحی» را بزنید.</p>}</div><div className="editorial-toolbar">
        <button className="secondary-button" disabled={busy} onClick={() => setPreview(site)}>پیش‌نمایش</button>{site.status === "live" && <a className="secondary-button" href={`/s/${site.slug}`} target="_blank" rel="noreferrer">مشاهدهٔ سایت</a>}
        {canManage && site.status !== "archived" && <><button className="secondary-button" disabled={busy} onClick={() => { setError(""); setEditing(site); }}>ویرایش طراحی</button><button className="primary-button" disabled={busy} onClick={() => void run(async () => { await apiRequest(`/api/v1/sites/${site.id}/lifecycle`, { expectedRevision: site.revision, action: "activate" }); setMessage("طراحی سایت فعال شد. برای نمایش خبر، نسخهٔ تأییدشده را در صف انتشار ثبت کنید."); })}>{site.status === "live" ? "انتشار طراحی" : "فعال‌سازی سایت"}</button>{site.status === "live" && <button className="secondary-button editorial-stop" disabled={busy} onClick={() => void run(async () => { await apiRequest(`/api/v1/sites/${site.id}/lifecycle`, { expectedRevision: site.revision, action: "pause" }); setMessage("سایت متوقف و کارهای انتشار باز آن لغو شدند."); })}>توقف سایت</button>}</>}
        {canArchive && site.status !== "archived" && <button className="secondary-button editorial-stop" disabled={busy} onClick={() => void run(async () => { await apiRequest(`/api/v1/sites/${site.id}/lifecycle`, { expectedRevision: site.revision, action: "archive" }); })}>بایگانی سایت</button>}
        {canManage && site.status === "archived" && <button className="secondary-button" disabled={busy} onClick={() => void run(async () => { await apiRequest(`/api/v1/sites/${site.id}/lifecycle`, { expectedRevision: site.revision, action: "restore" }); })}>بازیابی به پیش‌نویس</button>}
      </div></article>)}
    </section>
    {editing && <SiteEditor key={editing === "new" ? "new" : `${editing.id}:${editing.revision}`} site={editing === "new" ? undefined : editing} sections={data.sections} busy={busy} error={error} onClose={() => setEditing(null)} onSave={value => void run(async () => { await apiRequest(editing === "new" ? "/api/v1/sites" : `/api/v1/sites/${editing.id}`, editing === "new" ? value : { ...value, expectedRevision: editing.revision }, editing === "new" ? "POST" : "PATCH"); setEditing(null); setMessage("پیش‌نویس سایت ذخیره شد؛ پس از بررسی پیش‌نمایش می‌توانید آن را فعال کنید."); })} />}
    {preview && <WorkspaceDialog title={`پیش‌نمایش ${preview.name}`} context="طراحی ذخیره‌شده · محتوای تأییدشده · عمومی نیست" dirty={false} onClose={() => setPreview(null)}><iframe className="site-preview-frame" title={`پیش‌نمایش سایت ${preview.name}`} sandbox="allow-same-origin" src={`/sites/${preview.id}/preview`} /><p className="editorial-help">پیش‌نمایش، طراحی ذخیره‌شده و خبرهای تأییدشده را نشان می‌دهد. هیچ خبری با پیش‌نمایش منتشر نمی‌شود.</p></WorkspaceDialog>}
  </div>;
}
