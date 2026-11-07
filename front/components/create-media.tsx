"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Bot, Building2, Check, Globe2, LogOut, Newspaper, Plus } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { apiRequest } from "@/lib/api-client";
import type { CreatedMedia, CreateMediaInput } from "@/lib/contracts/media";
import type { MediaSetupPreferences, MediaSourceAccessRequest, SourceAccessInput } from "@/lib/contracts/media-setup";
import { resolveSocialSource } from "@/lib/contracts/social-source";
import type { SocialPlatform } from "@/lib/contracts/social-platforms";
import { sourceRequestKey } from "@/lib/contracts/media-setup";
import type { PlatformCategory } from "@/lib/contracts/platform-categories";
import type { MediaSite, SiteSpec, SiteWorkspace } from "@/lib/contracts/sites";
import type { EditorialWorkspace } from "@/lib/contracts/editorial";
import type { ManagedSection } from "@/lib/contracts/editorial-settings";
import { SourceInputFields } from "@/components/media-setup/source-input-fields";
import { SourceList, type SourceListItem } from "@/components/media-setup/source-list";
import { SiteBriefForm } from "@/components/sites/site-brief-form";
import { EditorialPolicySetup, type SetupPolicy } from "@/components/editorial-policy-setup";

const steps = [
  { title: "رسانه و سایت", icon: Globe2 },
  { title: "منابع خبری", icon: Newspaper },
  { title: "تنظیم سردبیر", icon: Newspaper },
  { title: "بات‌های اجتماعی", icon: Bot },
];

