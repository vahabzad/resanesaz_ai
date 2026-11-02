export type DiffLine = { kind: "same" | "added" | "removed"; text: string };
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n"), b = after.split("\n");
  // Bound memory for long articles; retain identical edges and show the changed block.
  if (a.length * b.length > 200000) {
    let start = 0, end = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    while (end < a.length - start && end < b.length - start && a[a.length-1-end] === b[b.length-1-end]) end++;
    return [...a.slice(0,start).map(text => ({kind:"same" as const,text})), ...a.slice(start,a.length-end).map(text => ({kind:"removed" as const,text})), ...b.slice(start,b.length-end).map(text => ({kind:"added" as const,text})), ...a.slice(a.length-end).map(text => ({kind:"same" as const,text}))];
  }
  const rows = Array.from({length:a.length+1}, () => new Uint32Array(b.length+1));
  for (let i=a.length-1;i>=0;i--) for(let j=b.length-1;j>=0;j--) rows[i][j] = a[i]===b[j] ? rows[i+1][j+1]+1 : Math.max(rows[i+1][j],rows[i][j+1]);
  let i=0,j=0; const output:DiffLine[]=[];
  while(i<a.length || j<b.length) {
    if(i<a.length && j<b.length && a[i]===b[j]) {output.push({kind:"same",text:a[i++]});j++;}
    else if(j<b.length && (i===a.length || rows[i][j+1]>rows[i+1][j])) output.push({kind:"added",text:b[j++]});
    else output.push({kind:"removed",text:a[i++]});
  }
  return output;
}
