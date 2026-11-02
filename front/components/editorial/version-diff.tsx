import type { EditorialVersion } from "@/lib/contracts/editorial";

import { diffLines } from "@/lib/editorial-diff";

export function VersionDiff({ before, after }: { before: EditorialVersion; after: EditorialVersion }) {
  return <details className="editorial-provenance" open><summary>تغییرات نسخهٔ {before.revision} به {after.revision}</summary><p>علامت − حذف‌شده؛ علامت + افزوده‌شده. مقایسه بر اساس خط و پاراگراف است.</p>{(["title","lead","body"] as const).map(field => <section key={field}><h4>{{title:"عنوان",lead:"لید",body:"متن"}[field]}</h4><div className="editorial-diff">{diffLines(before[field],after[field]).map((line,i) => <div className={line.kind} key={i}><span aria-label={line.kind}>{line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}</span><p dir="auto">{line.text || " "}</p></div>)}</div></section>)}</details>;
}