export function CreateMedia({
  adminName,
  hasMedia,
  creatingNew,
  activeMediaId,
  activeMediaName,
  activeMediaLogo,
  initialStep,
  initialPreferences,
  categories,
  categoryLoadFailed,
  initialSiteWorkspace,
  initialEditorialWorkspace,
  sourceRequests,
}: {
  adminName: string;
  hasMedia: boolean;
  creatingNew: boolean;
  activeMediaId: string | null;
  activeMediaName: string | null;
  activeMediaLogo: string | null;
  initialStep: number;
  initialPreferences: MediaSetupPreferences | null;
  categories: PlatformCategory[];
  categoryLoadFailed: boolean;
  initialSiteWorkspace: SiteWorkspace | null;
  initialEditorialWorkspace: EditorialWorkspace | null;
  sourceRequests: MediaSourceAccessRequest[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [mediaId, setMediaId] = useState(creatingNew ? null : activeMediaId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<"website" | "social">("website");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourcePlatform, setSourcePlatform] = useState<SocialPlatform>();
  const [sourceCategoryMode, setSourceCategoryMode] = useState<"all" | "selected">("all");
  const [sourceCategoryIds, setSourceCategoryIds] = useState<string[]>([]);
  const [sourceDrafts, setSourceDrafts] = useState<Array<SourceAccessInput & { id: string }>>([]);
  const [sourceEditing, setSourceEditing] = useState(false);
  const [sourceRequestSent, setSourceRequestSent] = useState(false);
  const [removedRequestIds, setRemovedRequestIds] = useState<string[]>([]);
  const [newSavedRequests, setNewSavedRequests] = useState<MediaSourceAccessRequest[]>([]);
  const visibleSourceRequests = [...new Map([...sourceRequests, ...newSavedRequests].map(request => [request.id, request])).values()].filter(request => !removedRequestIds.includes(request.id));
  const [preferences, setPreferences] = useState<MediaSetupPreferences>((!creatingNew && initialPreferences) || { editorialViewpoint: "", sourceSelections: [], socialPlatforms: [], setupCompleted: false });
  const [setupSite, setSetupSite] = useState<MediaSite | undefined>(() => creatingNew ? undefined : initialSiteWorkspace?.sites.find(site => site.status === "draft") ?? initialSiteWorkspace?.sites.find(site => site.status !== "archived" && site.spec.designBrief));
  const [siteToReloadId, setSiteToReloadId] = useState<string | null>(null);
  const [setupEditorialSections, setSetupEditorialSections] = useState<ManagedSection[]>(() => creatingNew ? [] : initialEditorialWorkspace?.sections.filter(section => !section.archived && (section.name === "سیاست راه‌اندازی رسانه" || section.name.startsWith("سردبیر راه‌اندازی · "))) ?? []);

  function goToStep(next: number) {
    setError(null);
    setStep(next);
    router.push("/media/create?step=" + next);
  }

  async function logout() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  function changeSocialPlatform(platform: "bale" | "telegram", checked: boolean) {
    setPreferences((current) => ({
      ...current,
      socialPlatforms: checked
        ? Array.from(new Set([...current.socialPlatforms, platform]))
        : current.socialPlatforms.filter((item) => item !== platform),
    }));
  }

  async function savePreferences(nextPreferences = preferences) {
    setPending(true);
    setError(null);
    try {
      const saved = await apiRequest<MediaSetupPreferences>("/api/v1/media/setup", nextPreferences, "PATCH");
      setPreferences(saved);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ذخیرهٔ تنظیمات انجام نشد.");
      return false;
    } finally {
      setPending(false);
    }
  }

  function addSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let normalizedUrl = sourceUrl.trim();
    let platform = sourcePlatform;
    try { if (sourceType === "social") { const normalized = resolveSocialSource(sourcePlatform, sourceUrl); normalizedUrl = normalized.url; platform = normalized.platform; } }
    catch (error) { setError(error instanceof Error ? error.message : "مشخصات منبع معتبر نیست."); return; }
    const selectedCategoryIds = sourceCategoryMode === "all" ? categories.map((category) => category.id) : sourceCategoryIds;
    if (sourceType === "website" && !selectedCategoryIds.length) {
      setError("برای دریافت دسته‌های مشخص، حداقل یک دسته انتخاب کنید.");
      return;
    }
    if ([...sourceDrafts, ...visibleSourceRequests].some(item => sourceRequestKey(item.url) === sourceRequestKey(normalizedUrl))) {
      setError("این منبع را قبلاً به همین رسانه اضافه کرده‌اید؛ ثبت تکراری ممکن نیست.");
      return;
    }
    const allCategoriesSelected = sourceType === "website" && selectedCategoryIds.length === categories.length;
    setSourceDrafts((current) => [...current, { id: crypto.randomUUID(), sourceType, url: normalizedUrl, ...(sourceType === "social" ? { platform } : {}), ...(sourceType === "website" ? { categoryMode: allCategoriesSelected ? "all" : "selected", categoryIds: allCategoriesSelected ? [] : [...selectedCategoryIds] } : {}) }]);
    setSourceUrl("");
    setError(null);
    setSourceRequestSent(false);
  }

  async function editSource(item: SourceListItem, input: SourceAccessInput) {
    const normalized: SourceAccessInput = { sourceType: input.sourceType, ...(input.sourceType === "social" ? resolveSocialSource(input.platform, input.url) : { url: input.url.trim() }), ...(input.sourceType === "website" ? { categoryMode: input.categoryMode ?? "all", categoryIds: input.categoryMode === "selected" ? input.categoryIds ?? [] : [] } : {}) };
    if ([...sourceDrafts, ...visibleSourceRequests].some(other => other.id !== item.id && sourceRequestKey(other.url) === sourceRequestKey(normalized.url))) throw new Error("این منبع را قبلاً به همین رسانه اضافه کرده‌اید؛ ثبت تکراری ممکن نیست.");
    if (normalized.sourceType === "website" && normalized.categoryMode === "selected" && (!normalized.categoryIds?.length || normalized.categoryIds.some(id => !categories.some(category => category.id === id)))) throw new Error("دسته‌بندی‌های انتخاب‌شده باید در فهرست فعال سوپر ادمین باشند.");
    if (!item.saved) {
      setSourceDrafts(current => current.map(row => row.id === item.id ? { id: row.id, ...normalized } : row));
      return;
    }
    setPending(true);
    try {
      const saved = await apiRequest<MediaSourceAccessRequest>(`/api/v1/media/source-access-requests/${encodeURIComponent(item.id)}`, normalized, "PATCH");
      setNewSavedRequests(current => [...current.filter(row => row.id !== saved.id), saved]);
      if (item.url !== saved.url) {
        try {
          const workspace = await apiRequest<EditorialWorkspace>("/api/v1/editorial");
          setSetupEditorialSections(workspace.sections.filter(section => !section.archived && (section.name === "سیاست راه‌اندازی رسانه" || section.name.startsWith("سردبیر راه‌اندازی · "))));
        } catch { throw new Error("ویرایش منبع ذخیره شد، اما تنظیمات سردبیر دریافت نشد؛ دوباره ذخیره کنید یا صفحه را بارگذاری کنید."); }
      }
      router.refresh();
    } finally { setPending(false); }
  }

  async function removeSavedSource(requestId: string) {
    setPending(true); setError(null);
    try {
      await apiRequest(`/api/v1/media/source-access-requests/${encodeURIComponent(requestId)}`, undefined, "DELETE");
      setRemovedRequestIds(current => [...current, requestId]);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "حذف پیش‌نویس منبع انجام نشد."); }
    finally { setPending(false); }
  }

  async function finishSocialStep() {
    if (await savePreferences({ ...preferences, setupStep: 4, setupCompleted: true })) {
      router.replace("/");
      router.refresh();
    }
  }

  async function submitSourceRequests() {
    if (sourceUrl.trim()) {
      setError("ابتدا لینک واردشده را به فهرست منابع اضافه کنید یا آن را پاک کنید.");
      return;
    }
    const sourceKeys = [...visibleSourceRequests, ...sourceDrafts].map(item => sourceRequestKey(item.url));
    if (new Set(sourceKeys).size !== sourceKeys.length) {
      setError("فهرست منابع دارای لینک تکراری است؛ ابتدا موارد اضافه را حذف کنید.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      for (const draft of sourceDrafts) {
        const saved = await apiRequest<MediaSourceAccessRequest>("/api/v1/media/source-access-requests", { sourceType: draft.sourceType, url: draft.url, ...(draft.platform ? { platform: draft.platform } : {}), ...(draft.sourceType === "website" ? { categoryMode: draft.categoryMode, categoryIds: draft.categoryIds ?? [] } : {}) });
        setNewSavedRequests(current => [...current, saved]);
        setSourceDrafts((current) => current.filter((item) => item.id !== draft.id));
      }
      if (await savePreferences({ ...preferences, sourceSelections: [], setupStep: Math.max(preferences.setupStep ?? 1, 3) })) {
        setSourceRequestSent(sourceDrafts.length > 0);
        goToStep(3);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ارسال درخواست‌های منبع انجام نشد.");
    } finally {
      setPending(false);
    }
  }

  async function saveSetupSite(input: { name: string; slug: string; spec: SiteSpec }) {
    setPending(true);
    setError(null);
    try {
      if (!mediaId) {
        const logoData = input.spec.designBrief?.design.logoMode === "provided" ? input.spec.designBrief.design.logoData : undefined;
        const mediaInput: CreateMediaInput = { name: input.name, logoMode: logoData ? "upload" : "generated", ...(logoData ? { logoData } : {}), editorialViewpoint: preferences.editorialViewpoint };
        const created = await apiRequest<CreatedMedia>("/api/v1/media", mediaInput);
        // Keep the new identity if saving the site fails, so retry cannot create another media.
        setMediaId(created.id);
        window.history.replaceState(null, "", "/media/create?step=1");
      } else {
        const savedPreferences = await apiRequest<MediaSetupPreferences>("/api/v1/media/setup", { ...preferences, name: input.name }, "PATCH");
        setPreferences(savedPreferences);
      }
      let currentSite = setupSite;
      // Recover the saved revision before retrying a write after a failed workspace refresh.
      if (siteToReloadId) {
        const workspace = await apiRequest<SiteWorkspace>("/api/v1/sites");
        currentSite = workspace.sites.find(site => site.id === siteToReloadId);
        if (!currentSite) throw new Error("سایت ذخیره‌شده پیدا نشد؛ صفحه را دوباره بارگذاری کنید.");
        setSetupSite(currentSite);
      }
      const result = await apiRequest<{ id: string }>(currentSite ? `/api/v1/sites/${currentSite.id}` : "/api/v1/sites", currentSite ? { ...input, expectedRevision: currentSite.revision } : input, currentSite ? "PATCH" : "POST");
      setSiteToReloadId(result.id);
      const updated = await apiRequest<SiteWorkspace>("/api/v1/sites");
      const saved = updated.sites.find((site) => site.id === result.id);
      if (!saved) throw new Error("پیش‌نویس سایت ذخیره شد، اما اطلاعات آن دریافت نشد. دوباره تلاش کنید.");
      setSetupSite(saved);
      setSiteToReloadId(null);
      const savedProgress = await apiRequest<MediaSetupPreferences>("/api/v1/media/setup", { ...preferences, setupStep: Math.max(preferences.setupStep ?? 1, 2) }, "PATCH");
      setPreferences(savedProgress);
      setStep(2);
      router.replace("/media/create?step=2");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ذخیرهٔ سایت انجام نشد.");
    } finally {
      setPending(false);
    }
  }

  async function saveEditorialPolicy(policy: SetupPolicy) {
    if (!mediaId) throw new Error("رسانهٔ فعالی برای ذخیرهٔ تنظیمات پیدا نشد.");
    setPending(true); setError(null);
    try {
      const existing = policy.section ?? setupEditorialSections.find(section => section.id === policy.key) ?? setupEditorialSections.find(section => section.name === policy.name);
      const payload = { name: policy.name, settings: policy.settings, parentId: existing?.parentId ?? null, autoEnabled: false, autoIntervalMinutes: existing?.autoIntervalMinutes ?? 10, autoBatchSize: existing?.autoBatchSize ?? 3, startAutoNow: false };
      const saved = existing
        ? await apiRequest<ManagedSection>(`/api/v1/editorial/sections/${existing.id}`, { ...payload, expectedRevision: existing.revision, archived: false, paused: existing.paused }, "PATCH")
        : await apiRequest<ManagedSection>("/api/v1/editorial/sections", payload);
      setSetupEditorialSections(current => [...current.filter(section => section.id !== saved.id), saved]);
      return saved;
    } catch (cause) { const message = cause instanceof Error ? cause.message : "ذخیرهٔ سیاست انجام نشد."; setError(message); throw new Error(message); }
    finally { setPending(false); }
  }

  async function finishEditorialSetup(savedSections: ManagedSection[]) {
    setPending(true); setError(null);
    try {
      const savedIds = new Set(savedSections.map(section => section.id));
      for (const section of setupEditorialSections.filter(item => !savedIds.has(item.id))) {
        const archived = await apiRequest<ManagedSection>(`/api/v1/editorial/sections/${section.id}`, { name: section.name, settings: section.settings, parentId: section.parentId, autoEnabled: false, autoIntervalMinutes: section.autoIntervalMinutes, autoBatchSize: section.autoBatchSize, startAutoNow: false, expectedRevision: section.revision, archived: true, paused: section.paused }, "PATCH");
        setSetupEditorialSections(current => current.filter(item => item.id !== archived.id));
      }
      const savedProgress = await apiRequest<MediaSetupPreferences>("/api/v1/media/setup", { ...preferences, setupStep: 4 }, "PATCH");
      setPreferences(savedProgress);
      goToStep(4);
    } catch (cause) { const message = cause instanceof Error ? cause.message : "ذخیرهٔ فهرست سردبیرها انجام نشد."; setError(message); throw new Error(message); }
    finally { setPending(false); }
  }

  return (
    <div className="media-create-content media-setup-wizard">
      <header className="media-create-brand">
        <div className="brand-mark"><Building2 size={21} /></div>
        <div><b>اتاق فرمان رسانه</b><span>راه‌اندازی رسانه</span></div>
        <div className="media-setup-account"><span>{adminName}</span><button type="button" onClick={() => void logout()}><LogOut size={15} />خروج</button></div>
      </header>

      <nav className="media-setup-steps" aria-label="مراحل راه‌اندازی رسانه">
        {steps.map((item, index) => {
          const number = index + 1;
          const Icon = item.icon;
          return (
            <button key={item.title} type="button" className={step === number ? "active" : step > number ? "complete" : ""} disabled={number > step || pending || sourceEditing} onClick={() => goToStep(number)}>
              <i>{step > number ? <Check size={15} /> : <Icon size={15} />}</i><span><small>مرحلهٔ {number.toLocaleString("fa-IR")}</small><b>{item.title}</b></span>
            </button>
          );
        })}
      </nav>

      <section className="panel media-create-card media-setup-card">
        {step === 1 && (
          <>
            <span className="eyebrow">مرحلهٔ اول از چهار · رسانه و سایت</span>
            <h1>{hasMedia && !creatingNew ? "هویت رسانه و طراحی سایت" : "رسانه و سایت‌تان را بسازید"}</h1>
            <p className="media-create-intro">نام، لوگو و دیدگاه رسانه را همراه با مشخصات سایت در همین مرحله تنظیم کنید؛ سپس منابع خبری و سردبیرها را انتخاب می‌کنید.</p>
            <SiteBriefForm
              mediaLogo={creatingNew ? null : activeMediaLogo}
              categoryCatalog={categories}
              categoryLoadFailed={categoryLoadFailed}
              site={setupSite}
              initialName={creatingNew ? "" : activeMediaName ?? ""}
              busy={pending}
              error={error ?? ""}
              onSave={(input) => void saveSetupSite(input)}
              identityFields={<>
                <label className="site-brief-label">دیدگاه رسانه<textarea name="editorialViewpoint" required minLength={10} maxLength={2000} rows={3} value={preferences.editorialViewpoint} onChange={(event) => setPreferences(current => ({ ...current, editorialViewpoint: event.target.value }))} placeholder="رویکرد رسانه در انتخاب، ویرایش و روایت خبرها را شرح دهید…" /><small className="site-brief-help">این دیدگاه، مبنای رویکرد تحریریه در ویرایش خبرهاست.</small></label>
              </>}
            />
          </>
        )}

        {step === 2 && (
          <>
            <span className="eyebrow">مرحلهٔ دوم · ورودی‌های خبری</span>
            <h1>منابع خبری موردنیاز</h1>
            <p className="media-create-intro">برای هر منبع، لینک و نوع آن را وارد کنید. می‌توانید هر تعداد وب‌سایت یا کانال اجتماعی به فهرست اضافه کنید؛ منابع تا پایان راه‌اندازی پیش‌نویس و قابل حذف‌اند؛ پس از تکمیل مرحلهٔ آخر برای بررسی سوپر ادمین ارسال می‌شوند.</p>
            <section className="media-source-request">
              <form onSubmit={addSource}>
                <SourceInputFields value={{ sourceType, url: sourceUrl, ...(sourcePlatform ? { platform: sourcePlatform } : {}), ...(sourceType === "website" ? { categoryMode: sourceCategoryMode, categoryIds: sourceCategoryIds } : {}) }} categories={categories} disabled={pending || sourceEditing} onChange={input => { setSourceType(input.sourceType); setSourceUrl(input.url); setSourcePlatform(input.platform); setSourceCategoryMode(input.categoryMode ?? "all"); setSourceCategoryIds(input.categoryIds ?? []); }} />
                <button type="submit" className="primary-button" disabled={pending || sourceEditing}><Plus size={15} />افزودن به فهرست منابع</button>
              </form>
              <SourceList
                items={[...visibleSourceRequests.map(request => ({ id: request.id, sourceType: request.sourceType, url: request.url, platform: request.platform ?? undefined, categoryMode: request.categoryMode ?? undefined, categoryIds: request.categoryIds, status: request.status, saved: true })), ...sourceDrafts.map(draft => ({ ...draft, status: "draft" as const, saved: false }))]}
                categories={categories} busy={pending} setupCompleted={preferences.setupCompleted} onEdit={editSource} onEditingChange={setSourceEditing}
                onRemove={item => { if (item.saved) void removeSavedSource(item.id); else setSourceDrafts(current => current.filter(row => row.id !== item.id)); }}
              />
              {sourceRequestSent && <p className="media-source-request-success" role="status">پیش‌نویس منابع ذخیره شد؛ ارسال برای بررسی در پایان راه‌اندازی انجام می‌شود.</p>}
            </section>
            <p className="media-setup-note">ثبت لینک دسترسی ایجاد نمی‌کند. استفاده از منابع پس از بررسی و تأیید سوپر ادمین و راه‌اندازی منبع فعال می‌شود.</p>
            {error && <p className="editorial-feedback error" role="alert">{error}</p>}
            <div className="media-create-form-actions"><button className="secondary-button" disabled={pending || sourceEditing} onClick={() => goToStep(1)}><ArrowRight size={15} />بازگشت</button><button className="primary-button" disabled={pending || sourceEditing} onClick={() => void submitSourceRequests()}>{pending ? "در حال ذخیره…" : "ذخیرهٔ پیش‌نویس منابع و ادامه"}<ArrowLeft size={15} /></button></div>
          </>
        )}

        {step === 3 && (
          <>
            <EditorialPolicySetup workspace={initialEditorialWorkspace} initialSections={setupEditorialSections} requests={visibleSourceRequests} categories={categories} busy={pending} onSavePolicy={saveEditorialPolicy} onFinish={finishEditorialSetup} onBack={() => goToStep(2)} />
          </>
        )}

        {step === 4 && (
          <>
            <div className="media-create-icon"><Bot size={22} /></div>
            <span className="eyebrow">مرحلهٔ چهارم · شبکه‌های اجتماعی</span>
            <h1>بات‌های رسانه را انتخاب کنید</h1>
            <p className="media-create-intro">مشخص کنید رسانه برای کدام سکوها بات می‌خواهد. توکن اتصال در این فرم دریافت نمی‌شود؛ اتصال امن بات‌ها پس از آماده‌شدن مدیریت credential در Backend انجام خواهد شد.</p>
            <div className="media-setup-social-options">
              <label className={preferences.socialPlatforms.includes("bale") ? "selected" : ""}><input type="checkbox" checked={preferences.socialPlatforms.includes("bale")} onChange={(event) => changeSocialPlatform("bale", event.target.checked)} /><i><Bot size={18} /></i><span><b>بات بله</b><small>انتخاب سکوی انتشار بله</small></span>{preferences.socialPlatforms.includes("bale") && <Check size={17} />}</label>
              <label className={preferences.socialPlatforms.includes("telegram") ? "selected" : ""}><input type="checkbox" checked={preferences.socialPlatforms.includes("telegram")} onChange={(event) => changeSocialPlatform("telegram", event.target.checked)} /><i><Bot size={18} /></i><span><b>بات تلگرام</b><small>انتخاب سکوی انتشار تلگرام</small></span>{preferences.socialPlatforms.includes("telegram") && <Check size={17} />}</label>
            </div>
            {error && <p className="editorial-feedback error" role="alert">{error}</p>}
            <div className="media-create-form-actions"><button className="secondary-button" onClick={() => goToStep(3)}><ArrowRight size={15} />بازگشت به سردبیرها</button><button className="primary-button" disabled={pending || !mediaId} onClick={() => void finishSocialStep()}>{pending ? "در حال ذخیره…" : "تکمیل راه‌اندازی، ارسال منابع و ورود"}<ArrowLeft size={15} /></button></div>
          </>
        )}
      </section>
      <footer className="media-create-footer">مرحلهٔ {step.toLocaleString("fa-IR")} از ۴ · اطلاعات هر مرحله با «ذخیره و ادامه» ثبت می‌شود؛ سپس مرحلهٔ بعد باز می‌شود.</footer>
    </div>
  );
}
