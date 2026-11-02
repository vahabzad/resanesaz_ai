import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import Image from "next/image";
import { apiRequest } from "@/lib/api-client";
import type { PlatformArticleDetail } from "@/lib/contracts/platform-articles";
import { displayDate } from "./source-catalog";

function ArticleImage({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <p className="platform-muted">تصویر ذخیره‌شده از سایت منبع قابل نمایش نیست.</p> : <Image src={url} alt="تصویر خبر کراول‌شده" width={1000} height={600} unoptimized referrerPolicy="no-referrer" onError={() => setFailed(true)} className="article-preview-image" />;
}

export function ArticleDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [article, setArticle] = useState<PlatformArticleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    void apiRequest<PlatformArticleDetail>(`/api/v1/platform/articles/${encodeURIComponent(id)}`).then((result) => { if (active) setArticle(result); }).catch((error) => { if (active) setError(error instanceof Error ? error.message : "دریافت خبر ناموفق بود."); });
    return () => { active = false; };
  }, [id]);
  return <dialog ref={dialog} className="article-detail-dialog" aria-labelledby="article-detail-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header><h2 id="article-detail-title">{article?.title ?? "خبر کراول‌شده"}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="بستن جزئیات خبر"><X size={20} /></button></header>
    {error ? <p className="platform-error" role="alert">{error}</p> : !article ? <p role="status">در حال دریافت متن و تصاویر ذخیره‌شده…</p> : <>
      <div className="article-preview-meta"><span>{article.sourceName}</span><span>{article.categories.join("، ") || "بدون دسته‌بندی"}</span><span>دریافت: {displayDate(article.ingestedAt)}</span><span>{article.content?.length.toLocaleString("fa-IR") ?? "۰"} نویسه متن</span></div>
      <a href={article.canonicalUrl} target="_blank" rel="noreferrer">مشاهده در سایت منبع</a>
      {article.quarantineReason && <p className="platform-error">قرنطینه: {article.quarantineReason}</p>}
      {article.imageUrl ? <ArticleImage url={article.imageUrl} /> : <p className="platform-muted">تصویر قابل نمایش برای این خبر ذخیره نشده است.</p>}
      <section><h3>متن دریافت‌شده</h3>{article.content ? <div className="article-preview-text" dir="auto">{article.content}</div> : <p className="platform-error">متن کامل برای این خبر ذخیره نشده است.</p>}</section>
      {article.summary && <section><h3>چکیدهٔ دریافت‌شده</h3><p className="article-preview-text" dir="auto">{article.summary}</p></section>}
      {!!article.inlineImageUrls.length && <section><h3>تصاویر داخل متن</h3>{article.inlineImageUrls.map((url) => <ArticleImage key={url} url={url} />)}</section>}
    </>}
  </dialog>;
}
