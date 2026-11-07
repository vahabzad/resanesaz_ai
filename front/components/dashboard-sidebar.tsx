"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Activity, Archive, Bot, Check, ChevronDown, CircleGauge, FileCheck2, Globe2, Inbox, LayoutDashboard, LoaderCircle, PenLine, Plus, Radio, Send, Settings, ShieldCheck, Users, X } from "lucide-react";
import type { DashboardContext, MediaRole, MediaSummary } from "@/lib/contracts/context";
const navGroups: { label: string; items: { label: string; icon: typeof LayoutDashboard; href: string; view: string; count?: number }[] }[] = [
  {
    label: "فضای کار",
    items: [
      { label: "داشبورد", icon: LayoutDashboard, href: "/", view: "dashboard" },
      { label: "اخبار ورودی", icon: Inbox, href: "/inbox", view: "inbox" },
      { label: "میز تحریریه", icon: PenLine, href: "/editorial", view: "editorial" },
      { label: "آماده انتشار", icon: FileCheck2, href: "/ready", view: "ready" },
      { label: "آرشیو", icon: Archive, href: "#", view: "archive" },
    ],
  },
  {
    label: "عملیات رسانه",
    items: [
      { label: "منابع و کراولرها", icon: Radio, href: "/sources", view: "sources" },
      { label: "انتشار", icon: Send, href: "/publishing", view: "publishing" },
      { label: "سایت‌ها", icon: Globe2, href: "/sites", view: "sites" },
      { label: "بات‌ها و کانال‌ها", icon: Bot, href: "#", view: "bots" },
    ],
  },
  {
    label: "مدیریت",
    items: [
      { label: "تحلیل عملکرد", icon: CircleGauge, href: "#", view: "analytics" },
      { label: "اعضا و دسترسی‌ها", icon: Users, href: "#", view: "members" },
      { label: "تنظیمات", icon: Settings, href: "#", view: "settings" },
    ],
  },
];

export const roleLabels: Record<MediaRole, string> = {
  owner: "مالک رسانه",
  admin: "مدیر رسانه",
  editor: "سردبیر",
  journalist: "خبرنگار",
  publisher: "مسئول انتشار",
  viewer: "مشاهده‌گر",
};

export function DashboardSidebar({
  open,
  onClose,
  context,
  onSelectMedia,
  switchingMediaId,
  activeView,
  adminMode = false,
  inboxEnabled = false,
}: {
  open: boolean;
  onClose: () => void;
  context: DashboardContext;
  onSelectMedia: (media: MediaSummary) => void;
  switchingMediaId: string | null;
  activeView: string;
  adminMode?: boolean;
  inboxEnabled?: boolean;
}) {
  const [mediaMenuOpen, setMediaMenuOpen] = useState(false);

  return (
    <>
      <button className={`sidebar-backdrop ${open ? "is-open" : ""}`} onClick={onClose} aria-label="بستن منو" />
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        {context.isPlatformAdmin ? <Link className="platform-entry" href="/platform/sources"><ShieldCheck size={16} />مدیریت پلتفرم و کراولرها</Link> : null}
        <div className="brand-row">
          <div className="brand-mark"><Activity size={20} strokeWidth={2.4} /></div>
          <div>
            <strong>رسانه</strong>
            <span>اتاق فرمان محتوا</span>
          </div>
          <button className="icon-button close-sidebar" onClick={onClose} aria-label="بستن منو"><X size={18} /></button>
        </div>

        <div className="media-switcher-wrap">
          <button className="media-switcher" onClick={() => setMediaMenuOpen((value) => !value)} aria-expanded={mediaMenuOpen}>
            <span className="media-avatar">{context.activeMedia.logo ? <Image src={context.activeMedia.logo} width={32} height={32} alt="" unoptimized /> : context.activeMedia.name.slice(0, 1)}</span>
            <span className="media-copy"><b>{context.activeMedia.name}</b><small>{roleLabels[context.activeMedia.role]}</small></span>
            <ChevronDown className={mediaMenuOpen ? "is-open" : ""} size={16} />
          </button>
          {mediaMenuOpen ? (
            <div className="media-menu">
              <span>تغییر رسانه</span>
              {context.media.map((item) => (
                <button
                  className={item.id === context.activeMedia.id ? "active" : ""}
                  disabled={switchingMediaId !== null}
                  key={item.id}
                  onClick={() => {
                    onSelectMedia(item);
                    setMediaMenuOpen(false);
                  }}
                >
                  <i>{item.logo ? <Image src={item.logo} width={28} height={28} alt="" unoptimized /> : item.name.slice(0, 1)}</i>
                  <span><b>{item.name}</b><small>{roleLabels[item.role]}</small></span>
                  {switchingMediaId === item.id ? <LoaderCircle className="spin" size={14} /> : item.id === context.activeMedia.id ? <Check size={14} /> : null}
                </button>
              ))}
              <Link className="media-menu-create" href="/media/create?new=1" onClick={() => setMediaMenuOpen(false)}><Plus size={15} />ساخت رسانهٔ جدید</Link>
            </div>
          ) : null}
        </div>

        <nav className="main-nav" aria-label="منوی اصلی">
          {adminMode ? <div className="nav-group">{[
            { label: "داشبورد (وضعیت)", href: "/", view: "dashboard", icon: LayoutDashboard },
            { label: "اخبار ورودی", href: "/inbox", view: "inbox", icon: Inbox, disabled: !inboxEnabled },
            { label: "سردبیرهای من", href: "/editorial", view: "editorial", icon: PenLine },
            { label: "منابع من", href: "/sources", view: "sources", icon: Radio },
            { label: "مدیریت سایت", href: "/sites", view: "sites", icon: Globe2 },
            { label: "بات‌های شبکه‌های اجتماعی", href: "/bots", view: "bots", icon: Bot, phaseTwo: true },
          ].map(item => item.disabled ? <span className="nav-item admin-nav-disabled" key={item.view} aria-disabled="true" title="پس از تأیید دسترسی به منابع فعال می‌شود"><item.icon size={18} /><span>{item.label}</span><small>پس از تأیید</small></span> : <Link className={`nav-item ${item.view === activeView ? "active" : ""}`} href={item.href} key={item.view} onClick={onClose} aria-current={item.view === activeView ? "page" : undefined}><item.icon size={18} /><span>{item.label}</span>{item.phaseTwo && <small>فاز دوم</small>}</Link>)}</div> : navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-label">{group.label}</span>
              {group.items.map((item) => (
                <Link className={`nav-item ${item.view === activeView ? "active" : ""}`} href={item.href} key={item.label} onClick={onClose}>
                  <item.icon size={18} strokeWidth={1.9} />
                  <span>{item.label}</span>
                  {item.count ? <small>{item.count.toLocaleString("fa-IR")}</small> : null}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {!adminMode && <div className="sidebar-status">
          <div className="system-ring"><ShieldCheck size={18} /></div>
          <div><b>وضعیت سامانه</b><span>از این صفحه دریافت نمی‌شود</span></div>
        </div>}
      </aside>
    </>
  );
}


