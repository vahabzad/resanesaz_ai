"use client";

import { ArrowLeft, Bell, ChevronDown, Inbox, LogOut, Menu, PenLine, Plus, Search, Send } from "lucide-react";
import Link from "next/link";
import { DashboardSidebar as Sidebar, roleLabels } from "./dashboard-sidebar";
import { MediaAdminDashboard } from "./media-admin/media-admin-dashboard";
import { useRouter } from "next/navigation";
import { useState, type ComponentProps } from "react";
import { authClient } from "@/lib/auth-client";
import type { DashboardContext, MediaSummary } from "@/lib/contracts/context";
import type { InboxWorkspace } from "@/lib/contracts/inbox";
import type { SourcesWorkspace } from "@/lib/contracts/sources";
import { InboxView } from "@/components/inbox-view";
import { SourcesView } from "@/components/sources-view";
import { SitesView } from "@/components/sites/sites-view";
import { PublicationView } from "@/components/sites/publication-view";
import type { SiteWorkspace, PublicationWorkspace } from "@/lib/contracts/sites";
import { EditorialView } from "@/components/editorial/editorial-view";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { MediaRequestStatus, useMediaRequest } from "@/components/media-request-status";
import type { EditorialWorkspace } from "@/lib/contracts/editorial";

function LegacyDashboard({
  context,
  view = "dashboard",
  sourcesWorkspace,
  inboxWorkspace,
  editorialWorkspace,
  sitesWorkspace,
  publicationWorkspace,
  rawArticleId,
  setupWizardStep = false,
}: {
  context: DashboardContext;
  view?: "dashboard" | "sources" | "inbox" | "editorial" | "ready" | "sites" | "publishing";
  sourcesWorkspace?: SourcesWorkspace;
  inboxWorkspace?: InboxWorkspace;
  editorialWorkspace?: EditorialWorkspace;
  sitesWorkspace?: SiteWorkspace;
  publicationWorkspace?: PublicationWorkspace;
  rawArticleId?: string;
  setupWizardStep?: boolean;
}) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [switchingMediaId, setSwitchingMediaId] = useState<string | null>(null);
  const mediaRequest = useMediaRequest(context.activeMedia.id);
  const firstName = context.user.name.trim().split(/\s+/)[0] || "همکار";
  const initials = context.user.name.trim().split(/\s+/).slice(0, 2).map((part) => part.slice(0, 1)).join("");
  const sectionTitle = view === "sites" ? "سایت‌های رسانه" : view === "publishing" ? "صف انتشار وب" : view === "ready" ? "مخزن آمادهٔ انتشار" : view === "editorial" ? "میز تحریریه" : view === "sources" ? "منابع و کراولرها" : view === "inbox" ? "اخبار ورودی" : `صبح بخیر، ${firstName}`;

  async function selectMedia(media: MediaSummary) {
    if (media.id === context.activeMedia.id || switchingMediaId) return;
    setSwitchingMediaId(media.id);
    const response = await fetch("/api/v1/media/select", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mediaId: media.id }),
    });
    setSwitchingMediaId(null);
    if (response.ok) router.refresh();
  }

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="app-shell">
      {context.impersonated && <ImpersonationBanner />}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} context={context} onSelectMedia={selectMedia} switchingMediaId={switchingMediaId} activeView={view} />
      <main className="main-content">
        <header className="topbar">
          <div className="page-intro">
            <button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} aria-label="باز کردن منو"><Menu size={21} /></button>
            <div><span>{context.activeMedia.name}</span><h1>{sectionTitle}</h1></div>
          </div>
          <div className="topbar-actions">
            {view === "editorial" && context.isPlatformAdmin && <Link className="secondary-button" href="/platform/editorial">تنظیمات پایهٔ تحریریه</Link>}
            <label className="search-box"><Search size={18} /><input aria-label="جست‌وجو" placeholder="جست‌وجوی خبر، منبع یا عملیات…" /><kbd>⌘ K</kbd></label>
            <button className="icon-button notification-button" aria-label="اعلان‌ها"><Bell size={19} /></button>
            {view === "sources" ? <a className="primary-button" href="#add-source"><Plus size={18} />افزودن منبع</a> : <Link className="primary-button" href="/inbox"><Plus size={18} />انتخاب خبر</Link>}
            <div className="profile-wrap">
              <button className="profile-button" onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen}>
                <span>{initials}</span><div><b>{context.user.name}</b><small>{roleLabels[context.activeMedia.role]}</small></div><ChevronDown size={15} />
              </button>
              {profileOpen ? (
                <div className="profile-menu">
                  <div><b>{context.user.name}</b><span dir="ltr">{context.user.email}</span></div>
                  <button onClick={signOut}><LogOut size={15} />خروج امن از حساب</button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <MediaRequestStatus request={mediaRequest.request} error={mediaRequest.error} />
        {setupWizardStep && <div className="media-setup-dashboard-notice"><span><b>مرحلهٔ چهارم از پنج: سایت‌ساز</b><small>طراحی سایت را در همین بخش بسازید یا ویرایش کنید؛ سپس تنظیم بات‌های اجتماعی را ادامه دهید.</small></span><Link className="primary-button" href="/media/create?step=4">ادامهٔ راه‌اندازی رسانه<ArrowLeft size={15} /></Link></div>}

        {view === "sites" && sitesWorkspace ? mediaRequest.request?.status === "approved" ? <SitesView key={context.activeMedia.id} initial={sitesWorkspace} role={context.activeMedia.role} /> : <div className="dashboard-content"><section className="panel media-request-site-gate"><h2>سایت‌ساز پس از تأیید رسانه فعال می‌شود</h2><p>اطلاعات طراحی شما ذخیره شده است. وضعیت و یادداشت بررسی در بالای صفحه نمایش داده می‌شود.</p></section></div> : view === "publishing" && sitesWorkspace && publicationWorkspace ? <PublicationView key={context.activeMedia.id} initial={publicationWorkspace} sites={sitesWorkspace.sites} role={context.activeMedia.role} /> : (view === "editorial" || view === "ready") && editorialWorkspace ? <EditorialView key={`${view}:${context.activeMedia.id}:${rawArticleId ?? ""}`} workspace={editorialWorkspace} readyOnly={view === "ready"} role={context.activeMedia.role} rawArticleId={rawArticleId} /> : view === "sources" && sourcesWorkspace ? <SourcesView workspace={sourcesWorkspace} role={context.activeMedia.role} /> : view === "inbox" && inboxWorkspace ? <InboxView workspace={inboxWorkspace} canCreateStory={["owner", "admin", "editor", "journalist"].includes(context.activeMedia.role)} /> : <div className="dashboard-content">
          <section className="panel" aria-labelledby="dashboard-empty-title">
            <div className="dashboard-empty-content">
              <span className="eyebrow">نمای کلی رسانه</span>
              <h2 id="dashboard-empty-title">دادهٔ داشبورد هنوز از سرویس‌ها دریافت نمی‌شود</h2>
              <p>برای جلوگیری از نمایش آمار و خبرهای ساختگی، این صفحه تا آماده‌شدن API داشبورد فقط مسیرهای عملیاتی موجود را در اختیار شما می‌گذارد.</p>
              <div className="dashboard-empty-actions">
                <Link className="primary-button" href="/inbox"><Inbox size={17} />مشاهدهٔ اخبار ورودی</Link>
                <Link className="secondary-button" href="/editorial"><PenLine size={17} />رفتن به میز تحریریه</Link>
                <Link className="secondary-button" href="/publishing"><Send size={17} />مشاهدهٔ انتشار</Link>
              </div>
            </div>
          </section>
        </div>}
      </main>
    </div>
  );
}

export function Dashboard(props: ComponentProps<typeof LegacyDashboard>) { return props.context.isPlatformAdmin ? <LegacyDashboard {...props} /> : <MediaAdminDashboard context={props.context} view={props.view} />; }


