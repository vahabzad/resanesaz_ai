"use client";

/* eslint-disable @next/next/no-img-element -- Logo previews use bounded local data URLs. */
import { useEffect, useRef, useState } from "react";
import { Check, RefreshCw, Sparkles, Upload } from "lucide-react";
import type { SiteDesignBrief } from "@/lib/contracts/sites";
import type { BrandIdentity, LogoPreview, LogoRequest } from "@/lib/contracts/branding";
import { renderLogoArtwork, sameLogoRequest, identityRequestText } from "@/lib/contracts/branding";
import { apiRequest } from "@/lib/api-client";
import { FormSelect } from "@/components/form-select";

type Design = SiteDesignBrief["design"];
const blankIdentity: BrandIdentity = { description: "", colorRules: "", typography: "", imagery: "", layout: "", restrictions: "", referenceUrl: "" };
export function logoRequestFor(name: string, design: Design): LogoRequest {
  return { name: name.trim(), instructions: (design.logoInstructions ?? "").trim(), primaryColor: design.primaryColor, secondaryColor: design.secondaryColor, backgroundColor: design.backgroundColor, identity: design.visualIdentity === "هویت بصری مشخص دارم" ? identityRequestText(design.identityDetails ?? blankIdentity) : "" };
}

export function SiteBrandingFields({ name, design, mediaLogo, onChange, onBusyChange }: {
  name: string; design: Design; mediaLogo: string | null; onChange: (design: Design) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const fileRead = useRef(0);
  const designRef = useRef(design);
  useEffect(() => { designRef.current = design; }, [design]);
  useEffect(() => () => { controller.current?.abort(); fileRead.current += 1; }, []);
  const request = logoRequestFor(name, design);
  const currentDraft = design.logoDraft && sameLogoRequest(design.logoDraft.request, request);
  const approved = currentDraft && design.logoDraft?.approved;
  const preview = design.logoMode === "provided" ? design.logoData || mediaLogo : design.logoMode === "generate" && design.logoDraft ? renderLogoArtwork(design.logoDraft.artwork) : null;
  const identity = design.identityDetails ?? blankIdentity;

  function update<Key extends keyof Design>(key: Key, value: Design[Key]) { onChange({ ...designRef.current, [key]: value }); }
  function identityField(key: keyof BrandIdentity, value: string) { update("identityDetails", { ...identity, [key]: value }); }
  async function upload(file?: File) {
    const version = ++fileRead.current;
    setError("");
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 1000000) {
      setError("لوگو باید تصویر PNG، JPEG یا WebP با حجم حداکثر یک مگابایت باشد.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { if (version === fileRead.current && typeof reader.result === "string") update("logoData", reader.result); };
    reader.onerror = () => { if (version === fileRead.current) setError("خواندن فایل لوگو انجام نشد؛ دوباره انتخاب کنید."); };
    reader.readAsDataURL(file);
  }
  async function generate() {
    setError("");
    if (request.name.length < 2 || request.instructions.length < 10 || ![request.primaryColor, request.secondaryColor, request.backgroundColor].every(color => /^#[0-9a-fA-F]{6}$/.test(color))) {
      setError("نام رسانه، حداقل ۱۰ حرف توضیح لوگو و سه رنگ معتبر را وارد کنید."); return;
    }
    if (design.visualIdentity === "هویت بصری مشخص دارم" && [identity.description, identity.colorRules, identity.typography, identity.imagery, identity.layout].some((text, index) => text.trim().length < (index === 0 ? 20 : 10))) {
      setError("ابتدا توضیحات هویت بصری را کامل کنید تا طراحی لوگو مطابق برندتان باشد."); return;
    }
    controller.current = new AbortController();
    setGenerating(true); onBusyChange(true);
    try {
      const result = await apiRequest<LogoPreview>("/api/v1/media/logo-preview", request, "POST", { signal: controller.current.signal });
      update("logoDraft", { request: result.request, artwork: result.artwork, approved: false });
    } catch (cause) {
      if (!controller.current.signal.aborted) setError(cause instanceof Error ? cause.message : "طراحی لوگو انجام نشد.");
    } finally { setGenerating(false); onBusyChange(false); }
  }
  function select(key: "logoMode" | "colorScheme" | "visualIdentity" | "fontPreference", label: string, options: string[]) {
    return <FormSelect name={key} label={label} required value={design[key]} onChange={value => update(key, value as Design[typeof key])} options={options.map(option => { const [value, text] = option.includes("|") ? option.split("|") : [option, option]; return { value, label: text }; })} />;
  }

  return <div className="site-branding-fields">
    <div className="site-brief-grid-two">
      {select("colorScheme", "رنگ‌بندی", ["انتخاب با هوش مصنوعی", "روشن", "تیره", "قرمز خبری", "آبی رسمی", "سبز", "طلایی / لوکس", "رنگ سازمانی", "ترکیب دلخواه"])}
      {select("logoMode", "لوگوی سایت", ["provided|استفاده از لوگوی رسانه", "generate|طراحی لوگوی تازه", "text-only|نمایش نام رسانه به‌صورت متنی"])}
    </div>
    <div className="site-brief-grid-three">{([ ["primaryColor", "رنگ اصلی"], ["secondaryColor", "رنگ مکمل"], ["backgroundColor", "پس‌زمینه"] ] as const).map(([key, label]) => <label className="site-brief-label" key={key}>{label}<div className="site-brand-color"><input type="color" aria-label={`انتخاب ${label}`} value={/^#[0-9a-fA-F]{6}$/.test(design[key]) ? design[key] : "#ffffff"} onChange={event => update(key, event.target.value)} /><input name={key} required pattern="#[0-9a-fA-F]{6}" value={design[key]} dir="ltr" onChange={event => update(key, event.target.value)} /></div></label>)}</div>
    <div className="site-brief-grid-two">
      {select("visualIdentity", "هویت بصری", ["انتخاب با هوش مصنوعی", "هویت بصری مشخص دارم", "هویت بصری مشخص ندارم"])}
      {select("fontPreference", "فونت", ["انتخاب با هوش مصنوعی", "Vazirmatn", "IRANSans", "Yekan Bakh", "Estedad"])}
    </div>
    {design.visualIdentity === "هویت بصری مشخص دارم" && <fieldset className="site-brand-identity"><legend>راهنمای هویت بصری برند</legend><p className="site-brief-help">قواعد موجود برندتان را بنویسید؛ این اطلاعات همراه درخواست طراحی لوگو ذخیره و به سرویس طراحی فرستاده می‌شود.</p>
      <label className="site-brief-label">شخصیت و تعریف برند<textarea required minLength={20} maxLength={2000} value={identity.description} onChange={event => identityField("description", event.target.value)} placeholder="ارزش‌ها، شخصیت، حس موردنظر و ویژگی‌هایی که برند را متمایز می‌کنند…" /></label>
      <div className="site-brief-grid-two">{([ ["colorRules", "قواعد استفاده از رنگ‌ها", "رنگ اصلی و مکمل کجا استفاده شوند؟ رنگ‌های مجاز و ممنوع و کنتراست…"], ["typography", "تایپوگرافی و فونت‌ها", "فونت تیتر و متن، وزن‌ها، اندازه‌ها و قواعد نگارش نام برند…"], ["imagery", "سبک تصویر، آیکون و لوگو", "عکاسی یا تصویرسازی، سبک آیکون‌ها، فرم‌ها و قواعد استفاده از نشان…"], ["layout", "چیدمان و قواعد اجرا", "فاصله‌ها، فضای امن لوگو، شکل کارت‌ها، تراکم و قواعد نمایش در موبایل…"] ] as const).map(([key, label, placeholder]) => <label className="site-brief-label" key={key}>{label}<textarea required minLength={10} maxLength={2000} value={identity[key]} onChange={event => identityField(key, event.target.value)} placeholder={placeholder} /></label>)}</div>
      <label className="site-brief-label">محدودیت‌ها و نبایدها <small>اختیاری</small><textarea maxLength={2000} value={identity.restrictions} onChange={event => identityField("restrictions", event.target.value)} placeholder="رنگ، نماد، لحن تصویری یا کاربردهایی که نباید استفاده شوند…" /></label>
      <label className="site-brief-label">لینک راهنمای برند <small>اختیاری؛ برای ثبت مرجع</small><input type="url" pattern="https://.*" maxLength={1000} dir="ltr" value={identity.referenceUrl} onChange={event => identityField("referenceUrl", event.target.value)} placeholder="https://…" /></label>
    </fieldset>}
    <section className="site-logo-workspace" aria-label="طراحی و پیش‌نمایش لوگو">
      <div className="site-logo-controls">
        {design.logoMode === "provided" && <><h3>لوگوی رسانه را انتخاب کنید</h3><p className="site-brief-help">لوگوی فعلی را استفاده کنید یا فایل تازه‌ای بارگذاری کنید. پیش‌نمایش بلافاصله همین‌جا نمایش داده می‌شود.</p><label className="site-brief-label"><span><Upload size={14} /> انتخاب یا جایگزینی فایل لوگو</span><input type="file" accept="image/png,image/jpeg,image/webp" required={!preview} onChange={event => void upload(event.target.files?.[0])} /><small className="site-brief-help">PNG، JPEG یا WebP؛ حداکثر یک مگابایت</small></label>{design.logoData && mediaLogo && <button type="button" className="secondary-button" onClick={() => update("logoData", undefined)}>برگشت به لوگوی ثبت‌شدهٔ رسانه</button>}</>}
        {design.logoMode === "generate" && <><h3>لوگوی تازه را پیش از ذخیره ببینید</h3><p className="site-brief-help">یک نشان برداری طراحی می‌شود؛ نام رسانه کنار آن نمایش داده می‌شود. هر طرح را پیش از استفاده تأیید کنید.</p><label className="site-brief-label">توضیح سبک و شکل لوگو<textarea required minLength={10} maxLength={3000} rows={4} value={design.logoInstructions ?? ""} onChange={event => update("logoInstructions", event.target.value)} placeholder="فرم و نماد اصلی، سبک مینیمال یا رسمی، حس موردنظر، جزئیات ضروری و موارد ممنوع را بنویسید…" /></label><button type="button" className="primary-button" disabled={generating} onClick={() => void generate()}>{generating ? <RefreshCw size={15} className="spin" /> : <Sparkles size={15} />}{generating ? "در حال طراحی لوگو…" : design.logoDraft ? "ساخت طرح تازه" : "ساخت پیش‌نمایش لوگو"}</button><p className="site-brief-help">تولید طرح ممکن است چند دقیقه طول بکشد. با تغییر نام، توضیح، رنگ‌ها یا راهنمای برند باید طرح متناسب با مشخصات تازه ساخته و تأیید شود.</p></>}
        {design.logoMode === "text-only" && <><h3>نمایش متنی نام رسانه</h3><p className="site-brief-help">نام رسانه با رنگ انتخابی نمایش داده می‌شود؛ برای سایت تصویری به‌عنوان لوگو ثبت نمی‌شود.</p></>}
        {error && <p className="site-brief-error" role="alert">{error}</p>}
      </div>
      <div className="site-logo-preview" aria-live="polite"><b>پیش‌نمایش لوگو</b><div className="site-logo-canvas">{preview ? <img src={preview} alt="پیش‌نمایش لوگوی انتخاب‌شده" /> : design.logoMode === "text-only" ? <span style={{ color: design.primaryColor }}>{name || "نام رسانه"}</span> : <p>{generating ? "طرح در حال آماده‌شدن است…" : "لوگو را آپلود کنید یا پیش‌نمایش تازه بسازید."}</p>}</div><div className="site-logo-header-preview">{preview && <img src={preview} alt="" />}<span>{name || "نام رسانه"}</span></div>
        {design.logoMode === "generate" && design.logoDraft && <>{!currentDraft && <p className="site-brief-error">این طرح متعلق به مشخصات قبلی است؛ طرح تازه بسازید.</p>}<button type="button" className={approved ? "secondary-button" : "primary-button"} disabled={!currentDraft || generating || Boolean(approved)} onClick={() => update("logoDraft", { ...design.logoDraft!, approved: true })}><Check size={15} />{approved ? "این لوگو تأیید شده است" : "این لوگو را تأیید می‌کنم"}</button></>}
      </div>
    </section>
  </div>;
}
