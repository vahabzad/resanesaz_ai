"use client";

import {
  Activity,
  AlertTriangle,
  Archive,
  Bell,
  Bot,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleGauge,
  Clock3,
  FileCheck2,
  Globe2,
  Inbox,
  LayoutDashboard,
  Menu,
  Newspaper,
  PenLine,
  Plus,
  Radio,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import {
  crawlerHealth,
  destinations,
  editorialQueue,
  newsItems,
  publicationTimeline,
  type Severity,
} from "@/lib/mock-data";

const navGroups = [
  {
    label: "فضای کار",
    items: [
      { label: "داشبورد", icon: LayoutDashboard, active: true },
      { label: "اخبار ورودی", icon: Inbox, count: 24 },
      { label: "میز تحریریه", icon: PenLine, count: 7 },
      { label: "آماده انتشار", icon: FileCheck2, count: 5 },
      { label: "آرشیو", icon: Archive },
    ],
  },
  {
    label: "عملیات رسانه",
    items: [
      { label: "منابع و کراولرها", icon: Radio },
      { label: "انتشار", icon: Send },
      { label: "سایت‌ها", icon: Globe2 },
      { label: "بات‌ها و کانال‌ها", icon: Bot },
    ],
  },
  {
    label: "مدیریت",
    items: [
      { label: "تحلیل عملکرد", icon: CircleGauge },
      { label: "اعضا و دسترسی‌ها", icon: Users },
      { label: "تنظیمات", icon: Settings },
    ],
  },
];

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      <button className={`sidebar-backdrop ${open ? "is-open" : ""}`} onClick={onClose} aria-label="بستن منو" />
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark"><Activity size={20} strokeWidth={2.4} /></div>
          <div>
            <strong>رسانه</strong>
            <span>اتاق فرمان محتوا</span>
          </div>
          <button className="icon-button close-sidebar" onClick={onClose} aria-label="بستن منو"><X size={18} /></button>
        </div>

        <button className="media-switcher">
          <span className="media-avatar">د</span>
          <span className="media-copy"><b>دیدبان فردا</b><small>رسانه فعال</small></span>
          <ChevronDown size={16} />
        </button>

        <nav className="main-nav" aria-label="منوی اصلی">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-label">{group.label}</span>
              {group.items.map((item) => (
                <button className={`nav-item ${item.active ? "active" : ""}`} key={item.label}>
                  <item.icon size={18} strokeWidth={1.9} />
                  <span>{item.label}</span>
                  {item.count ? <small>{item.count.toLocaleString("fa-IR")}</small> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-status">
          <div className="system-ring"><ShieldCheck size={18} /></div>
          <div><b>سامانه پایدار است</b><span>آخرین بررسی همین حالا</span></div>
          <span className="live-dot" />
        </div>
      </aside>
    </>
  );
}

function Trend({ values, tone }: { values: number[]; tone: "red" | "green" | "amber" | "blue" }) {
  return (
    <div className={`mini-bars ${tone}`} aria-hidden="true">
      {values.map((value, index) => <i key={`${value}-${index}`} style={{ height: `${value}%` }} />)}
    </div>
  );
}

function KpiCard({
  label,
  value,
  note,
  tone,
  icon: Icon,
  trend,
  direction,
}: {
  label: string;
  value: string;
  note: string;
  tone: "red" | "green" | "amber" | "blue";
  icon: typeof Inbox;
  trend: number[];
  direction: "up" | "down" | "flat";
}) {
  return (
    <article className={`kpi-card ${tone}`}>
      <div className="kpi-top"><span>{label}</span><span className="kpi-icon"><Icon size={18} /></span></div>
      <div className="kpi-body">
        <strong>{value}</strong>
        <Trend values={trend} tone={tone} />
      </div>
      <div className={`kpi-note ${direction}`}>
        {direction === "up" ? <TrendingUp size={14} /> : direction === "down" ? <TrendingDown size={14} /> : <Clock3 size={14} />}
        <span>{note}</span>
      </div>
    </article>
  );
}

function StatusPill({ severity, children }: { severity: Severity; children: React.ReactNode }) {
  return <span className={`status-pill ${severity}`}><i />{children}</span>;
}

function SectionHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: string }) {
  return (
    <div className="section-header">
      <div><span>{eyebrow}</span><h2>{title}</h2></div>
      {action ? <button className="text-action">{action}<ChevronLeft size={15} /></button> : null}
    </div>
  );
}

function NewsFeed() {
  const [activeFilter, setActiveFilter] = useState("همه");
  const filters = ["همه", "فوری", "اقتصاد", "جامعه"];
  return (
    <section className="panel news-panel">
      <SectionHeader eyebrow="ورودی زنده" title="رادار خبر" action="مشاهده همه اخبار" />
      <div className="feed-toolbar">
        <div className="filter-tabs">
          {filters.map((filter) => <button key={filter} className={activeFilter === filter ? "active" : ""} onClick={() => setActiveFilter(filter)}>{filter}</button>)}
        </div>
        <span className="refresh-note"><span className="live-dot" />به‌روزرسانی زنده</span>
      </div>
      <div className="news-list">
        {newsItems.map((item) => (
          <article className="news-item" key={item.id}>
            <div className="score-ring" style={{ "--score": `${item.completeness * 3.6}deg` } as React.CSSProperties}>
              <span>{item.completeness.toLocaleString("fa-IR")}</span>
            </div>
            <div className="news-copy">
              <div className="news-meta">
                <span className={`category ${item.category === "سیاست" ? "hot" : ""}`}>{item.category}</span>
                <span>{item.source}</span><i />
                <span>{item.occurredAt}</span>
                {item.status === "developing" ? <span className="developing"><Zap size={11} />در حال تحول</span> : null}
              </div>
              <h3>{item.headline}</h3>
              <div className="source-line"><span>{item.sourceKind}</span><span>شناسه {item.id.replace("raw_", "#")}</span></div>
            </div>
            <button className="row-action" aria-label={`باز کردن ${item.headline}`}><ChevronLeft size={19} /></button>
          </article>
        ))}
      </div>
    </section>
  );
}

function EditorialQueue() {
  return (
    <section className="panel editorial-panel">
      <SectionHeader eyebrow="کارهای امروز" title="صف تحریریه" action="ورود به میز تحریریه" />
      <div className="editorial-list">
        {editorialQueue.map((item) => (
          <article className="editorial-row" key={item.id}>
            <div className={`avatar ${item.initials === "AI" ? "ai" : ""}`}>{item.initials === "AI" ? <Sparkles size={16} /> : item.initials}</div>
            <div className="editorial-copy">
              <h3>{item.headline}</h3>
              <span>{item.assignee}</span>
            </div>
            <StatusPill severity={item.severity}>{item.stage}</StatusPill>
            <span className={`deadline ${item.severity}`}><Clock3 size={14} />{item.deadline}</span>
            <button className="row-action" aria-label="باز کردن وظیفه"><ChevronLeft size={18} /></button>
          </article>
        ))}
      </div>
    </section>
  );
}

function DestinationIcon({ kind }: { kind: "website" | "telegram" | "social" }) {
  if (kind === "website") return <Globe2 size={19} />;
  if (kind === "telegram") return <Send size={19} />;
  return <Newspaper size={19} />;
}

function Distribution() {
  return (
    <section className="panel distribution-panel">
      <SectionHeader eyebrow="مقصدهای فعال" title="شبکه انتشار" action="مدیریت مقصدها" />
      <div className="destination-grid">
        {destinations.map((item) => (
          <article className="destination-card" key={item.id}>
            <div className={`destination-icon ${item.kind}`}><DestinationIcon kind={item.kind} /></div>
            <div className="destination-copy"><b>{item.name}</b><span dir="ltr">{item.destination}</span></div>
            <span className={`health-label ${item.status}`}><i />{item.status === "healthy" ? "متصل" : item.status === "delayed" ? "با تأخیر" : "خطا"}</span>
            <div className="destination-stats"><span>آخرین انتشار <b>{item.lastPublishedAt}</b></span><span>در صف <b>{item.queue.toLocaleString("fa-IR")}</b></span></div>
          </article>
        ))}
      </div>
    </section>
  );
}

function CrawlerHealth() {
  return (
    <section className="panel compact-panel">
      <SectionHeader eyebrow="دریافت محتوا" title="سلامت کراولرها" action="جزئیات" />
      <div className="crawler-summary">
        <div className="health-gauge"><strong>۹۲٪</strong><span>پایدار</span></div>
        <div><b>۳۱ منبع فعال</b><span>۸۴ خبر در یک ساعت اخیر</span></div>
      </div>
      <div className="crawler-list">
        {crawlerHealth.map((crawler) => (
          <div className="crawler-row" key={crawler.id}>
            <span className={`health-dot ${crawler.status}`} />
            <div><b>{crawler.name}</b><span>{crawler.lastRun}</span></div>
            <strong>{crawler.count.toLocaleString("fa-IR")}</strong>
          </div>
        ))}
      </div>
      <button className="warning-action"><AlertTriangle size={16} />کراولر خبرگزاری فارس نیاز به بررسی دارد<ChevronLeft size={16} /></button>
    </section>
  );
}

function PublishTimeline() {
  return (
    <section className="panel compact-panel timeline-panel">
      <SectionHeader eyebrow="امروز" title="خط انتشار" action="تقویم کامل" />
      <div className="timeline-list">
        {publicationTimeline.map((item) => (
          <article className={`timeline-item ${item.status}`} key={item.id}>
            <time>{item.time}</time>
            <span className="timeline-node">{item.status === "published" ? <Check size={12} /> : item.status === "failed" ? <X size={12} /> : <Clock3 size={12} />}</span>
            <div><b>{item.label}</b><span>{item.destinations}</span></div>
          </article>
        ))}
      </div>
      <button className="outline-button"><CalendarClock size={16} />زمان‌بندی انتشار جدید</button>
    </section>
  );
}

export function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="main-content">
        <header className="topbar">
          <div className="page-intro">
            <button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} aria-label="باز کردن منو"><Menu size={21} /></button>
            <div><span>یکشنبه، ۵ مهر ۱۴۰۵</span><h1>صبح بخیر، سارا</h1></div>
          </div>
          <div className="topbar-actions">
            <label className="search-box"><Search size={18} /><input aria-label="جست‌وجو" placeholder="جست‌وجوی خبر، منبع یا عملیات…" /><kbd>⌘ K</kbd></label>
            <button className="icon-button notification-button" aria-label="اعلان‌ها"><Bell size={19} /><span>۳</span></button>
            <button className="primary-button"><Plus size={18} />خبر جدید</button>
            <button className="profile-button"><span>سا</span><div><b>سارا احمدی</b><small>سردبیر ارشد</small></div><ChevronDown size={15} /></button>
          </div>
        </header>

        <div className="dashboard-content">
          <section className="attention-strip">
            <div className="attention-icon"><Zap size={20} fill="currentColor" /></div>
            <div><b>سه تصمیم در انتظار شماست</b><span>یک خبر فوری، یک خطای انتشار و یک درخواست تأیید دسترسی</span></div>
            <button>مرور موارد<ChevronLeft size={16} /></button>
          </section>

          <section className="kpi-grid" aria-label="شاخص‌های کلیدی">
            <KpiCard label="ورودی جدید" value="۲۴۸" note="۱۸٪ بیشتر از دیروز" tone="blue" icon={Inbox} trend={[28, 44, 38, 58, 48, 72, 88]} direction="up" />
            <KpiCard label="نیازمند بررسی" value="۷" note="۳ مورد فوری" tone="red" icon={PenLine} trend={[74, 68, 80, 54, 62, 44, 35]} direction="down" />
            <KpiCard label="زمان‌بندی‌شده" value="۱۲" note="نزدیک‌ترین: ۱۰:۴۵" tone="amber" icon={CalendarClock} trend={[20, 32, 30, 45, 55, 70, 66]} direction="flat" />
            <KpiCard label="انتشار موفق" value="۹۸٫۴٪" note="۱٫۲٪ بهبود این هفته" tone="green" icon={Check} trend={[38, 48, 44, 62, 58, 76, 90]} direction="up" />
          </section>

          <div className="dashboard-grid">
            <div className="primary-column">
              <NewsFeed />
              <EditorialQueue />
              <Distribution />
            </div>
            <aside className="insight-column">
              <CrawlerHealth />
              <PublishTimeline />
              <section className="brief-card">
                <div className="brief-icon"><Sparkles size={20} /></div>
                <span>خلاصهٔ هوشمند شیفت</span>
                <h2>ریتم خبر امروز ۲۱٪ سریع‌تر از میانگین هفتگی است.</h2>
                <p>حجم اخبار اقتصادی رو به افزایش است؛ پیشنهاد می‌شود یک ویراستار دیگر به این سرویس اضافه شود.</p>
                <button>مشاهده تحلیل کامل<ChevronLeft size={16} /></button>
              </section>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
