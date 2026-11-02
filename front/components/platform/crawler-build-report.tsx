import type { PlatformSourcesWorkspace } from "@/lib/contracts/sources";

export function CrawlerBuildReport({ source }: { source: PlatformSourcesWorkspace["sources"][number] }) {
  const report = source.buildReport;
  return <div className="platform-build-report">
    <small>{source.activeRun?.trigger === "debug" ? source.activeRun.status === "queued" ? "دیباگ در صف؛ هنوز شروع نشده" : "دیباگ با Codex شروع شده است" : source.buildMode === "debug" && source.buildStatus === "failed" ? "دیباگ ناموفق؛ گزارش آزمون را بررسی کنید" : source.status === "building" ? "در حال ساخت و آزمون" : source.buildStatus === "failed" ? "ساخت/آزمون ناموفق؛ نیازمند بازسازی" : source.buildMode === "debug" && source.buildStatus === "active" ? "دیباگ موفق؛ نسخهٔ اصلاح‌شده فعال شد" : report?.passed ? `آزمون تأیید شد · ${report.samples.length.toLocaleString("fa-IR")} نمونه` : "الگوی قدیمی؛ آزمون ساخت ثبت نشده"}</small>
    {report && <details><summary>نتیجهٔ آزمون نسخه</summary><small>{report.discovered.toLocaleString("fa-IR")} لینک · {report.attempts.toLocaleString("fa-IR")} تلاش ساخت</small>{report.samples.map((sample, index) => <div key={`${sample.url}-${index}`}><a href={sample.url} target="_blank" rel="noreferrer">{sample.title ?? "صفحهٔ آزمون"}</a><small>{sample.passed ? "موفق" : "ناموفق"} · {sample.contentLength.toLocaleString("fa-IR")} نویسه {sample.errorCode && `· ${sample.errorCode}`}</small>{sample.categoryStatus && <small className={sample.categoryStatus === "found" ? undefined : "platform-error"}>دسته‌بندی: {sample.categoryStatus === "found" ? sample.categories?.join("، ") : sample.categoryStatus === "missing" ? "استخراج ناموفق؛ نیازمند اصلاح الگو" : "در صفحه پیدا نشد؛ نیازمند بررسی"}</small>}</div>)}</details>}
  </div>;
}
