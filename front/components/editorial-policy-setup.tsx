"use client";

import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { EditorialPromptPicker } from "@/components/media-setup/editorial-prompt-picker";
import { editorialPromptError, type EditorialPromptPair } from "@/lib/editorial-prompt-presets";
import { apiRequest } from "@/lib/api-client";
import type { EditorialWorkspace } from "@/lib/contracts/editorial";
import type { MediaSourceAccessRequest } from "@/lib/contracts/media-setup";
import type { PlatformCategory } from "@/lib/contracts/platform-categories";
import { defaultEditorialInstructions, defaultSocialInstructions, editorialLanguages, type ManagedSection, type SectionSettings } from "@/lib/contracts/editorial-settings";

const sample = {
  title: "آغاز طرح بهسازی فضای سبز در چند محله",
  content: "شهرداری از آغاز طرحی برای بهسازی فضای سبز در چند محله خبر داد. در این طرح قرار است بوستان‌های محلی بازپیرایی شوند و امکاناتی مانند مسیر پیاده‌روی و روشنایی بهبود پیدا کند. مسئولان شهری اعلام کردند اجرای طرح از هفتهٔ آینده آغاز می‌شود و اولویت با محله‌هایی است که به خدمات عمومی کمتری دسترسی دارند. زمان‌بندی جزئی هر مرحله پس از بررسی وضعیت فنی و اعلام نظر ساکنان منتشر خواهد شد.",
};
const initialSettings: SectionSettings = { language: "fa", instructions: defaultEditorialInstructions, socialInstructions: defaultSocialInstructions, factionId: null, viewpointStrength: 0, humor: 0, formality: 50, sourceIds: [], sourceUrls: [], categories: [] };
type Preview = { title: string; lead: string; body: string; socialText: string; reviewRequired?: boolean };
export type SetupPolicy = { key: string; section?: ManagedSection; name: string; settings: SectionSettings };
const isSetupSection = (section: ManagedSection) => !section.archived && (section.name === "سیاست راه‌اندازی رسانه" || section.name.startsWith("سردبیر راه‌اندازی · "));
const persistedSetupName = (name: string) => name.startsWith("سردبیر راه‌اندازی · ") ? name : `سردبیر راه‌اندازی · ${name}`;
const hasPromptChanges = (policy: SetupPolicy) => Boolean(policy.section && (
  policy.settings.instructions !== (policy.section.settings.instructions?.trim() || defaultEditorialInstructions) ||
  policy.settings.socialInstructions !== (policy.section.settings.socialInstructions?.trim() || defaultSocialInstructions)
));

