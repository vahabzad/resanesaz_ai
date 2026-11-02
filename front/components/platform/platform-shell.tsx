"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, FileText, LogOut, Menu, ShieldCheck, Tags, Users, X } from "lucide-react";
import type { PlatformContext } from "@/lib/contracts/context";
import { authClient } from "@/lib/auth-client";
import { CodexSdkConnectionStatus } from "./codex-sdk-status";
import { CategoryMappingNotice } from "./category-mapping-notice";

export function PlatformShell({ context, active, title, actions, children }: {
  context: PlatformContext; active: "admins" | "media-requests" | "sources" | "source-requests" | "articles" | "editorial" | "categories" | "category-mappings"; title: string; actions?: ReactNode; children: ReactNode;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  return <div className="app-shell">
    <button className={`sidebar-backdrop ${menuOpen ? "is-open" : ""}`} onClick={() => setMenuOpen(false)} aria-label="بستن منو" />
    <aside className={`sidebar ${menuOpen ? "is-open" : ""}`}>
      <div className="brand-row"><div className="brand-mark"><Activity size={20} /></div><div><strong>رسانه</strong><span>مدیریت پلتفرم</span></div><button className="icon-button close-sidebar" onClick={() => setMenuOpen(false)} aria-label="بستن منو"><X size={18} /></button></div>
      <div className="platform-scope"><ShieldCheck size={20} /><div><b>سوپر ادمین</b><small>مدیریت سراسری سامانه</small></div></div>
      <nav className="platform-nav">
        <Link className={active === "admins" ? "active" : ""} href="/platform/admins" aria-current={active === "admins" ? "page" : undefined}><Users size={18} />ادمین‌ها</Link>
        <Link className={active === "media-requests" ? "active" : ""} href="/platform/media-requests" aria-current={active === "media-requests" ? "page" : undefined}><FileText size={18} />درخواست‌های رسانه</Link>
        <Link className={active === "sources" ? "active" : active === "source-requests" ? "section-active" : ""} href="/platform/sources" aria-current={active === "sources" ? "page" : undefined}><Activity size={18} />منابع و کراولرها</Link>
        <div className="platform-subnav"><Link className={active === "source-requests" ? "active" : ""} href="/platform/sources/requests" aria-current={active === "source-requests" ? "page" : undefined}>درخواست‌های منابع</Link></div>
        <Link className={active === "categories" ? "active" : ""} href="/platform/categories" aria-current={active === "categories" ? "page" : undefined}><Tags size={18} />دسته‌بندی‌ها</Link>
        <Link className={active === "category-mappings" ? "active" : ""} href="/platform/category-mappings" aria-current={active === "category-mappings" ? "page" : undefined}><Tags size={18} />معادل‌سازی دسته‌ها<CategoryMappingNotice /></Link>
        <Link className={active === "articles" ? "active" : ""} href="/platform/articles" aria-current={active === "articles" ? "page" : undefined}><FileText size={18} />اخبار کراول‌شده</Link>
        <Link className={active === "editorial" ? "active" : ""} href="/platform/editorial" aria-current={active === "editorial" ? "page" : undefined}><FileText size={18} />تنظیمات تحریریه</Link>
      </nav>
      <div className="platform-account"><b>{context.user.name}</b><button onClick={async () => { await authClient.signOut(); router.replace("/login"); router.refresh(); }}><LogOut size={16} />خروج از حساب</button></div>
    </aside>
    <main className="main-content"><header className="topbar"><div className="page-intro"><button className="icon-button menu-button" onClick={() => setMenuOpen(true)} aria-label="باز کردن منو"><Menu size={21} /></button><div><span>فضای مدیریت پلتفرم</span><h1>{title}</h1></div></div><div className="topbar-actions"><CodexSdkConnectionStatus />{actions}</div></header>{children}</main>
  </div>;
}
