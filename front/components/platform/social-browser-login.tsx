"use client";

import { useEffect, useState } from "react";
import { Copy, ExternalLink, KeyRound, LoaderCircle, RefreshCw, X } from "lucide-react";
import { WorkspaceDialog } from "../workspace-dialog";
import { apiRequest } from "../../lib/api-client";
import { isSocialPlatform, socialPlatformKeys, socialPlatformLabels, type SocialPlatform } from "../../lib/contracts/social-platforms";
import type { SocialSessionsWorkspace, SocialLoginState } from "../../lib/contracts/social-sessions";
import type { PlatformSourcesWorkspace } from "../../lib/contracts/sources";

const labels: Record<SocialLoginState["status"], string> = { idle: "ورود هنوز آغاز نشده", opening: "در حال بازکردن مرورگر میزبان", open: "پنجرهٔ ورود روی میزبان باز است", closing: "در حال بستن مرورگر", closed: "مرورگر بسته شد؛ دریافت منبع را آزمون کنید", failed: "بازکردن یا ادامهٔ ورود ناموفق بود" };
const errors: Record<string, string> = {
  SOCIAL_PROFILE_BUSY: "نشست مرورگر این شبکه در حال استفاده است؛ پس از پایان دریافت یا بستن پنجرهٔ قبلی دوباره تلاش کنید.",
  SOCIAL_BROWSER_NOT_INSTALLED: "مرورگر روی میزبان پیدا نشد؛ راهنمای راه‌اندازی میزبان را بررسی کنید.",
  SOCIAL_BROWSER_FAILED: "مرورگر میزبان راه‌اندازی نشد یا بسته شد؛ از راهنمای ورود روی میزبان استفاده کنید.",
  SOCIAL_LOGIN_TIMEOUT: "مهلت ۲۰ دقیقه‌ای ورود پایان یافت؛ در صورت نیاز دوباره پنجره را باز کنید.",
};
export function SocialBrowserLogin({ sources, initialPlatform, busy: sourceBusy, sourceError = "", onRetry, onClose }: {
  sources: PlatformSourcesWorkspace["sources"]; initialPlatform?: SocialPlatform; busy: boolean;
  sourceError?: string; onRetry: (sourceId: string) => Promise<void>; onClose: () => void;
}) {
  const [platform, setPlatform] = useState<SocialPlatform>(() => {
    const candidate = initialPlatform ?? sources.find(source => source.lastErrorCode === "AUTH_REQUIRED" && isSocialPlatform(source.adapterKey))?.adapterKey;
    return candidate && isSocialPlatform(candidate) ? candidate : "bale";
  });
  const [workspace, setWorkspace] = useState<SocialSessionsWorkspace | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try { const result = await apiRequest<SocialSessionsWorkspace>("/api/v1/platform/social-browser-sessions"); if (active) setWorkspace(result); }
      catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "دریافت وضعیت ورود انجام نشد."); }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 2000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const state = workspace?.sessions.find(session => session.platform === platform);
  const pending = state && ["opening", "open", "closing"].includes(state.status);
  const relevant = sources.filter(source => source.adapterKey === platform && !source.archivedAt);
  async function action(operation: "open" | "close") {
    setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest<SocialLoginState>(`/api/v1/platform/social-browser-sessions/${platform}/${operation}`, {});
      setWorkspace(await apiRequest<SocialSessionsWorkspace>("/api/v1/platform/social-browser-sessions"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "عملیات ورود انجام نشد."); }
    finally { setBusy(false); }
  }
  const command = `npm run social:login -- ${platform}`;
  return <WorkspaceDialog title="ورود شبکه‌های اجتماعی" context="نشست مشترک دریافت منابع؛ ویژهٔ سوپر ادمین" dirty={false} busy={busy} error={error || sourceError} message={notice} onClose={onClose}>
    <div className="social-login-workspace">
      <div className="social-login-intro"><KeyRound size={24} /><div><h3>یک‌بار ورود برای دریافت منابع هر شبکه</h3><p>کراولر از نشست همین مرورگر برای دریافت کانال‌ها و صفحه‌های آن شبکه استفاده می‌کند. پنجرهٔ ورود روی رایانهٔ میزبان بک‌اند باز می‌شود؛ اگر پنل را از رایانهٔ دیگری می‌بینید، ورود را روی میزبان انجام دهید.</p></div></div>
      <label className="social-login-network">شبکهٔ اجتماعی<select value={platform} disabled={busy} onChange={event => { setPlatform(event.target.value as SocialPlatform); setError(""); setNotice(""); }}>{socialPlatformKeys.map(key => <option key={key} value={key}>{socialPlatformLabels[key]}</option>)}</select></label>
      <ol className="social-login-steps"><li><b>۱ · بازکردن مرورگر</b><span>ورود به {socialPlatformLabels[platform]} را روی میزبان آغاز کنید.</span></li><li><b>۲ · تکمیل ورود در شبکه</b><span>شماره، رمز یا کد تأیید را فقط در پنجرهٔ رسمی همان شبکه وارد کنید.</span></li><li><b>۳ · بستن و آزمون دریافت</b><span>مرورگر را ببندید و دریافت منبع را دوباره آزمایش کنید.</span></li></ol>
      {!workspace ? <p className="platform-muted">در حال دریافت وضعیت میزبان…</p> : <section className="social-login-controls">
        <div className={`social-login-state ${state?.status ?? "idle"}`} role="status">{pending && <LoaderCircle size={16} className="source-run-spinner" />}<b>{labels[state?.status ?? "idle"]}</b></div>
        {state?.errorCode && <p className="platform-error">{errors[state.errorCode] ?? "ورود انجام نشد؛ راهنمای میزبان را بررسی کنید."}</p>}
        <p>بازشدن یا بسته‌شدن پنجره به معنی ورود موفق نیست؛ آزمون دریافت منبع، اعتبار نشست را بررسی می‌کند.</p>
        <div className="social-login-actions"><button className="primary-button" disabled={busy || !!pending || !workspace.interactiveLoginEnabled} onClick={() => void action("open")}><ExternalLink size={15} />ورود به {socialPlatformLabels[platform]} روی میزبان</button>{pending && <button className="secondary-button" disabled={busy || state?.status === "closing"} onClick={() => void action("close")}><X size={15} />بستن مرورگر و ادامه</button>}</div>
        {!workspace.interactiveLoginEnabled && <p>بازکردن مرورگر از پنل روی این میزبان فعال نیست؛ از دستور زیر در محیط گرافیکی میزبان استفاده کنید.</p>}
      </section>}
      <details className="social-login-command"><summary>روش ورود از روی میزبان</summary><p>در پوشهٔ <code dir="ltr">back</code> دستور زیر را اجرا کنید، ورود را در مرورگر کامل کنید و سپس پنجره را ببندید.</p><div><code dir="ltr">{command}</code><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(command); setNotice("دستور ورود کپی شد."); } catch { setNotice("دستور نمایش‌داده‌شده را انتخاب و کپی کنید."); } }}><Copy size={14} />کپی دستور</button></div></details>
      <section className="social-login-source-list"><h3>آزمون دریافت منابع {socialPlatformLabels[platform]}</h3><p>پس از ورود و بستن مرورگر، منبع را دوباره آزمایش کنید. فعال‌سازی و اعطای دسترسی پس از موفقیت آزمون انجام می‌شود.</p>{!relevant.length ? <p className="platform-muted">هنوز منبعی از این شبکه در کاتالوگ ثبت نشده است.</p> : relevant.map(source => <div key={source.id}><div><b>{source.name}</b><span dir="ltr">{source.url}</span>{source.activeRunId ? <small>دریافت در صف یا در حال اجراست</small> : source.lastErrorCode === "AUTH_REQUIRED" ? <small>آخرین دریافت: نشست نیازمند ورود است</small> : source.enabled && source.status === "active" ? <small className="social-login-source-success">آزمون تأیید شده؛ منبع فعال است</small> : source.lastErrorCode ? <small>آخرین آزمون ناموفق بود؛ گزارش اجرا را بررسی کنید.</small> : null}</div><button className="secondary-button" disabled={sourceBusy || busy || !!pending || !!source.activeRunId} onClick={() => void onRetry(source.id)}><RefreshCw size={14} />{source.activeRunId ? "آزمون در حال اجرا" : "آزمون دریافت مجدد"}</button></div>)}</section>
    </div>
  </WorkspaceDialog>;
}
