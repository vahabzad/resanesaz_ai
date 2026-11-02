"use client";
import { useState } from "react";
import type { EditorialRenditions } from "@/lib/contracts/editorial";

function RenditionImage({ url }: { url: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || !/^https?:\/\//i.test(url)) return <p className="editorial-help">تصویر انتخاب نشده است.</p>;
  // Source images have arbitrary hosts; do not proxy untrusted URLs through the server.
  return <figure>{/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={url} alt="تصویر خروجی خبر" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailedUrl(url)} style={{ display:failedUrl===url?"none":undefined,width:"100%",maxHeight:240,objectFit:"contain" }} />
    {failedUrl===url && <p className="editorial-help">تصویر از سایت منبع قابل دریافت نیست؛ آدرس آن حفظ شده است.</p>}
    <figcaption><a href={url} target="_blank" rel="noreferrer">مشاهدهٔ تصویر</a></figcaption>
  </figure>;
}

export function RenditionPreview({ value, editable, change }: { value:EditorialRenditions; editable:boolean; change:(value:EditorialRenditions)=>void }) {
  return <details className="editorial-provenance" open><summary>خروجی‌های همین نسخه برای وب و شبکه‌های اجتماعی</summary><p className="editorial-help">این‌ها پیش‌نمایش محتوا هستند. هر تغییر با نسخهٔ تازه ذخیره و دوباره تأیید می‌شود؛ هنوز به مقصدی ارسال نمی‌شوند.</p><div className="editorial-settings-grid">
    <section><h4>کارت خبر وب</h4><RenditionImage url={value.webCard.imageUrl} /><label>عنوان کارت<input dir="auto" readOnly={!editable} minLength={3} maxLength={200} value={value.webCard.title} onChange={e=>change({...value,webCard:{...value.webCard,title:e.target.value}})} /></label><label>خلاصهٔ کارت<textarea dir="auto" rows={4} readOnly={!editable} maxLength={500} value={value.webCard.summary} onChange={e=>change({...value,webCard:{...value.webCard,summary:e.target.value}})} /></label><label>تصویر کارت<input dir="ltr" readOnly={!editable} type="url" value={value.webCard.imageUrl??""} onChange={e=>change({...value,webCard:{...value.webCard,imageUrl:e.target.value||null}})} /></label></section>
    <section><h4>شبکه‌های اجتماعی</h4><RenditionImage url={value.social.imageUrl} /><label>متن اجتماعی<textarea dir="auto" rows={6} required minLength={3} maxLength={2000} readOnly={!editable} value={value.social.text} onChange={e=>change({...value,social:{...value.social,text:e.target.value}})} /></label><small>{value.social.text.length.toLocaleString("fa-IR")} از ۲۰۰۰ نویسه</small><label>تصویر اجتماعی<input dir="ltr" readOnly={!editable} type="url" value={value.social.imageUrl??""} onChange={e=>change({...value,social:{...value.social,imageUrl:e.target.value||null}})} /></label></section>
  </div><section><h4>صفحهٔ کامل خبر وب</h4><p>عنوان، لید، متن کامل و تصویرِ نسخهٔ اصلی را استفاده می‌کند.</p><article className="editorial-full-preview"><RenditionImage url={value.webFull.imageUrl} /><h3 dir="auto">{value.webFull.title}</h3><p dir="auto">{value.webFull.lead}</p><div className="editorial-body" dir="auto">{value.webFull.body}</div>{value.webFull.imageUrl && <a href={value.webFull.imageUrl} rel="noreferrer" target="_blank">مشاهدهٔ تصویر اصلی</a>}</article></section></details>;
}