export function EditorialPolicySetup({ workspace, initialSections, requests, categories, busy, onSavePolicy, onFinish, onBack }: {
  workspace: EditorialWorkspace | null; initialSections: ManagedSection[]; requests: MediaSourceAccessRequest[]; categories: PlatformCategory[]; busy: boolean;
  onSavePolicy: (policy: SetupPolicy) => Promise<ManagedSection>; onFinish: (savedSections: ManagedSection[]) => Promise<void>; onBack: () => void;
}) {
  const sections = initialSections.length ? initialSections : workspace?.sections.filter(isSetupSection) ?? [];
  const [policies, setPolicies] = useState<SetupPolicy[]>(() => sections.length
    ? sections.map(section => ({ key: section.id, section, name: section.name === "سیاست راه‌اندازی رسانه" ? "سردبیر راه‌اندازی · عمومی" : section.name, settings: { ...initialSettings, ...section.settings, instructions: section.settings.instructions?.trim() || defaultEditorialInstructions, socialInstructions: section.settings.socialInstructions?.trim() || defaultSocialInstructions, factionId: null, viewpointStrength: 0, humor: 0, formality: 50 } }))
    : [{ key: "new-policy-1", name: "سردبیر راه‌اندازی · عمومی", settings: initialSettings }]);
  const [sourceModes, setSourceModes] = useState<Record<string, "all" | "selected">>(() => Object.fromEntries(policies.map(policy => [policy.key, policy.settings.sourceIds.length || policy.settings.sourceUrls?.length ? "selected" : "all"])));
  const [categoryModes, setCategoryModes] = useState<Record<string, boolean>>(() => Object.fromEntries(policies.map(policy => [policy.key, Boolean(policy.settings.categories.length)])));
  const [previews, setPreviews] = useState<Record<string, Preview | null>>({});
  const [previewErrors, setPreviewErrors] = useState<Record<string, string>>({});
  const [previewBusy, setPreviewBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedPolicyKey, setSelectedPolicyKey] = useState(policies[0]?.key ?? "");
  const [error, setError] = useState("");
  const resultRef = useRef<HTMLElement>(null);
  const newsPromptRef = useRef<HTMLDetailsElement>(null);
  const socialPromptRef = useRef<HTMLDetailsElement>(null);
  const previewRevisions = useRef<Record<string, number>>({});
  const [promptHistory, setPromptHistory] = useState<Record<string, EditorialPromptPair[]>>({});
  const sources = [...new Map([
    ...workspace?.inputOptions.sources.map(source => ({ key: `id:${source.id}`, label: source.name, id: source.id, url: "" })) ?? [],
    ...requests.map(request => ({ key: `url:${request.url}`, label: request.url, id: "", url: request.url })),
  ].map(source => [source.key, source])).values()];

  function update(key: string, change: (policy: SetupPolicy) => SetupPolicy) {
    previewRevisions.current[key] = (previewRevisions.current[key] ?? 0) + 1;
    setPolicies(current => current.map(policy => policy.key === key ? change(policy) : policy));
    setPreviews(current => ({ ...current, [key]: null }));
    setPreviewErrors(current => ({ ...current, [key]: "" }));
  }
  function revealPrompts() {
    requestAnimationFrame(() => {
      if (newsPromptRef.current) newsPromptRef.current.open = true;
      if (socialPromptRef.current) socialPromptRef.current.open = true;
      newsPromptRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      newsPromptRef.current?.querySelector("textarea")?.focus({ preventScroll: true });
    });
  }
  function applyPrompts(policy: SetupPolicy, pair: EditorialPromptPair) {
    setPromptHistory(current => ({ ...current, [policy.key]: [...current[policy.key] ?? [], { instructions: policy.settings.instructions ?? defaultEditorialInstructions, socialInstructions: policy.settings.socialInstructions ?? defaultSocialInstructions }].slice(-10) }));
    update(policy.key, current => ({ ...current, settings: { ...current.settings, ...pair } }));
    revealPrompts();
  }
  function undoPrompts(policy: SetupPolicy) {
    const history = promptHistory[policy.key] ?? [];
    const previous = history[history.length - 1];
    if (!previous) return;
    setPromptHistory(current => ({ ...current, [policy.key]: history.slice(0, -1) }));
    update(policy.key, current => ({ ...current, settings: { ...current.settings, ...previous } }));
    revealPrompts();
  }
  function addPolicy() {
    const names = new Set([...policies.map(policy => persistedSetupName(policy.name.trim())), ...sections.map(section => section.name)]);
    let number = policies.length + 1;
    while (names.has(`سردبیر راه‌اندازی · ${number.toLocaleString("fa-IR")}`)) number += 1;
    const key = crypto.randomUUID();
    setPolicies(current => [...current, { key, name: `سردبیر راه‌اندازی · ${number.toLocaleString("fa-IR")}`, settings: { ...initialSettings } }]);
    setSourceModes(current => ({ ...current, [key]: "all" }));
    setCategoryModes(current => ({ ...current, [key]: false }));
    setSelectedPolicyKey(key);
  }
  function toggleSource(policy: SetupPolicy, sourceKey: string) {
    const source = sources.find(item => item.key === sourceKey);
    if (!source) return;
    update(policy.key, current => ({ ...current, settings: source.id
      ? { ...current.settings, sourceIds: current.settings.sourceIds.includes(source.id) ? current.settings.sourceIds.filter(id => id !== source.id) : [...current.settings.sourceIds, source.id] }
      : { ...current.settings, sourceUrls: (current.settings.sourceUrls ?? []).includes(source.url) ? (current.settings.sourceUrls ?? []).filter(url => url !== source.url) : [...(current.settings.sourceUrls ?? []), source.url] } }));
  }
  function toggleCategory(policy: SetupPolicy, label: string) {
    update(policy.key, current => ({ ...current, settings: { ...current.settings, categories: current.settings.categories.includes(label) ? current.settings.categories.filter(item => item !== label) : [...current.settings.categories, label] } }));
  }
  async function makePreview(policy: SetupPolicy) {
    const validation = editorialPromptError(policy.settings.instructions, policy.settings.socialInstructions);
    if (validation) { setPreviewErrors(current => ({ ...current, [policy.key]: validation })); revealPrompts(); return; }
    const revision = previewRevisions.current[policy.key] ?? 0;
    setPreviewBusy(policy.key); setPreviewErrors(current => ({ ...current, [policy.key]: "" })); setPreviews(current => ({ ...current, [policy.key]: null }));
    try {
      const result = await apiRequest<Preview>("/api/v1/editorial/policy-preview", { name: policy.name, settings: policy.settings });
      if ((previewRevisions.current[policy.key] ?? 0) !== revision) {
        setPreviewErrors(current => ({ ...current, [policy.key]: "تنظیمات پس از شروع نمونه تغییر کرده است؛ نمونه را با متن فعلی دوباره اجرا کنید." }));
        return;
      }
      setPreviews(current => ({ ...current, [policy.key]: result }));
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 0);
    } catch (cause) { if ((previewRevisions.current[policy.key] ?? 0) === revision) setPreviewErrors(current => ({ ...current, [policy.key]: cause instanceof Error ? cause.message : "پیش‌نمایش ساخته نشد." })); }
    finally { setPreviewBusy(null); }
  }
  async function save() {
    setError("");
    if (saving || busy) return;
    if (!policies.length) { setError("حداقل یک سردبیر لازم است."); return; }
    const names = policies.map(policy => persistedSetupName(policy.name.trim()));
    if (names.some(name => name.length < 2) || new Set(names).size !== names.length) { setError("نام هر سردبیر باید معتبر و در این فهرست یکتا باشد."); return; }
    for (const policy of policies) {
      const validation = editorialPromptError(policy.settings.instructions, policy.settings.socialInstructions);
      if (validation) { setSelectedPolicyKey(policy.key); setError(`${policy.name}: ${validation}`); revealPrompts(); return; }
      if (sourceModes[policy.key] === "selected" && !policy.settings.sourceIds.length && !(policy.settings.sourceUrls ?? []).length) { setError(`برای «${policy.name}» منبع مشخصی انتخاب نشده است.`); return; }
      if (categoryModes[policy.key] && !policy.settings.categories.length) { setError(`برای «${policy.name}» حداقل یک دسته‌بندی انتخاب کنید یا محدودیت دسته‌بندی را بردارید.`); return; }
    }
    const normalized = policies.map(policy => {
      const settings = { ...policy.settings, sourceIds: sourceModes[policy.key] === "all" ? [] : policy.settings.sourceIds, sourceUrls: sourceModes[policy.key] === "all" ? [] : policy.settings.sourceUrls ?? [], categories: categoryModes[policy.key] ? policy.settings.categories : [] };
      return { ...policy, name: persistedSetupName(policy.name.trim()), settings };
    });
    setSaving(true);
    try {
      const savedSections: ManagedSection[] = [];
      for (const policy of normalized) {
        const saved = await onSavePolicy(policy);
        savedSections.push(saved);
        setPolicies(current => current.map(item => item.key === policy.key ? { ...item, section: saved, name: saved.name, settings: saved.settings } : item));
      }
      await onFinish(savedSections);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ذخیرهٔ سیاست‌ها انجام نشد."); }
    finally { setSaving(false); }
  }
  return <section className="editorial-policy-setup" dir="rtl">
    <header><span className="eyebrow">مرحلهٔ سوم از چهار · تنظیم سردبیر</span><h1>سردبیرها و سیاست نگارش</h1><p>برای هر منبع یا دسته‌بندی می‌توانی یک سردبیر جدا بسازی. دسته‌ها از فهرست سوپر ادمین انتخاب می‌شوند؛ نمونهٔ آزمایشی برای تنظیم لحن به خبر واقعی یا کراولر نیاز ندارد.</p></header>
    {!workspace?.platformConfig && <p className="editorial-feedback">متن پایهٔ سامانه برای شروع آماده است؛ جهت‌گیری و رسمیت را می‌توانید در پرامپت این سردبیر مشخص کنید.</p>}
    {(() => {
      const policy = policies.find(item => item.key === selectedPolicyKey) ?? policies[0];
      if (!policy) return null;
      const sourceMode = sourceModes[policy.key] ?? "all";
      const categoryMode = categoryModes[policy.key] ?? false;
      return <>
        <div className="editorial-policy-workbench">
          <section className="editorial-policy-config-pane" aria-label="تنظیمات سردبیر">
            <div className="editorial-policy-pane-heading"><div><span className="eyebrow">تنظیمات سردبیر</span><h2>{policy.name}</h2></div><span className="editorial-policy-draft-state">{policy.section ? hasPromptChanges(policy) ? "تغییرات ثبت‌نشده" : "ثبت‌شده" : "پیش‌نویس"}</span></div>
            <div className="editorial-policy-basics"><div className="editorial-policy-settings-title">تنظیمات پایهٔ نگارش</div><div className="editorial-policy-basics-grid">
              <label>نام سردبیر / سیاست<input value={policy.name} minLength={2} maxLength={80} disabled={busy || saving} onChange={event => update(policy.key, current => ({ ...current, name: event.target.value }))} /></label>
              <label className="editorial-policy-language">زبان خروجی<select value={policy.settings.language ?? "fa"} disabled={busy || saving} onChange={event => update(policy.key, current => ({ ...current, settings: { ...current.settings, language: event.target.value as SectionSettings["language"] } }))}>{Object.entries(editorialLanguages).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
            </div><p className="editorial-policy-fields-hint">طنز، جهت‌گیری و رسمیت در پرامپت خبر تنظیم می‌شوند.</p></div>
            <EditorialPromptPicker key={policy.key} value={{ instructions: policy.settings.instructions ?? defaultEditorialInstructions, socialInstructions: policy.settings.socialInstructions ?? defaultSocialInstructions }} disabled={busy || saving} canUndo={Boolean(promptHistory[policy.key]?.length)} onApply={pair => applyPrompts(policy, pair)} onUndo={() => undoPrompts(policy)} />
            <details ref={newsPromptRef} className="editorial-policy-prompt"><summary>{policy.settings.instructions && policy.settings.instructions !== defaultEditorialInstructions ? "پرامپت خبر · نسخهٔ اختصاصی فعال" : "پرامپت خبر و چکیده"}</summary><div>
              <p>این پرامپت، دستور ساخت چکیده و متن کامل خبر است. میزان طنز، جهت‌گیری و رسمیت را برای همین سردبیر در متن تغییر بده؛ زبان خروجی از تنظیم پایه انتخاب می‌شود.</p>
              <label className="editorial-policy-prompt-label">پرامپت این سردبیر<textarea value={policy.settings.instructions ?? defaultEditorialInstructions} minLength={20} maxLength={10000} rows={8} disabled={busy || saving} onChange={event => update(policy.key, current => ({ ...current, settings: { ...current.settings, instructions: event.target.value } }))} placeholder="قواعد نگارش این سردبیر را بنویسید." /></label>
              {policy.settings.instructions !== defaultEditorialInstructions && <button type="button" className="secondary-button" disabled={busy || saving} onClick={() => update(policy.key, current => ({ ...current, settings: { ...current.settings, instructions: defaultEditorialInstructions } }))}>بازگرداندن پرامپت پیش‌فرض</button>}
              <small>{(policy.settings.instructions ?? defaultEditorialInstructions).length.toLocaleString("fa-IR")} / ۱۰٬۰۰۰ نویسه</small>
            </div></details>
            <details ref={socialPromptRef} className="editorial-policy-prompt editorial-policy-social-prompt"><summary>{policy.settings.socialInstructions && policy.settings.socialInstructions !== defaultSocialInstructions ? "پرامپت شبکه‌های اجتماعی · نسخهٔ اختصاصی فعال" : "پرامپت نسخهٔ شبکه‌های اجتماعی"}</summary><div>
              <p>این دستور جداگانه برای ساخت پیام کوتاه شبکه‌های اجتماعی استفاده می‌شود؛ زبان و لحن اصلی سردبیر را حفظ می‌کند.</p>
              <label className="editorial-policy-prompt-label">قالب و دستور پیام اجتماعی<textarea value={policy.settings.socialInstructions ?? defaultSocialInstructions} minLength={20} maxLength={5000} rows={5} disabled={busy || saving} onChange={event => update(policy.key, current => ({ ...current, settings: { ...current.settings, socialInstructions: event.target.value } }))} placeholder="ساختار نسخهٔ شبکهٔ اجتماعی را بنویسید." /></label>
              {policy.settings.socialInstructions !== defaultSocialInstructions && <button type="button" className="secondary-button" disabled={busy || saving} onClick={() => update(policy.key, current => ({ ...current, settings: { ...current.settings, socialInstructions: defaultSocialInstructions } }))}>بازگرداندن قالب پیش‌فرض شبکه‌های اجتماعی</button>}
              <small>{(policy.settings.socialInstructions ?? defaultSocialInstructions).length.toLocaleString("fa-IR")} / ۵٬۰۰۰ نویسه</small>
            </div></details>
            <fieldset className="editorial-policy-scope" disabled={busy || saving}><legend>محدودهٔ استفاده از این سردبیر</legend>
              <p className="editorial-scope-help">این سیاست را برای همهٔ منابع بگذار یا منبع‌های مشخص را انتخاب کن؛ در صورت نیاز، آن را به چند دسته محدود کن.</p>
              <div className="editorial-scope-choice-grid">
                <label className={`editorial-scope-choice ${sourceMode === "all" ? "selected" : ""}`}><input type="radio" name={`source-scope-${policy.key}`} checked={sourceMode === "all"} onChange={() => setSourceModes(current => ({ ...current, [policy.key]: "all" }))} /><span><b>همهٔ منابع</b><small>این سیاست برای تمام ورودی‌های خبری رسانه فعال است.</small></span></label>
                <label className={`editorial-scope-choice ${sourceMode === "selected" ? "selected" : ""}`}><input type="radio" name={`source-scope-${policy.key}`} checked={sourceMode === "selected"} onChange={() => setSourceModes(current => ({ ...current, [policy.key]: "selected" }))} /><span><b>منابع مشخص</b><small>فقط منبع‌هایی که انتخاب می‌کنی.</small></span></label>
              </div>
              {sourceMode === "selected" && <div className="editorial-scope-dependent"><div className="editorial-scope-section-heading"><b>منابع موردنظر</b><small>{policy.settings.sourceIds.length + (policy.settings.sourceUrls?.length ?? 0)} انتخاب‌شده</small></div><div className="editorial-option-list">{sources.length ? sources.map(source => {
                const checked = source.id ? policy.settings.sourceIds.includes(source.id) : (policy.settings.sourceUrls ?? []).includes(source.url);
                return <label className="editorial-check" key={source.key}><input type="checkbox" checked={checked} onChange={() => toggleSource(policy, source.key)} /><span dir={source.url ? "ltr" : undefined}>{source.label}</span></label>;
              }) : <p className="editorial-scope-empty">هنوز منبعی در مرحلهٔ قبل وارد نشده است.</p>}</div></div>}
              <label className={`editorial-scope-category-toggle ${categoryMode ? "selected" : ""}`}><input type="checkbox" checked={categoryMode} onChange={event => setCategoryModes(current => ({ ...current, [policy.key]: event.target.checked }))} /><span><b>محدودکردن به دسته‌بندی‌های مشخص</b><small>در صورت فعال‌کردن، این سیاست فقط برای دسته‌هایی که انتخاب می‌کنی اجرا می‌شود.</small></span></label>
              {categoryMode && <div className="editorial-scope-dependent"><div className="editorial-scope-section-heading"><b>دسته‌بندی‌های موردنظر</b><small>{policy.settings.categories.length} انتخاب‌شده</small></div><div className="editorial-option-list editorial-category-option-list">{categories.map(category => <label className="editorial-check" key={category.id}><input type="checkbox" checked={policy.settings.categories.includes(category.nameFa)} onChange={() => toggleCategory(policy, category.nameFa)} />{category.nameFa}</label>)}{!categories.length && <p className="editorial-scope-empty">سوپر ادمین هنوز دسته‌بندی فعالی تعریف نکرده است.</p>}</div></div>}
            </fieldset>
            <div className="editorial-config-add-policy-row"><button type="button" className="primary-button editorial-add-policy-button" disabled={busy || saving || policies.length >= 30} onClick={addPolicy}><Plus size={16} />افزودن سردبیر</button></div>
          </section>
          <section className="editorial-policy-preview-pane" aria-label="پیش‌نمایش خروجی">
            <div className="editorial-policy-pane-heading"><div><span className="eyebrow">نتیجهٔ تنظیمات</span><h2>پیش‌نمایش خبر</h2></div><span className="editorial-preview-badge">نمونهٔ آزمایشی</span></div>
            <article className="editorial-policy-sample"><small>نمونهٔ ثابت سامانه · در صندوق یا دیتابیس ذخیره نمی‌شود</small><h3>{sample.title}</h3><p>{sample.content}</p></article>
            <button type="button" className="primary-button editorial-preview-action" disabled={previewBusy !== null || busy || saving} onClick={() => void makePreview(policy)}>{previewBusy === policy.key ? "در حال ساخت پیش‌نمایش…" : "اجرای نمونه با تنظیمات این سردبیر"}</button>
            {previewErrors[policy.key] && <p className="editorial-feedback error" role="alert">{previewErrors[policy.key]}</p>}
            {previews[policy.key] ? <article ref={resultRef} className="editorial-policy-result" aria-live="polite"><b>خروجی بازنویسی‌شده</b>{previews[policy.key]?.reviewRequired && <p className="editorial-feedback">این نمونه برای تصمیم نهایی نیاز به بررسی انسانی دارد؛ متن آزمایشی در ادامه نمایش داده شده است.</p>}<section><h3>چکیدهٔ خبر</h3><b>{previews[policy.key]?.title}</b><p>{previews[policy.key]?.lead}</p></section><section><h3>متن کامل خبر</h3><div>{previews[policy.key]?.body}</div></section><section><h3>نسخهٔ شبکه‌های اجتماعی</h3><p>{previews[policy.key]?.socialText}</p></section></article> : <p className="editorial-preview-empty">با تغییر زبان یا پرامپت خبر/شبکهٔ اجتماعی، نمونه را دوباره اجرا کن تا هر سه خروجی را ببینی.</p>}
          </section>
        </div>
        <section className="editorial-policy-list-bottom"><header><div><span className="eyebrow">پیکربندی رسانه</span><h2>سردبیرهای این رسانه</h2><p>سردبیر موردنظر را برای ویرایش انتخاب کن.</p></div></header>
          <div className="editorial-policy-list-items">{policies.map((item, index) => {
            const selectedSources = item.settings.sourceIds.length + (item.settings.sourceUrls?.length ?? 0);
            return <div className={`editorial-policy-list-item ${item.key === policy.key ? "active" : ""}`} key={item.key}><button type="button" disabled={busy || saving} onClick={() => setSelectedPolicyKey(item.key)}><span className="editorial-policy-list-number">{(index + 1).toLocaleString("fa-IR")}</span><span><b>{item.name}</b><small>{editorialLanguages[item.settings.language ?? "fa"]} · {selectedSources ? `${selectedSources} منبع` : "همهٔ منابع"} · {item.settings.categories.length ? `${item.settings.categories.length} دسته` : "همهٔ دسته‌ها"}</small></span><em>{item.section ? hasPromptChanges(item) ? "تغییرات ثبت‌نشده" : "ذخیره‌شده" : "پیش‌نویس"}</em></button>{policies.length > 1 && <button type="button" className="editorial-policy-remove" disabled={busy || saving} aria-label={`حذف ${item.name}`} onClick={() => { setPolicies(current => current.filter(candidate => candidate.key !== item.key)); setSourceModes(current => { const next = { ...current }; delete next[item.key]; return next; }); setCategoryModes(current => { const next = { ...current }; delete next[item.key]; return next; }); if (selectedPolicyKey === item.key) setSelectedPolicyKey(policies.find(candidate => candidate.key !== item.key)?.key ?? ""); }}><Trash2 size={15} /></button>}</div>;
          })}</div>
        </section>
      </>;
    })()}
    {error && <p className="editorial-feedback error" role="alert">{error}</p>}
    <div className="media-create-form-actions"><button type="button" className="secondary-button" disabled={busy || saving} onClick={onBack}><span>بازگشت به منابع</span></button><button type="button" className="primary-button" disabled={busy || saving} onClick={() => void save()}>{busy || saving ? "در حال ذخیره…" : "ذخیرهٔ سردبیرها و ادامه به بات‌ها"}</button></div>
  </section>;
}
