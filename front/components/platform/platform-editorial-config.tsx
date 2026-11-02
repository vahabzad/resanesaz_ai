"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, Save, ShieldCheck, Info } from "lucide-react";
import type { PlatformContext } from "@/lib/contracts/context";
import { defaultPlatformEditorialInstructions, type EditorialFaction, type PlatformEditorialConfig } from "@/lib/contracts/editorial-settings";
import { apiRequest } from "@/lib/api-client";
import { PlatformShell } from "./platform-shell";
import { EditorialProfileEditor } from "./editorial-profile-editor";
import { EditorialProfileList } from "./editorial-profile-list";

const profileValues = (items: EditorialFaction[]) => JSON.stringify(items.map(({ id, name, viewpoint, enabled }) => ({ id, name, viewpoint, enabled })));
const suggestedProfiles = [
  { name: "خبرمحور و بی‌طرف", viewpoint: "خبر را با زبان خنثی و متوازن روایت کن. واقعیت، ادعا و تحلیل را از هم جدا نگه دار؛ دیدگاه طرف‌ها را با انتساب روشن بازتاب بده و هیچ موضع سیاسی را به‌عنوان واقعیت قطعی عرضه نکن." },
  { name: "مردم‌محور", viewpoint: "خبر را با توجه به اثر آن بر زندگی روزمره، خدمات عمومی و تجربهٔ مردم تنظیم کن. پیامدها و نگرانی‌های شهروندان را برجسته کن، اما فقط وقتی منبع آن را پشتیبانی می‌کند؛ از تعمیم تجربهٔ یک فرد به همهٔ مردم خودداری کن." },
  { name: "حقوق‌محور", viewpoint: "رویداد را از منظر حقوق شهروندی، دادرسی منصفانه، پاسخ‌گویی و آثار قانونی بررسی کن. ادعاها را به گوینده نسبت بده، پاسخ طرف‌های درگیر را در صورت وجود بیاور و اتهام اثبات‌نشده را حکم قطعی جلوه نده." },
  { name: "اصلاح‌طلب", viewpoint: "خبر را با توجه به اصلاح تدریجی، مشارکت مدنی، پاسخ‌گویی نهادها و امکان تغییر سیاست‌ها روایت کن. دیدگاه منتقدان و موافقان را دقیق و با انتساب بیان کن؛ هیچ ادعا یا نقل‌قولی را برای تقویت این زاویه اضافه نکن." },
  { name: "لیبرال و آزادی‌محور", viewpoint: "خبر را با توجه به آزادی‌های فردی، حقوق برابر، حاکمیت قانون و محدودیت قدرت نهادها روایت کن. میان واقعیت و تفسیر ارزشی فرق بگذار و دیدگاه‌های متفاوت را با انتساب روشن و بدون تحریف منعکس کن." },
  { name: "عدالت‌محور و سوسیال‌دموکرات", viewpoint: "خبر را با توجه به عدالت اجتماعی، نابرابری، حقوق کار و دسترسی برابر به خدمات عمومی روایت کن. پیامدهای توزیعی را فقط بر پایهٔ شواهد منبع توضیح بده و از افزودن آمار یا تعمیم بی‌پشتوانه خودداری کن." },
  { name: "اصول‌گرا و محافظه‌کار", viewpoint: "خبر را با توجه به ثبات نهادی، قانون، امنیت عمومی و ارزش‌های دینی و سنتی روایت کن. اختلاف‌نظرها را منصفانه و با انتساب روشن بیاور و از تبدیل ارزش‌ها یا فرض‌ها به واقعیت خبری خودداری کن." },
  { name: "جمهوری‌خواه", viewpoint: "خبر را با توجه به حاکمیت مردم، نهادهای پاسخ‌گو و مشارکت سیاسی روایت کن. دیدگاه‌های مختلف دربارهٔ ساختار حکومت را به صاحبان آن نسبت بده و هیچ ادعای سیاسی را بدون پشتوانهٔ منبع به‌عنوان واقعیت مطرح نکن." },
  { name: "پادشاهی‌خواه / پهلوی‌گرا", viewpoint: "خبر را از زاویهٔ پادشاهی‌خواهی و دیدگاه‌های هوادار خاندان پهلوی قاب‌بندی کن؛ مواضع و نمادهای مرتبط را فقط در صورت حضور در منبع برجسته کن. انتقادها و دیدگاه‌های دیگر را حذف یا تحریف نکن و ادعا، واقعیت و تحلیل را جدا نگه دار." },
  { name: "ملی‌گرا", viewpoint: "خبر را با توجه به منافع ملی، استقلال، هویت و همبستگی ایرانیان روایت کن. دربارهٔ منافع یا پیامدهای ملی فقط بر پایهٔ شواهد منبع بنویس و دیدگاه‌های متفاوت را منصفانه بازتاب بده." },
];

