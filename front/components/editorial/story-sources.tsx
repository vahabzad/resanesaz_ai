"use client";
import { useState } from "react";
import type { EditorialDetail, EditorialVersion } from "@/lib/contracts/editorial";
import { apiRequest } from "@/lib/api-client";

type Candidate = {id:string;title:string;sourceName:string};
export function StorySources({ detail, version, editable, busy, change, run }: { detail:EditorialDetail; version:EditorialVersion; editable:boolean; busy:boolean; change:(body:{rawArticleId?:string;sourceId?:string})=>Promise<void>; run:(action:()=>Promise<void>)=>Promise<void> }) {
  const [candidates,setCandidates]=useState<Candidate[]>([]); const [query,setQuery]=useState(""); const [loaded,setLoaded]=useState(false);
  const active = detail.sources.filter(s => version.sourceIds.includes(s.id));
  return <section className="editorial-provenance"><h4>منابع نسخهٔ {version.revision}</h4><p className="editorial-help">اتصال یا قطع منبع نسخهٔ تازه و نیازمند تأیید می‌سازد؛ متن خبر خودکار ادغام نمی‌شود و باید آن را بازبینی کنید.</p>{active.map(s => <article className="editorial-candidate" key={s.id}><div><b dir="auto">{s.snapshot.title}</b><small>{s.snapshot.sourceName}</small></div>{editable && <button className="secondary-button" disabled={busy || active.length <= 1} onClick={() => void change({sourceId:s.id})}>قطع اتصال منبع</button>}</article>)}
    {editable && <><button className="secondary-button" disabled={busy} onClick={() => void run(async () => { setCandidates(await apiRequest<Candidate[]>(`/api/v1/editorial/sections/${version.sectionId}/articles`)); setLoaded(true); })}>انتخاب منبع دیگر از صندوق</button>{loaded && <><label>جست‌وجوی خبر منبع<input value={query} onChange={e=>setQuery(e.target.value)} /></label>{candidates.filter(c => c.title.toLowerCase().includes(query.toLowerCase()) && !active.some(s=>s.rawArticleId===c.id)).map(c=><article className="editorial-candidate" key={c.id}><div><b dir="auto">{c.title}</b><small>{c.sourceName}</small></div><button className="secondary-button" disabled={busy} onClick={()=>void change({rawArticleId:c.id})}>اتصال به همین خبر</button></article>)}<small>۵۰ خبر سالم اخیر منطبق با ورودی سرویس.</small></>}</>}
  </section>;
}
