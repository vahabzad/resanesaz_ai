"use client";

import { useSearchParams } from "next/navigation";

export type EditorialTab = "stories" | "queue" | "services";
const tabs: { id: EditorialTab; label: string }[] = [{ id: "stories", label: "خبرهای تحریریه" }, { id: "queue", label: "صف تولید" }, { id: "services", label: "سرویس‌ها" }];

export function useEditorialTab() {
  const query = useSearchParams();
  const value = query.get("tab");
  const active: EditorialTab = value === "queue" || value === "services" ? value : "stories";
  function change(tab: EditorialTab) {
    const next = new URL(window.location.href);
    if (tab === "stories") next.searchParams.delete("tab"); else next.searchParams.set("tab", tab);
    window.history.pushState(null, "", `${next.pathname}${next.search}${next.hash}`);
  }
  return { active, change };
}

export function WorkspaceTabs({ active, change, openCount, failedCount, serviceCount }: { active: EditorialTab; change: (tab: EditorialTab) => void; openCount: number | null; failedCount: number | null; serviceCount: number }) {
  return <div className="editorial-workspace-tabs" role="tablist" aria-label="بخش‌های میز تحریریه" onKeyDown={event => {
    const index = tabs.findIndex(tab => tab.id === active);
    let next = index;
    if (event.key === "ArrowLeft") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowRight") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault(); change(tabs[next].id); document.getElementById(`editorial-tab-${tabs[next].id}`)?.focus();
  }}>
    {tabs.map(tab => <button key={tab.id} type="button" role="tab" id={`editorial-tab-${tab.id}`} aria-controls={`editorial-panel-${tab.id}`} aria-selected={active === tab.id} tabIndex={active === tab.id ? 0 : -1} onClick={() => { if (active !== tab.id) change(tab.id); }}>
      <span>{tab.label}</span>
      {tab.id === "queue" && openCount !== null && <span className="editorial-tab-count" aria-label={`${openCount} کار باز`}>{openCount.toLocaleString("fa-IR")}</span>}
      {tab.id === "queue" && Boolean(failedCount) && <span className="editorial-tab-count error" aria-label={`${failedCount} کار ناموفق`}>{failedCount!.toLocaleString("fa-IR")} خطا</span>}
      {tab.id === "services" && <span className="editorial-tab-count">{serviceCount.toLocaleString("fa-IR")}</span>}
    </button>)}
  </div>;
}
