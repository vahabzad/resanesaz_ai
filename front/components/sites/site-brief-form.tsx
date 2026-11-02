"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, ArrowLeft, Palette, Sparkles } from "lucide-react";
import type { MediaSite, SiteDesignBrief, SiteSpec } from "@/lib/contracts/sites";
import type { PlatformCategory } from "@/lib/contracts/platform-categories";
import { defaultSiteSpec } from "./site-editor";
import { SiteBrandingFields, logoRequestFor } from "./site-branding-fields";
import { sameLogoRequest } from "@/lib/contracts/branding";
import { FormSelect } from "@/components/form-select";

const GROUPS = {
  mediaTopics: ["عمومی", "سیاسی", "اقتصادی", "ورزشی", "فناوری", "فرهنگی و هنری", "اجتماعی", "سلامت", "محلی / استانی", "تخصصی"],
  targetAudience: ["عموم مردم", "مخاطب تخصصی", "مدیران و سازمان‌ها", "جوانان", "کاربران محلی"],
  languages: ["فارسی", "انگلیسی", "عربی", "ترکی"],
  contentTypes: ["خبر", "خبر فوری", "مقاله", "تحلیل", "یادداشت", "مصاحبه", "گزارش", "ویدئو", "گالری تصاویر", "پادکست", "اینفوگرافیک", "پرونده ویژه"],
  homepageFocus: ["آخرین اخبار", "مهم‌ترین اخبار", "خبر فوری", "اخبار پربازدید", "محتوای تصویری", "تحلیل و یادداشت", "ویدئو", "انتخاب با هوش مصنوعی"],
  features: ["جستجو", "خبر فوری", "اخبار پربازدید", "اخبار مرتبط", "تبلیغات", "عضویت کاربران", "نظرات کاربران", "خبرنامه", "شبکه‌های اجتماعی", "ذخیره خبر", "اشتراک‌گذاری خبر", "حالت شب", "چندزبانه", "انتخاب با هوش مصنوعی"],
} as const;
type GroupName = keyof typeof GROUPS;
type Selection = Record<GroupName, string[]>;
const emptySelection: Selection = { mediaTopics: [], targetAudience: [], languages: [], contentTypes: [], homepageFocus: [], features: [] };
const groupLabels: Record<GroupName, string> = { mediaTopics: "موضوع رسانه", targetAudience: "مخاطب اصلی", languages: "زبان سایت", contentTypes: "نوع محتوا", homepageFocus: "تمرکز صفحهٔ اصلی", features: "قابلیت‌های سایت" };
const defaultDesign: SiteDesignBrief["design"] = { style: "", referenceWebsite: "", contentDensity: "", colorScheme: "", primaryColor: "#b62434", secondaryColor: "#ef4444", backgroundColor: "#ffffff", logoMode: "provided", visualIdentity: "", fontPreference: "" };

function ChoiceGroup({ name, value, onChange }: { name: GroupName; value: string[]; onChange: (value: string[]) => void }) {
  const items = GROUPS[name];
  const allSelected = value.length === items.length;
  return <div className="site-brief-choices">
    {name !== "languages" && <label className="choice-all"><input type="checkbox" checked={allSelected} onChange={() => onChange(allSelected ? [] : [...items])} />همه موارد</label>}
    {items.map(item => <label className={`site-brief-choice ${item.includes("هوش مصنوعی") ? "ai" : ""}`} key={item}><input type="checkbox" checked={value.includes(item)} onChange={() => onChange(value.includes(item) ? value.filter(selected => selected !== item) : [...value, item])} />{item}</label>)}
  </div>;
}

function FormCard({ title, subtitle, step, children }: { title: string; subtitle: string; step: string; children: ReactNode }) {
  return <section className="site-brief-card"><header><span className="site-brief-step">{step}</span><div><h2>{title}</h2><p>{subtitle}</p></div></header><div className="site-brief-card-body">{children}</div></section>;
}

function Field({ title, children }: { title: string; children: ReactNode }) { return <div className="site-brief-field"><div className="site-brief-field-title">{title}</div>{children}</div>; }

