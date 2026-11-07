"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bot, Inbox, LogOut, Menu, RefreshCw } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import type { DashboardContext, MediaSummary } from "@/lib/contracts/context";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { useMediaOverview } from "./use-media-overview";
import { RequestStatus } from "./request-status";
import { SiteStatus } from "./site-status";
import { AdminSources } from "./admin-sources";
import { AdminEditors } from "./admin-editors";
import type { EditorialWorkspace } from "@/lib/contracts/editorial";
import { AdminInbox } from "./admin-inbox";

export function MediaAdminDashboard({ context, view = "dashboard", editorialWorkspace }: { context: DashboardContext; view?: string; editorialWorkspace?: EditorialWorkspace }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState("");
  const { overview, loading, error, refresh } = useMediaOverview(context.activeMedia.id);
  async function selectMedia(media: MediaSummary) {
    if (media.id === context.activeMedia.id || switching) return;
    setSwitching(media.id); setSwitchError("");
    try { const response = await fetch("/api/v1/media/select", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mediaId: media.id }) }); if (!response.ok) throw new Error(); router.refresh(); }
    catch { setSwitchError("تغییر رسانه انجام نشد؛ دوباره تلاش کنید."); }
    finally { setSwitching(null); }
  }
  const title = view === "editorial" ? "سردبیرهای من" : view === "sources" ? "منابع من" : view === "sites" ? "مدیریت سایت" : view === "inbox" ? "اخبار ورودی" : view === "bots" ? "بات‌های شبکه‌های اجتماعی" : view === "dashboard" ? "وضعیت رسانه" : "قابلیت‌های فاز دوم";
  return <div className="app-shell media-admin-shell">{context.impersonated && <ImpersonationBanner />}<DashboardSidebar open={open} onClose={() => setOpen(false)} context={context} onSelectMedia={selectMedia} switchingMediaId={switching} activeView={view} adminMode inboxEnabled={Boolean(overview?.canReadInbox)} /><main className="main-content"><header className="topbar"><div className="page-intro"><button className="icon-button menu-button" aria-label="باز کردن منو" onClick={() => setOpen(true)}><Menu size={21} /></button><div><span>{context.activeMedia.name}</span><h1>{title}</h1></div></div><div className="admin-header-actions">{view !== "editorial" && <button className="secondary-button" disabled={loading} onClick={() => void refresh().catch(() => {})}><RefreshCw size={15} />تازه‌سازی وضعیت</button>}<button className="icon-button" aria-label="خروج از حساب" title={`خروج از حساب ${context.user.name}`} onClick={async () => { await authClient.signOut(); router.replace("/login"); router.refresh(); }}><LogOut size={18} /></button></div></header>
    <div className="admin-media-content">{(error || switchError) && <p role="alert" className="editorial-feedback error">{error || switchError}</p>}{!overview ? <section className="panel admin-empty" role="status">{error ? "وضعیت رسانه دریافت نشد؛ دوباره تازه‌سازی کنید." : "در حال دریافت وضعیت درخواست رسانه…"}</section> : <>
      {view === "dashboard" ? <><RequestStatus overview={overview} /><div className="admin-overview-grid"><section className="panel admin-source-summary"><h2>دسترسی به منابع</h2><p>{overview.canReadInbox ? `${overview.sources.filter(source => source.accessGranted).length.toLocaleString("fa-IR")} منبع در دسترس شماست.` : "پس از تأیید دسترسی به منابع، اخبار ورودی فعال می‌شود."}</p><Link href="/sources" className="secondary-button">مشاهده و افزودن منابع<ArrowLeft size={15} /></Link>{overview.canReadInbox && <Link href="/inbox" className="admin-inbox-link"><Inbox size={15} />مشاهدهٔ اخبار ورودی</Link>}</section><SiteStatus overview={overview} /></div></> : view === "editorial" ? <AdminEditors key={context.activeMedia.id} initial={editorialWorkspace} canManage={["owner", "admin", "editor"].includes(context.activeMedia.role)} /> : view === "sources" ? <AdminSources key={context.activeMedia.id} overview={overview} refresh={refresh} canAdd={["owner", "admin"].includes(context.activeMedia.role)} /> : view === "sites" ? <SiteStatus overview={overview} /> : view === "inbox" ? overview.canReadInbox ? <AdminInbox key={context.activeMedia.id} /> : <section className="panel admin-empty"><Inbox size={28} /><h2>اخبار ورودی هنوز فعال نشده است</h2><p>ابتدا رسانه و دسترسی به حداقل یک منبع باید تأیید شوند.</p><Link href="/sources" className="secondary-button">مشاهدهٔ وضعیت منابع</Link></section> : <section className="panel admin-empty"><Bot size={28} /><h2>{view === "bots" ? "مدیریت بات‌های شبکه‌های اجتماعی" : "قابلیت‌های تکمیلی رسانه"}</h2><p>این بخش در فاز دوم اضافه می‌شود.</p><Link href="/" className="secondary-button">بازگشت به وضعیت رسانه</Link></section>}
    </>}</div></main></div>;
}