export function PlatformEditorialSettings({ context, initialConfig }: { context: PlatformContext; initialConfig: PlatformEditorialConfig | null }) {
  const [config, setConfig] = useState(initialConfig);
  const [instructions, setInstructions] = useState(initialConfig?.instructions ?? defaultPlatformEditorialInstructions);
  const [factions, setFactions] = useState<EditorialFaction[]>(initialConfig?.factions ?? []);
  const [editing, setEditing] = useState<{ profile: EditorialFaction; isNew: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmReload, setConfirmReload] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const dirty = instructions !== (config?.instructions ?? "") || profileValues(factions) !== profileValues(config?.factions ?? []);
  const enabledCount = factions.filter(profile => profile.enabled).length;

  useEffect(() => {
    if (!dirty) return;
    const preventLoss = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty]);
  useEffect(() => {
    if (!editing && returnFocus.current) {
      returnFocus.current.focus({ preventScroll: true });
      returnFocus.current = null;
    }
  }, [editing]);
  useEffect(() => {
    if (error || message) feedback.current?.scrollIntoView({ block: "nearest" });
  }, [error, message]);

  function edit(profile: EditorialFaction, isNew = false) {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditing({ profile, isNew });
  }
  function changed() { setError(""); setMessage(""); setConfirmReload(false); }
  async function reload() {
    if (busy) return;
    setBusy(true); setError(""); setMessage(""); setConfirmReload(false);
    try {
      const result = await apiRequest<PlatformEditorialConfig | null>("/api/v1/platform/editorial-config");
      setConfig(result); setInstructions(result?.instructions ?? defaultPlatformEditorialInstructions); setFactions(result?.factions ?? []);
      setMessage("آخرین نسخهٔ ثبت‌شده بارگذاری شد.");
    } catch(e) { setError(e instanceof Error ? e.message : "دریافت ناموفق بود؛ تغییرات صفحه حفظ شده‌اند."); }
    finally { setBusy(false); }
  }
  async function save() {
    if (busy || !dirty || editing) return;
    setBusy(true); setError(""); setMessage(""); setConfirmReload(false);
    try {
      const result = await apiRequest<PlatformEditorialConfig>("/api/v1/platform/editorial-config", { expectedRevision: config?.revision ?? 0, instructions, factions });
      setConfig(result); setInstructions(result.instructions); setFactions(result.factions);
      setMessage(`نسخهٔ ${result.revision.toLocaleString("fa-IR")} ثبت شد؛ تنظیمات برای تولید خبرهای تازه در دسترس است.`);
    } catch(e) { setError(e instanceof Error ? e.message : "ذخیره ناموفق بود؛ تغییرات صفحه حفظ شده‌اند."); }
    finally { setBusy(false); }
  }
  function addSuggestedProfiles() {
    const existingNames = new Set(factions.map(profile => profile.name.trim()));
    const additions = suggestedProfiles.filter(profile => !existingNames.has(profile.name)).slice(0, Math.max(0, 30 - factions.length));
    if (!additions.length) {
      setMessage(factions.length >= 30 ? "ظرفیت ۳۰ پروفایل تکمیل است." : "همهٔ دیدگاه‌های پیشنهادی قبلاً اضافه شده‌اند.");
      setError("");
      return;
    }
    setFactions(current => [...current, ...additions.map(profile => ({ ...profile, id: crypto.randomUUID(), enabled: true }))]);
    setError("");
    setConfirmReload(false);
    setMessage(`${additions.length.toLocaleString("fa-IR")} دیدگاه پیشنهادی به فهرست تغییرات اضافه شد؛ برای فعال‌سازی، نسخهٔ جدید را ثبت کنید.`);
  }

  return <PlatformShell context={context} active="editorial" title="تنظیمات پایهٔ تحریریه"><div className="inbox-content editorial-workspace platform-editorial-settings">
    <section className="inbox-heading"><div><span>سیاست نگارش سراسری</span><h2>قواعد تحریریه و پروفایل‌های نگارش</h2><p>قواعد مشترک همهٔ رسانه‌ها و دیدگاه‌های قابل انتخاب را مدیریت کنید.</p></div><span className="settings-scope"><ShieldCheck size={16} />ادمین پلتفرم</span></section>
    <div className="settings-overview"><span>نسخهٔ ثبت‌شده <strong>{config?.revision.toLocaleString("fa-IR") ?? "ثبت نشده"}</strong></span><span><strong>{enabledCount.toLocaleString("fa-IR")}</strong> پروفایل فعال از {factions.length.toLocaleString("fa-IR")}</span>{config && <span>آخرین ثبت: {new Date(config.createdAt).toLocaleString("fa-IR")}</span>}</div>
    <div className="settings-impact"><Info size={18} /><p>تغییرات پس از ثبت نسخهٔ جدید اعمال می‌شوند. نسخه‌ها و سابقهٔ خبرهای قبلی حفظ می‌شوند؛ تنظیم شدت دیدگاه و لحن هر سرویس در اختیار سردبیر است.</p></div>
    {(error || message) && <div ref={feedback}>{error && <p className="editorial-feedback error" role="alert">{error}</p>}{message && <p className="editorial-feedback" role="status">{message}</p>}</div>}
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className="platform-editorial-grid">
        <section className="panel editorial-settings platform-base-rules" aria-labelledby="base-rules-title"><header className="settings-panel-heading"><div><h3 id="base-rules-title">پرامپت پایهٔ تحریریه</h3><p>متن قابل ویرایش که به‌عنوان قواعد مشترک همهٔ رسانه‌ها به مدل داده می‌شود</p></div></header>
          <label htmlFor="base-instructions">متن پرامپت و قواعد عمومی<textarea id="base-instructions" required minLength={20} maxLength={10000} rows={16} disabled={busy} value={instructions} aria-describedby="base-instructions-help" onChange={event => { setInstructions(event.target.value); changed(); }} /></label>
          <div className="settings-field-help"><p id="base-instructions-help">متن بالا همراه زبان خروجی، دیدگاه منتخب، شدت جهت‌گیری، طنز، رسمیت و متن منبع به مدل فرستاده می‌شود. قواعد ثابت حفظ واقعیت و بی‌اعتمادی به دستورهای داخل خبر نیز خودکار به پرامپت اضافه می‌شوند. برای اعمال متن، «ثبت نسخهٔ جدید» را بزنید.</p><span>{instructions.length.toLocaleString("fa-IR")} / ۱۰٬۰۰۰</span></div>
        </section>
        <EditorialProfileList profiles={factions} savedProfiles={config?.factions ?? []} busy={busy} onEdit={edit} onAdd={() => edit({ id: crypto.randomUUID(), name: "", viewpoint: "", enabled: true }, true)} onAddSuggestions={addSuggestedProfiles} onRemove={id => { setFactions(items => items.filter(profile => profile.id !== id)); changed(); }} />
      </div>
      <footer className="settings-save-bar">
        {confirmReload && <div className="settings-reload-confirm" role="alert"><strong>تغییرات ثبت‌نشدهٔ صفحه کنار گذاشته شوند؟</strong><p>بارگذاری مجدد، قواعد و فهرست پروفایل‌ها را با آخرین نسخهٔ ثبت‌شده جایگزین می‌کند.</p><div><button type="button" className="secondary-button editorial-stop" disabled={busy} onClick={() => void reload()}>کنارگذاشتن و بارگذاری</button><button type="button" className="secondary-button" onClick={() => setConfirmReload(false)}>ادامهٔ ویرایش</button></div></div>}
        <div className="settings-save-content"><div role="status"><strong>{busy ? "در حال انجام عملیات…" : dirty ? "تغییرات ثبت‌نشده دارید" : "همهٔ تغییرات ثبت شده‌اند"}</strong><p>{dirty ? "قواعد و پروفایل‌ها با هم در یک نسخه ثبت می‌شوند." : `نسخهٔ ${config?.revision.toLocaleString("fa-IR") ?? "۰"} مبنای تولید خبرهای تازه است.`}</p></div><div className="settings-save-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => dirty ? setConfirmReload(true) : void reload()}><RefreshCw size={16} />بارگذاری مجدد</button><button type="submit" className="primary-button" disabled={busy || !dirty}><Save size={17} />{busy ? "لطفاً صبر کنید…" : "ثبت نسخهٔ جدید"}</button></div></div>
      </footer>
    </form>
    {editing && <EditorialProfileEditor key={editing.profile.id} profile={editing.profile} existingNames={factions.filter(profile => profile.id !== editing.profile.id).map(profile => profile.name.trim())} isNew={editing.isNew} onClose={() => setEditing(null)} onApply={profile => { setFactions(items => editing.isNew ? [...items, profile] : items.map(item => item.id === profile.id ? profile : item)); changed(); setEditing(null); }} />}
  </div></PlatformShell>;
}