function Select({ name, title, options, value, onChange }: { name: string; title: string; options: string[]; value?: string; onChange: (value: string) => void }) {
  return <FormSelect name={name} label={title} required value={value} onChange={onChange} options={options.map(option => { const [optionValue, label] = option.includes("|") ? option.split("|") : [option, option]; return { value: optionValue, label }; })} />;
}

function slugFrom(value: string) {
  const letters: Record<string, string> = { آ: "a", ا: "a", ب: "b", پ: "p", ت: "t", ث: "s", ج: "j", چ: "ch", ح: "h", خ: "kh", د: "d", ذ: "z", ر: "r", ز: "z", ژ: "zh", س: "s", ش: "sh", ص: "s", ض: "z", ط: "t", ظ: "z", ع: "a", غ: "gh", ف: "f", ق: "gh", ک: "k", گ: "g", ل: "l", م: "m", ن: "n", و: "v", ه: "h", ی: "i", ء: "" };
  return value.toLowerCase().split("").map(char => letters[char] ?? char).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64).replace(/-$/g, "");
}

export function SiteBriefForm({ site, initialName = "", identityFields, mediaLogo = null, categoryCatalog, categoryLoadFailed = false, busy, error, onClose, onSave }: { site?: MediaSite; initialName?: string; identityFields?: ReactNode; mediaLogo?: string | null; categoryCatalog: PlatformCategory[]; categoryLoadFailed?: boolean; busy: boolean; error: string; onClose?: () => void; onSave: (input: { name: string; slug: string; spec: SiteSpec }) => void }) {
  const initialBrief = site?.spec.designBrief;
  const [selection, setSelection] = useState<Selection>(() => initialBrief ? { mediaTopics: initialBrief.mediaTopics, targetAudience: initialBrief.targetAudience, languages: initialBrief.languages, contentTypes: initialBrief.contentTypes, homepageFocus: initialBrief.homepageFocus, features: initialBrief.features } : emptySelection);
  const [name, setName] = useState(initialName || site?.name || "");
  const [slug, setSlug] = useState(site?.slug ?? slugFrom(initialName));
  const [slugTouched, setSlugTouched] = useState(Boolean(site));
  const availableCategories = categoryCatalog.filter(category => category.active);
  const [categoryIds, setCategoryIds] = useState<string[]>(() => availableCategories.filter(category => initialBrief?.categoryIds ? initialBrief.categoryIds.includes(category.id) : initialBrief?.categories.includes(category.nameFa)).map(category => category.id));
  const [errorMessage, setErrorMessage] = useState("");
  const [brandingBusy, setBrandingBusy] = useState(false);
  const completed = useMemo(() => Object.values(selection).filter(items => items.length > 0).length, [selection]);
  const progress = Math.round((completed / 6) * 100);
  const [design, setDesign] = useState(initialBrief?.design ?? defaultDesign);
  function update(name: GroupName, value: string[]) { setSelection(current => ({ ...current, [name]: value })); }
  function updateDesign<Key extends keyof SiteDesignBrief["design"]>(key: Key, value: SiteDesignBrief["design"][Key]) { setDesign(current => ({ ...current, [key]: value })); }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    for (const group of Object.keys(selection) as GroupName[]) if (!selection[group].length) { setErrorMessage(`بخش «${groupLabels[group]}» را تکمیل کنید.`); return; }
    const selectedCategories = availableCategories.filter(category => categoryIds.includes(category.id));
    if (!selectedCategories.length) { setErrorMessage("حداقل یک دسته‌بندی خبری از فهرست سوپر ادمین انتخاب کنید."); return; }
    const categoryList = selectedCategories.map(category => category.nameFa);
    const normalizedSlug = slug.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) { setErrorMessage("شناسهٔ نشانی باید با حروف انگلیسی کوچک، عدد و خط تیره نوشته شود."); return; }
    if (brandingBusy) { setErrorMessage("منتظر پایان طراحی لوگو بمانید."); return; }
    if (design.logoMode === "generate" && (!design.logoDraft?.approved || !sameLogoRequest(design.logoDraft.request, logoRequestFor(name, design)))) { setErrorMessage("ابتدا پیش‌نمایش لوگو را با مشخصات فعلی بسازید و تأیید کنید."); return; }
    if (design.logoMode === "provided" && !design.logoData && !mediaLogo && !site?.spec.logo) { setErrorMessage("فایل لوگوی رسانه را انتخاب کنید."); return; }
    const formData = new FormData(event.currentTarget);
    const brief: SiteDesignBrief = { ...selection, categories: categoryList, categoryIds: selectedCategories.map(category => category.id), design, additionalNotes: String(formData.get("additionalNotes") ?? "").trim() };
    const language = selection.languages.includes("فارسی") ? "fa" : selection.languages.includes("انگلیسی") ? "en" : selection.languages.includes("عربی") ? "ar" : "fa";
    const accent = /^#[0-9a-fA-F]{6}$/.test(design.primaryColor) ? design.primaryColor : site?.spec.accent ?? defaultSiteSpec.accent;
    const limit = design.contentDensity === "خلوت" ? 4 : design.contentDensity === "پرمحتوا" ? 12 : 8;
    const nextSpec: SiteSpec = {
      ...site?.spec,
      logo: design.logoData ? undefined : site?.spec.logo,
      title: name.trim(), tagline: site?.spec.tagline ?? "خبر، با نگاه روشن", language, accent,
      layout: design.style === "تصویری و مجله‌ای" || selection.homepageFocus.includes("محتوای تصویری") ? "grid" : "lead",
      footer: site?.spec.footer ?? defaultSiteSpec.footer,
      blocks: site?.spec.blocks ?? defaultSiteSpec.blocks.map(block => ({ ...block, limit })),
      designBrief: brief,
    };
    onSave({ name: name.trim(), slug: normalizedSlug, spec: nextSpec });
  }

  return <form className="site-brief-form" onSubmit={submit}>
    <fieldset className="site-brief-fields" disabled={busy}>
    <section className="site-brief-hero"><div className="site-brief-hero-icon"><Sparkles size={18} /></div><div><span>فرم طراحی سایت خبری</span><h2>سایت رسانه‌تان را توصیف کنید</h2><p>انتخاب‌های شما پیش‌نویس سایت را شکل می‌دهند. بعداً می‌توانید سایت را بازبینی و فعال کنید.</p></div><div className="site-brief-progress"><div><span>پیشرفت فرم</span><b>{progress.toLocaleString("fa-IR")}٪</b></div><i><span style={{ width: `${progress}%` }} /></i></div></section>
    <FormCard title="هویت رسانه" subtitle="مشخصات پایه و مخاطب رسانه را تعیین کنید" step="۰۱">
      <div className="site-brief-grid-two"><label className="site-brief-label">نام رسانه<input name="siteName" required minLength={2} maxLength={100} value={name} onChange={event => { setName(event.target.value); if (!slugTouched) setSlug(slugFrom(event.target.value)); }} placeholder="مثلاً دیدبان فناوری" /></label><label className="site-brief-label">شناسهٔ نشانی<input name="slug" dir="ltr" required minLength={3} maxLength={64} pattern="[a-z0-9]+(-[a-z0-9]+)*" readOnly={Boolean(site)} value={slug} onChange={event => { setSlugTouched(true); setSlug(event.target.value); }} placeholder="didban-fanavari" /><small className="site-brief-help">نشانی سایت: /s/{slug || "…"}</small></label></div>
      {identityFields}
      <Field title="موضوع رسانه"><ChoiceGroup name="mediaTopics" value={selection.mediaTopics} onChange={value => update("mediaTopics", value)} /></Field><Field title="مخاطب اصلی"><ChoiceGroup name="targetAudience" value={selection.targetAudience} onChange={value => update("targetAudience", value)} /></Field>
    </FormCard>
    <FormCard title="زبان و محتوا" subtitle="زبان و انواع محتوای رسانه را مشخص کنید" step="۰۲">
      <Field title="زبان‌های سایت"><ChoiceGroup name="languages" value={selection.languages} onChange={value => update("languages", value)} /></Field>
      <Field title="دسته‌بندی‌های خبری">
        {categoryLoadFailed ? <p className="site-brief-error" role="alert">دریافت دسته‌بندی‌ها انجام نشد؛ صفحه را دوباره بارگذاری کنید.</p> : availableCategories.length ? <div className="site-brief-choices">{availableCategories.map(category => <label className="site-brief-choice" key={category.id}><input type="checkbox" name="categoryIds" value={category.id} checked={categoryIds.includes(category.id)} disabled={!categoryIds.includes(category.id) && categoryIds.length >= 30} onChange={() => setCategoryIds(current => current.includes(category.id) ? current.filter(id => id !== category.id) : [...current, category.id])} />{category.nameFa}</label>)}</div> : <p className="site-brief-help">هنوز دسته‌بندی فعالی تعریف نشده است؛ سوپر ادمین باید دسته‌بندی‌های خبری را ثبت کند.</p>}
        <small className="site-brief-help">یک یا چند دسته از فهرست سوپر ادمین انتخاب کنید (حداکثر ۳۰ دسته).</small>
      </Field>
      <Field title="نوع محتوا"><ChoiceGroup name="contentTypes" value={selection.contentTypes} onChange={value => update("contentTypes", value)} /></Field>
    </FormCard>
    <FormCard title="طراحی و تجربهٔ بصری" subtitle="حال‌وهوای کلی سایت را انتخاب کنید" step="۰۳">
      <Field title="تمرکز صفحهٔ اصلی"><ChoiceGroup name="homepageFocus" value={selection.homepageFocus} onChange={value => update("homepageFocus", value)} /></Field>
      <div className="site-brief-grid-two"><Select name="designStyle" title="سبک طراحی" value={design.style} options={["رسمی و خبری", "مدرن", "مینیمال", "تصویری و مجله‌ای", "پرمحتوا و کلاسیک", "لوکس و حرفه‌ای", "ترکیبی", "انتخاب با هوش مصنوعی", "مشابه سایت خاص"]} onChange={value => updateDesign("style", value)} /><Select name="contentDensity" title="تراکم محتوا" value={design.contentDensity} options={["خلوت", "متعادل", "پرمحتوا", "انتخاب با هوش مصنوعی"]} onChange={value => updateDesign("contentDensity", value)} /></div>
      <label className="site-brief-label">سایت مرجع <small>اختیاری</small><input name="referenceWebsite" type="url" dir="ltr" value={design.referenceWebsite} onChange={event => updateDesign("referenceWebsite", event.target.value)} placeholder="https://example.com" /></label>
    </FormCard>
    <FormCard title="هویت بصری" subtitle="رنگ، لوگو و تایپوگرافی سایت را تعیین کنید" step="۰۴">
      <SiteBrandingFields name={name} design={design} mediaLogo={site?.spec.logo ?? mediaLogo} onChange={setDesign} onBusyChange={setBrandingBusy} />
    </FormCard>
    <FormCard title="قابلیت‌های سایت" subtitle="ویژگی‌هایی را که برای سایت لازم دارید انتخاب کنید" step="۰۵"><Field title="قابلیت‌ها"><ChoiceGroup name="features" value={selection.features} onChange={value => update("features", value)} /></Field></FormCard>
    <FormCard title="دستور تکمیلی" subtitle="اگر خواستهٔ دیگری دارید اینجا بنویسید" step="۰۶"><label className="site-brief-label"><textarea name="additionalNotes" maxLength={4000} defaultValue={initialBrief?.additionalNotes} placeholder="مثلاً بنرهای تبلیغاتی کوچک باشد و لوگو مینیمال طراحی شود…" /></label></FormCard>
    {(errorMessage || error) && <p className="site-brief-error" role="alert">{errorMessage || error}</p>}
    <div className="site-brief-actions">{onClose && <button type="button" className="secondary-button" disabled={busy} onClick={onClose}><ArrowRight size={15} />بازگشت</button>}<button type="submit" className="primary-button" disabled={busy || brandingBusy || categoryLoadFailed || !availableCategories.length}><Palette size={15} />{busy ? "در حال ذخیره…" : "ذخیره و ادامه به منابع"}<ArrowLeft size={15} /></button></div>
    <p className="site-brief-footnote">ثبت این فرم یک پیش‌نویس داخلی می‌سازد؛ سایت تا فعال‌سازی جداگانه عمومی نمی‌شود.</p>
    </fieldset>
  </form>;
}
