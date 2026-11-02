"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PublicationComposer } from "../sites/publication-composer";
import { WorkspaceTabs, useEditorialTab } from "./workspace-tabs";
import { EditorialStoryList } from "./story-list";
import { VersionDiff } from "./version-diff";
import { StorySources } from "./story-sources";
import { RenditionPreview } from "./rendition-preview";
import { EditorialQueueView } from "./editorial-queue";
import { defaultSocialOutput, socialOutputFormats, editorialLanguages } from "@/lib/contracts/editorial-settings";
import { SectionManager } from "./section-manager";
import { WorkspaceDialog } from "../workspace-dialog";
import { apiRequest } from "@/lib/api-client";
import type { MediaRole } from "@/lib/contracts/context";
import type { EditorialDetail, EditorialRenditions, EditorialStatus, EditorialVersion, EditorialWorkspace } from "@/lib/contracts/editorial";

const labels: Record<EditorialStatus, string> = { ready: "تحریرشده؛ نیازمند تأیید", draft: "پیش‌نویس", approved: "تأییدشده", rejected: "ردشده", changes_requested: "نیازمند اصلاح" };
const date = (value: string) => new Date(value).toLocaleString("fa-IR");

function PolicySnapshot({ policy }: { policy?: EditorialWorkspace["policies"][number] }) {
  if (!policy) return <p>سیاست در دسترس نیست.</p>;
  const snapshot = policy.settingsSnapshot;
  return <div><p className="editorial-body">{policy.instructions}</p>{snapshot && <><p>تنظیمات ادمین: نسخهٔ {snapshot.platformRevision} · سرویس {snapshot.sectionName}: نسخهٔ {snapshot.sectionRevision}</p><p>زبان خروجی: {editorialLanguages[snapshot.settings.language ?? "fa"]}</p><p>پست اجتماعی: {socialOutputFormats[(snapshot.settings.socialOutput ?? defaultSocialOutput).format]} · سقف {(snapshot.settings.socialOutput ?? defaultSocialOutput).maxLength.toLocaleString("fa-IR")} نویسه · {(snapshot.settings.socialOutput ?? defaultSocialOutput).includeImage ? "همراه تصویر" : "بدون تصویر"}</p><p>جهت: {snapshot.faction?.name ?? "بدون جهت"} · شدت {snapshot.settings.viewpointStrength}٪ · طنز {snapshot.settings.humor}٪ · رسمیت {snapshot.settings.formality}٪</p>{snapshot.faction && <p className="editorial-body">{snapshot.faction.viewpoint}</p>}</>}</div>;
}

