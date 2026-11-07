"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AtSign, Camera, Check, CheckCircle2, GraduationCap, MessagesSquare, Music2, Radio, Send, Video } from "lucide-react";
import type { SourceAccessInput } from "../../lib/contracts/media-setup";
import { socialPlatformKeys, socialPlatformLabels, type SocialPlatform } from "../../lib/contracts/social-platforms";
import { detectSocialPlatform, resolveSocialSource, socialSourceInfo, SocialSourceAddressError } from "../../lib/contracts/social-source";

const presentation = {
  instagram: { icon: Camera, color: "#be3b7d" }, telegram: { icon: Send, color: "#2084bd" },
  bale: { icon: MessagesSquare, color: "#178866" }, eitaa: { icon: Send, color: "#cf7026" },
  rubika: { icon: MessagesSquare, color: "#7757ad" }, rubino: { icon: Camera, color: "#b83d6b" },
  shad: { icon: GraduationCap, color: "#248a5a" }, soroush: { icon: MessagesSquare, color: "#237fab" },
  x: { icon: AtSign, color: "#313c4a" }, youtube: { icon: Video, color: "#d73938" },
  aparat: { icon: Video, color: "#c83760" }, facebook: { icon: AtSign, color: "#3269c6" },
  tiktok: { icon: Music2, color: "#343c51" },
} satisfies Record<SocialPlatform, unknown>;
// The same thirteen registered capabilities, ordered for source selection.
const order: SocialPlatform[] = ["instagram", "telegram", "bale", "eitaa", "rubika", "rubino", "shad", "soroush", "x", "youtube", "aparat", "facebook", "tiktok"];

export function SocialSourceFields({ value, onChange }: { value: SourceAccessInput; onChange: (value: SourceAccessInput) => void }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [touched, setTouched] = useState(false);
  const platform = value.platform ?? detectSocialPlatform(value.url) ?? undefined;
  let normalized: ReturnType<typeof resolveSocialSource> | null = null;
  let problem: SocialSourceAddressError | null = null;
  try { if (value.url.trim()) normalized = resolveSocialSource(platform, value.url); }
  catch (error) { problem = error instanceof SocialSourceAddressError ? error : new SocialSourceAddressError("SOCIAL_ADDRESS_INVALID"); }
  const message = problem?.message ?? "";
  const mismatch = problem?.code === "SOCIAL_PLATFORM_MISMATCH";
  const showError = Boolean(value.url.trim() && (touched || mismatch) && problem);
  useEffect(() => { input.current?.setCustomValidity(message || (!platform ? "ابتدا شبکهٔ اجتماعی را انتخاب کنید." : "")); }, [message, platform]);
  const details = platform ? socialSourceInfo[platform] : null;
  function choose(key: SocialPlatform) { setTouched(false); onChange({ sourceType: "social", url: value.url, platform: key }); }
  return <div className="social-source-fields">
    <fieldset className="social-platform-picker">
      <legend>شبکهٔ موردنظر را انتخاب کنید <span>{socialPlatformKeys.length.toLocaleString("fa-IR")} شبکه</span></legend>
      <p>فقط کانال یا صفحهٔ موردنظر را معرفی کنید.</p>
      <div className="social-platform-options">{order.map(key => {
        const Icon = presentation[key].icon;
        return <label className={`social-platform-option${platform === key ? " selected" : ""}`} key={key}>
          <input type="radio" name={`${id}-platform`} value={key} checked={platform === key} onChange={() => choose(key)} />
          <span className="social-platform-symbol" style={{ color: presentation[key].color }} aria-hidden="true"><Icon size={19} /></span>
          <span>{socialPlatformLabels[key]}</span>{platform === key && <Check className="social-platform-selected" size={13} aria-hidden="true" />}
        </label>;
      })}</div>
    </fieldset>
    <div className="social-source-address">
      <label htmlFor={`${id}-address`}>{details?.label ?? "آیدی یا لینک کانال / صفحه"}</label>
      <div className={`social-source-input${showError ? " invalid" : ""}`}><AtSign size={17} aria-hidden="true" /><input ref={input} id={`${id}-address`} type="text" required maxLength={2048} autoCapitalize="none" autoCorrect="off" spellCheck={false} value={value.url} placeholder={details?.example ?? "ابتدا شبکه را انتخاب کنید یا لینک کامل را وارد کنید"} dir="ltr" aria-describedby={`${id}-help${showError ? ` ${id}-error` : ""}`} aria-invalid={showError} onInvalid={() => setTouched(true)} onBlur={() => setTouched(true)} onChange={event => {
        setTouched(false);
        const url = event.target.value;
        onChange({ sourceType: "social", url, ...(platform ? { platform } : detectSocialPlatform(url) ? { platform: detectSocialPlatform(url)! } : {}) });
      }} /></div>
      <p className="social-source-help" id={`${id}-help`}>{details?.hint ?? "شبکه‌های قابل انتخاب در بالا مشخص‌اند. با واردکردن لینک کامل، شبکهٔ مربوط شناسایی می‌شود."}</p>
      {showError && <div className="social-source-error" id={`${id}-error`} role="alert"><span>{message}</span>{mismatch && problem?.detectedPlatform && <button type="button" onClick={() => choose(problem.detectedPlatform!)}>تغییر به {socialPlatformLabels[problem.detectedPlatform]}</button>}</div>}
      {normalized && <div className="social-source-preview" role="status"><CheckCircle2 size={19} aria-hidden="true" /><div><b>{socialPlatformLabels[normalized.platform]} <span>· آدرس منبع</span></b><span dir="ltr">{normalized.url}</span></div></div>}
      {!value.url.trim() && platform && <div className="social-source-empty-hint"><Radio size={15} aria-hidden="true" />آیدی یا لینک را وارد کنید تا آدرس منبع نمایش داده شود.</div>}
    </div>
  </div>;
}
