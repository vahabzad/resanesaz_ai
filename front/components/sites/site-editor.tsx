"use client";
import { useId, useState } from "react";
import { WorkspaceDialog } from "../workspace-dialog";
import type { MediaSite, SiteSpec, SiteWorkspace } from "@/lib/contracts/sites";

export const defaultSiteSpec: SiteSpec = { title: "رسانهٔ من", tagline: "خبر، با نگاه روشن", language: "fa", accent: "#b62434", layout: "lead", footer: "تمام حقوق این رسانه محفوظ است.", blocks: [{ id: "latest", title: "تازه‌ترین خبرها", sectionIds: [], limit: 8 }] };

export function SiteEditor({ site, sections, busy, error, onClose, onSave }: { site?: MediaSite; sections: SiteWorkspace["sections"]; busy: boolean; error: string; onClose: () => void; onSave: (input: { name: string; slug: string; spec: SiteSpec }) => void }) {
  const formId = useId();
  const [name, setName] = useState(site?.name ?? ""); const [slug, setSlug] = useState(site?.slug ?? "");
  const [spec, setSpec] = useState<SiteSpec>(site?.spec ?? defaultSiteSpec);
  const dirty = name !== (site?.name ?? "") || slug !== (site?.slug ?? "") || JSON.stringify(spec) !== JSON.stringify(site?.spec ?? defaultSiteSpec);
  const patch = (value: Partial<SiteSpec>) => setSpec(previous => ({ ...previous, ...value }));
  const form = <form id={formId} className="panel editorial-settings site-editor-form" onSubmit={event => { event.preventDefault(); onSave({ name, slug, spec }); }}>
    <fieldset disabled={busy} className="service-editor-fields">
      <h3>هویت و نشانی</h3><div className="editorial-settings-grid">
        <label>نام مدیریتی سایت<input required minLength={2} maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>شناسهٔ نشانی سایت<input dir="ltr" required minLength={3} maxLength={64} pattern="[a-z0-9]+(-[a-z0-9]+)*" readOnly={Boolean(site)} value={slug} onChange={e => setSlug(e.target.value)} placeholder="my-news" /><small>نشانی: /s/{slug || "my-news"} · پس از ساخت ثابت است.</small></label>
        <label>عنوان روی سایت<input required minLength={2} maxLength={100} value={spec.title} onChange={e => patch({ title: e.target.value })} /></label>
        <label>توضیح کوتاه<input maxLength={300} value={spec.tagline} onChange={e => patch({ tagline: e.target.value })} /></label>
        <label>زبان سایت<select value={spec.language} onChange={e => patch({ language: e.target.value as SiteSpec["language"] })}><option value="fa">فارسی</option><option value="en">انگلیسی</option><option value="ar">عربی</option></select></label>
        <label>رنگ اصلی<input type="color" value={spec.accent} onChange={e => patch({ accent: e.target.value })} /></label>
      </div>
      <label>چیدمان صفحهٔ اصلی<select value={spec.layout} onChange={e => patch({ layout: e.target.value as SiteSpec["layout"] })}><option value="lead">خبر اصلی برجسته و فهرست خبرها</option><option value="grid">شبکهٔ کارت‌های خبری</option></select></label>
      <h3>بلوک‌های صفحهٔ اصلی</h3><p className="editorial-help">ترتیب بلوک‌ها، ترتیب نمایش آن‌هاست. انتخاب بخش خالی یعنی همهٔ خبرها؛ هر بلوک از کارت وبِ نسخهٔ منتشرشده استفاده می‌کند.</p>
      {spec.blocks.map((block, index) => <section key={block.id} className="site-block-editor"><div className="editorial-toolbar"><strong>بلوک {(index + 1).toLocaleString("fa-IR")}</strong><button type="button" className="secondary-button" disabled={index === 0} onClick={() => { const blocks = [...spec.blocks]; [blocks[index - 1], blocks[index]] = [blocks[index], blocks[index - 1]]; patch({ blocks }); }}>بالاتر</button><button type="button" className="secondary-button" disabled={index === spec.blocks.length - 1} onClick={() => { const blocks = [...spec.blocks]; [blocks[index + 1], blocks[index]] = [blocks[index], blocks[index + 1]]; patch({ blocks }); }}>پایین‌تر</button><button type="button" className="secondary-button editorial-stop" disabled={spec.blocks.length === 1} onClick={() => patch({ blocks: spec.blocks.filter(b => b.id !== block.id) })}>حذف بلوک</button></div>
        <div className="editorial-settings-grid"><label>عنوان بلوک<input required minLength={2} maxLength={80} value={block.title} onChange={e => patch({ blocks: spec.blocks.map(b => b.id === block.id ? { ...b, title: e.target.value } : b) })} /></label><label>تعداد کارت<input type="number" required min={1} max={20} value={block.limit} onChange={e => patch({ blocks: spec.blocks.map(b => b.id === block.id ? { ...b, limit: Number(e.target.value) } : b) })} /></label></div>
        <div className="editorial-option-list">{sections.map(section => <label className="editorial-check" key={section.id}><input type="checkbox" checked={block.sectionIds.includes(section.id)} onChange={() => patch({ blocks: spec.blocks.map(b => b.id === block.id ? { ...b, sectionIds: b.sectionIds.includes(section.id) ? b.sectionIds.filter(id => id !== section.id) : [...b.sectionIds, section.id] } : b) })} />{section.name}</label>)}{block.sectionIds.filter(id => !sections.some(section => section.id === id)).map(id => <label className="editorial-check" key={id}><input type="checkbox" checked onChange={() => patch({ blocks: spec.blocks.map(b => b.id === block.id ? { ...b, sectionIds: b.sectionIds.filter(value => value !== id) } : b) })} />بخش خارج از دسترس؛ برای حذف انتخاب کنید</label>)}</div>
      </section>)}
      <button type="button" className="secondary-button" disabled={busy || spec.blocks.length >= 8} onClick={() => patch({ blocks: [...spec.blocks, { id: crypto.randomUUID(), title: "خبرهای بیشتر", sectionIds: [], limit: 6 }] })}>افزودن بلوک</button>
      <label>متن پایین سایت<textarea rows={3} maxLength={500} value={spec.footer} onChange={e => patch({ footer: e.target.value })} /></label>
    </fieldset>
  </form>;
  return <WorkspaceDialog title={site ? `طراحی ${site.name}` : "سایت جدید"} context="سایت‌های رسانه · طراحی و قواعد نمایش" dirty={dirty} itemLabel="سایت" discardHelp="برای حفظ طراحی، ادامهٔ ویرایش را انتخاب و پیش‌نویس را ذخیره کنید." busy={busy} error={error} onClose={onClose} footer={close => <><span>ذخیرهٔ طراحی، آن را عمومی نمی‌کند.</span><div><button className="primary-button" type="submit" form={formId} disabled={busy}>ذخیرهٔ پیش‌نویس</button><button className="secondary-button" type="button" disabled={busy} onClick={close}>انصراف</button></div></>}>{form}</WorkspaceDialog>;
}
