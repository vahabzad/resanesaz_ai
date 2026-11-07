"use client";

import { useEffect, useState } from "react";
import { ArrowUpLeft } from "lucide-react";
import Link from "next/link";
import { apiRequest } from "@/lib/api-client";
import type { InboxArticle, InboxArticleDetail } from "@/lib/contracts/inbox";
import { WorkspaceDialog } from "./workspace-dialog";

export function inboxDate(value: string | null) {
  if (!value) return "نامشخص";
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function InboxArticleDialog({ article, canCreateStory, onClose }: { article: InboxArticle; canCreateStory: boolean; onClose: () => void }) {
  const [detail, setDetail] = useState<InboxArticleDetail | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<InboxArticleDetail>(`/api/v1/articles/${encodeURIComponent(article.id)}`, undefined, undefined, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) { setDetail(result); setError(""); } })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "دریافت متن خبر انجام نشد."); });
    return () => controller.abort();
  }, [article.id, attempt]);
  return <WorkspaceDialog title={article.title} context={`اخبار ورودی · ${article.sourceName}`} dirty={false} loading={!detail && !error} error={error} onClose={onClose}
    footer={close => <><a className="secondary-button" href={article.canonicalUrl} target="_blank" rel="noreferrer">مشاهده در منبع <ArrowUpLeft size={16} /></a><div>{canCreateStory && detail?.status === "new" && <Link className="primary-button" href={`/editorial?rawArticleId=${encodeURIComponent(article.id)}`}>ورود به تحریریه</Link>}<button className="secondary-button" onClick={close}>بستن خبر</button></div></>}>
    {error && <button className="secondary-button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>تلاش دوباره</button>}
    {detail && <article className="inbox-reader">
      <dl className="inbox-reader-meta"><div><dt>منبع</dt><dd>{detail.sourceName}</dd></div><div><dt>انتشار</dt><dd>{inboxDate(detail.publishedAt)}</dd></div><div><dt>دریافت</dt><dd>{inboxDate(detail.ingestedAt)}</dd></div>{detail.author && <div><dt>نویسنده</dt><dd>{detail.author}</dd></div>}</dl>
      {!!detail.categories.length && <div className="inbox-reader-categories">{detail.categories.map(category => <span key={category}>{category}</span>)}</div>}
      {detail.status === "quarantined" && <p className="inbox-reader-warning">این خبر قرنطینه شده است. {detail.quarantineReason || "نیازمند بررسی کیفیت محتواست."}</p>}
      {detail.summary && detail.summary !== detail.content && <p className="inbox-reader-summary" dir="auto">{detail.summary}</p>}
      {detail.content ? <div className="inbox-reader-text" dir="auto">{detail.content}</div> : <p className="inbox-reader-missing">متن کامل این خبر دریافت نشده است. {detail.summary ? "چکیدهٔ موجود در بالا نمایش داده شده است." : "برای خواندن خبر، منبع را باز کنید."}</p>}
    </article>}
  </WorkspaceDialog>;
}