export function EditorialView({ workspace, role, rawArticleId, readyOnly = false }: { readyOnly?: boolean; workspace: EditorialWorkspace; role: MediaRole; rawArticleId?: string }) {
  const { active: activeTab, change: changeTab } = useEditorialTab();
  const [queueCounts, setQueueCounts] = useState<{ status: string; count: number }[] | null>(null);
  const [data, setData] = useState(workspace);
  const [detail, setDetail] = useState<EditorialDetail | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [loadingStory, setLoadingStory] = useState(false);
  const detailRequest = useRef(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [selectedVersion, setSelectedVersion] = useState(0);
  const [editorReset, setEditorReset] = useState(0);
  const [compareRevision, setCompareRevision] = useState(0);
  const [listQuery, setListQuery] = useState("");
  const [sectionId, setSectionId] = useState(workspace.sections.find(s => !s.archived && !s.paused)?.id ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pendingRawId, setPendingRawId] = useState(rawArticleId);
  useEffect(() => {
    if (!workspaceOpen && !busy && returnFocus.current) {
      returnFocus.current.focus({ preventScroll: true });
      returnFocus.current = null;
    }
  }, [workspaceOpen, busy]);
  const canEdit = ["owner", "admin", "editor", "journalist"].includes(role);
  const canApprove = ["owner", "admin", "editor"].includes(role);
  const canConfigure = ["owner", "admin", "editor"].includes(role);
  async function open(id: string) {
    if (!workspaceOpen) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const request = ++detailRequest.current;
    setWorkspaceOpen(true); setLoadingStory(true);
    if (detail?.story.id !== id) setDetail(null);
    try {
      const result = await apiRequest<EditorialDetail>(`/api/v1/editorial/stories/${encodeURIComponent(id)}`);
      if (request !== detailRequest.current) return;
      setDetail(result); setSelectedVersion(result.story.revision); setCompareRevision(0); setNote(""); setDirty(false);
    } finally {
      if (request === detailRequest.current) setLoadingStory(false);
    }
  }
  function closeWorkspace() {
    detailRequest.current += 1;
    setWorkspaceOpen(false); setDetail(null); setDirty(false); setNote(""); setLoadingStory(false);
  }
  async function run(action: () => Promise<void>, nextQuery?: string) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try { await action(); const query = nextQuery ?? listQuery; if (nextQuery !== undefined) setListQuery(nextQuery); setData(await apiRequest<EditorialWorkspace>(`/api/v1/editorial${readyOnly ? "?view=ready" + (query ? "&" + query : "") : query ? "?" + query : ""}`)); }
    catch (e) { setError(e instanceof Error ? e.message : "عملیات ناموفق بود."); }
    finally { setBusy(false); }
  }
  const version = detail?.versions.find(v => v.revision === selectedVersion);
  const comparison = detail?.versions.find(v => v.revision === compareRevision);
  return <div className="inbox-content editorial-workspace">
    <section className="inbox-heading"><div><span>تحریریهٔ رسانه</span><h2>{readyOnly ? "مخزن آمادهٔ انتشار" : "از خبر خام تا نسخهٔ تأییدشده"}</h2><p>{readyOnly ? "خروجی‌های تحریرشده را بخوانید و بررسی کنید؛ تنها نسخهٔ تأییدشده آمادهٔ انتشار است." : "سرویس‌ها، زبان خروجی و صف تولید خبر را مدیریت کنید؛ هر نسخه برای انتشار به تأیید سردبیر نیاز دارد."}</p></div><Link className="secondary-button" href={readyOnly ? "/editorial" : "/inbox"}>{readyOnly ? "رفتن به میز تحریریه" : "انتخاب خبر از صندوق"}</Link></section>
    {!workspaceOpen && error && <p className="editorial-feedback error" role="alert">{error}</p>}
    {!workspaceOpen && message && <p className="editorial-feedback" role="status">{message}</p>}
    {!readyOnly && <WorkspaceTabs active={activeTab} change={changeTab} openCount={queueCounts ? queueCounts.filter(c => ["queued", "running"].includes(c.status)).reduce((sum, c) => sum + c.count, 0) : null} failedCount={queueCounts ? queueCounts.find(c => c.status === "failed")?.count ?? 0 : null} serviceCount={data.sections.filter(s => !s.archived).length} />}
    {!readyOnly && <SectionManager active={activeTab === "services"} workspace={data} canManage={canConfigure} canCreate={canEdit} busy={busy || dirty} error={error} message={message} clearFeedback={() => { setError(""); setMessage(""); }} run={run} onCreate={async (rawArticleId, selectedSectionId) => { const result = await apiRequest<{ id: string }>("/api/v1/editorial/stories", { rawArticleId, sectionId: selectedSectionId }); await open(result.id); setMessage("خبر وارد تحریریه شد."); }} onQueue={async (rawArticleId, selectedSectionId) => { await apiRequest("/api/v1/editorial/jobs", { rawArticleId, sectionId: selectedSectionId }); setMessage("خبر در صف تحریر با Codex ثبت شد."); }} />}
    {!readyOnly && <div id="editorial-panel-queue" role="tabpanel" aria-labelledby="editorial-tab-queue" className="editorial-tab-panel" hidden={activeTab !== "queue"}><EditorialQueueView onCounts={setQueueCounts} refreshKey={data.sections.map(s => `${s.id}:${s.revision}`).join(",")} canManage={canConfigure} open={id => dirty ? Promise.resolve() : run(() => open(id))} /></div>}
    {pendingRawId && canEdit && <section className="panel editorial-settings"><h3>ورود خبر انتخاب‌شده به تحریریه</h3><p>متن، تصویر و مرجع خبر از صندوق همین رسانه دریافت و نگهداری می‌شود.</p><label>سرویس اصلی<select value={sectionId} onChange={e => setSectionId(e.target.value)}><option value="">انتخاب سرویس</option>{data.sections.filter(s => !s.archived && !s.paused).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><button className="primary-button" disabled={busy || !sectionId} onClick={() => void run(async () => { const result = await apiRequest<{ id: string }>("/api/v1/editorial/stories", { rawArticleId: pendingRawId, sectionId }); await open(result.id); setPendingRawId(undefined); setMessage("خبر وارد تحریریه شد."); })}>ساخت پیش‌نویس</button></section>}
    <div id={readyOnly ? undefined : "editorial-panel-stories"} role={readyOnly ? undefined : "tabpanel"} aria-labelledby={readyOnly ? undefined : "editorial-tab-stories"} className="editorial-tab-panel" hidden={!readyOnly && activeTab !== "stories"}><EditorialStoryList data={data} readyOnly={readyOnly} busy={busy || dirty} search={query => run(async () => {}, query)} open={id => dirty ? Promise.resolve() : run(() => open(id))} /></div>
    {workspaceOpen && <WorkspaceDialog title={version?.title ?? "بررسی و ویرایش خبر"} context={`${readyOnly ? "آمادهٔ انتشار" : "میز تحریریه"}${detail ? ` · ${labels[detail.story.status]} · نسخهٔ ${selectedVersion.toLocaleString("fa-IR")}` : ""}`} loading={loadingStory} busy={busy} dirty={dirty || Boolean(note.trim())} error={error} message={message} onClose={closeWorkspace}>
    {dirty && <p role="status" className="editorial-feedback">ویرایش ذخیره‌نشده دارید. <button className="secondary-button" disabled={busy} onClick={()=>{setEditorReset(n=>n+1);setDirty(false);}}>بازگرداندن نسخهٔ ذخیره‌شده</button></p>}
    {detail && version && <section className="panel editorial-settings"><div className="editorial-toolbar story-version-toolbar"><label>نسخه<select disabled={dirty || busy} value={selectedVersion} onChange={e => { setSelectedVersion(Number(e.target.value)); setDirty(false); }}>{detail.versions.map(v => <option key={v.id} value={v.revision}>نسخهٔ {v.revision} · {date(v.createdAt)}</option>)}</select></label><label>مقایسه با<select value={compareRevision} onChange={e => setCompareRevision(Number(e.target.value))}><option value={0}>بدون مقایسه</option>{detail.versions.filter(v => v.revision !== selectedVersion).map(v => <option key={v.id} value={v.revision}>نسخهٔ {v.revision}</option>)}</select></label></div>
      {comparison && <VersionDiff before={comparison} after={version} />}
      <div className={comparison ? "editorial-compare" : ""}>
        <VersionEditor key={`${version.id}:${editorReset}`} version={version} policies={detail.policies} sections={data.sections} editable={canEdit && version.revision === detail.story.revision && !data.sections.find(s => s.id === version.sectionId)?.paused && !data.sections.find(s => s.id === version.sectionId)?.archived} onDirty={setDirty} busy={busy} save={value => run(async () => { await apiRequest(`/api/v1/editorial/stories/${detail.story.id}/versions`, { ...value, expectedRevision: detail.story.revision }); await open(detail.story.id); setMessage("نسخهٔ جدید ثبت شد و به بررسی دوباره نیاز دارد."); })} />
        {comparison && <VersionEditor key={comparison.id} version={comparison} policies={detail.policies} sections={data.sections} editable={false} busy={busy} />}
      </div>
      <StorySources key={version.id} detail={detail} version={version} busy={busy || dirty} editable={canEdit && version.revision === detail.story.revision && !data.sections.find(s=>s.id===version.sectionId)?.paused && !data.sections.find(s=>s.id===version.sectionId)?.archived} run={run} change={body=>run(async()=>{ await apiRequest(`/api/v1/editorial/stories/${detail.story.id}/sources`, {...body,expectedRevision:detail.story.revision}); await open(detail.story.id); setMessage("منابع در نسخهٔ تازه ثبت شدند؛ متن و خروجی‌ها را بازبینی و دوباره تأیید کنید."); })} />
      {canApprove && version.revision === detail.story.revision && ["draft", "ready"].includes(detail.story.status) && <div className="editorial-decision">{dirty && <p role="status">ابتدا ویرایش‌ها را به‌عنوان نسخهٔ جدید ذخیره کنید.</p>}<label>توضیح تصمیم<textarea rows={2} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label><div>{(["approved", "changes_requested", "rejected"] as const).map(decision => <button className={decision === "approved" ? "primary-button" : "secondary-button"} key={decision} disabled={busy || dirty || (decision !== "approved" && !note.trim())} onClick={() => void run(async () => { await apiRequest(`/api/v1/editorial/stories/${detail.story.id}/decisions`, { expectedRevision: detail.story.revision, decision, note }); await open(detail.story.id); setMessage("تصمیم برای همین نسخه ثبت شد."); })}>{decision === "approved" ? "تأیید برای انتشار" : decision === "rejected" ? "رد خبر" : "درخواست اصلاح"}</button>)}</div></div>}
      {["owner", "admin", "editor", "publisher"].includes(role) && detail.story.status === "approved" && version.revision === detail.story.revision && <PublicationComposer key={version.id} versionId={version.id} revision={version.revision} />}
      <details className="editorial-provenance"><summary>متن اصلی و مرجع خبر</summary>{detail.sources.filter(s => version.sourceIds.includes(s.id)).map(s => <article key={s.id}><h4>{s.snapshot.title}</h4><p>{s.snapshot.sourceName} · {s.rawArticleId ? "خبر خام موجود است" : "خبر خام حذف شده؛ سابقه حفظ شده است"}</p>{/^https?:\/\//i.test(s.snapshot.url) && <a href={s.snapshot.url} target="_blank" rel="noreferrer">مشاهده منبع</a>}<p dir="auto" className="editorial-body">{s.snapshot.content}</p></article>)}</details>
      <details className="editorial-provenance"><summary>سابقهٔ تصمیم‌ها ({detail.approvals.length.toLocaleString("fa-IR")})</summary>{detail.approvals.map(a => <p key={a.id}>{labels[a.decision]} · نسخهٔ {detail.versions.find(v => v.id === a.versionId)?.revision} · {date(a.createdAt)} · کاربر {a.actorUserId ?? "حذف‌شده"}<br />{a.note}</p>)}</details>
    </section>}
    {!loadingStory && !detail && !error && <p className="editorial-help">متن خبر در دسترس نیست؛ به فهرست برگردید و دوباره تلاش کنید.</p>}
    </WorkspaceDialog>}
  </div>;
}

function VersionEditor({ version, sections, policies, editable, busy, save, onDirty }: { version: EditorialVersion; sections: EditorialWorkspace["sections"]; policies: EditorialWorkspace["policies"]; editable: boolean; busy: boolean; onDirty?: (dirty: boolean) => void; save?: (value: { title: string; lead: string; body: string; sectionId: string; secondarySectionIds: string[]; renditions?: Pick<EditorialRenditions,"social"|"webCard"> }) => Promise<void> }) {
  const [title, setTitle] = useState(version.title);
  const [lead, setLead] = useState(version.lead);
  const [body, setBody] = useState(version.body);
  const [sectionId, setSectionId] = useState(version.sectionId);
  const [secondarySectionIds,setSecondary] = useState(version.secondarySectionIds);
  const [renditions,setRenditions] = useState(version.renditions);
  const [deriveAgain,setDeriveAgain] = useState(false);
  return <form className="editorial-version" onSubmit={e => { e.preventDefault(); void save?.({ title, lead, body, sectionId, secondarySectionIds, renditions: deriveAgain ? undefined : { social:renditions.social, webCard:renditions.webCard } }); }}>
    <p>نسخهٔ {version.revision.toLocaleString("fa-IR")} · {date(version.createdAt)} · عامل: {version.actorUserId ?? "کاربر حذف‌شده"}</p>
    <label>عنوان<input dir="auto" readOnly={!editable} required minLength={3} maxLength={500} value={title} onChange={e => { setTitle(e.target.value); onDirty?.(true); }} /></label>
    <label>لید<textarea dir="auto" readOnly={!editable} rows={3} maxLength={4000} value={lead} onChange={e => { setLead(e.target.value); onDirty?.(true); }} /></label>
    <label>متن کامل<textarea dir="auto" readOnly={!editable} required minLength={80} maxLength={100000} rows={15} value={body} onChange={e => { setBody(e.target.value); onDirty?.(true); }} /></label>
    <details className="editorial-provenance"><summary>سرویس و بخش‌های خبر</summary>
    <label>سرویس<select disabled={!editable} value={sectionId} onChange={e => { setSectionId(e.target.value); setSecondary(ids=>ids.filter(id=>id!==e.target.value)); onDirty?.(true); }}>{sections.filter(s => (!s.archived && !s.paused) || s.id === version.sectionId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <fieldset className="editorial-faction"><legend>بخش‌های ثانویه</legend>{sections.filter(s=>s.id!==sectionId && (!s.archived || secondarySectionIds.includes(s.id))).map(s=><label className="editorial-check" key={s.id}><input type="checkbox" disabled={!editable} checked={secondarySectionIds.includes(s.id)} onChange={()=>{ setSecondary(ids=>ids.includes(s.id)?ids.filter(id=>id!==s.id):[...ids,s.id]); onDirty?.(true); }} />{s.name}</label>)}</fieldset>
    </details>
    {version.imageUrl && /^https?:\/\//i.test(version.imageUrl) && <a href={version.imageUrl} target="_blank" rel="noreferrer">تصویر دریافت‌شدهٔ خبر</a>}
    <details><summary>سیاست ثبت‌شده برای این نسخه</summary><PolicySnapshot policy={policies.find(p => p.id === version.policyId)} /></details>
    <RenditionPreview value={{...renditions,webFull:{title,lead,body,imageUrl:version.imageUrl}}} editable={editable && !deriveAgain} change={value=>{setRenditions(value);onDirty?.(true);}} />
    {editable && <label className="editorial-check"><input type="checkbox" checked={deriveAgain} onChange={e=>{setDeriveAgain(e.target.checked);onDirty?.(true);}} />هنگام ذخیره، کارت و متن اجتماعی را دوباره از متن اصلی بساز (ویرایش اختصاصی آن‌ها جایگزین می‌شود)</label>}
    {editable && <button className="primary-button" disabled={busy}>ذخیره به‌عنوان نسخهٔ جدید</button>}
  </form>;
}
