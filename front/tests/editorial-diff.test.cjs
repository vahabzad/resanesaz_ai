/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner loads the compiled CommonJS utility. */
const assert = require("node:assert/strict");
const test = require("node:test");
const { diffLines } = require("../.data/test-build/editorial-diff.js");
test("version comparison identifies insertions and deletions and reconstructs both Persian texts", () => {
  const before="عنوان پیشین\n\nمتن ثابت\nخط حذف‌شده";
  const after="عنوان تازه\n\nمتن ثابت\nخط افزوده‌شده";
  const result=diffLines(before,after);
  assert.equal(result.filter(v=>v.kind!=="added").map(v=>v.text).join("\n"),before);
  assert.equal(result.filter(v=>v.kind!=="removed").map(v=>v.text).join("\n"),after);
  assert.ok(result.some(v=>v.kind==="same" && v.text==="متن ثابت"));
});
test("long article comparison stays bounded and preserves changed and unchanged edges",()=>{
  const before=Array.from({length:600},(_,i)=>`خط ${i}`).join("\n");
  const after=before.replace("خط 300\n","خط جایگزین\n");
  const result=diffLines(before,after);
  assert.equal(result.filter(v=>v.kind!=="added").map(v=>v.text).join("\n"),before);
  assert.equal(result.filter(v=>v.kind!=="removed").map(v=>v.text).join("\n"),after);
  assert.equal(result.filter(v=>v.kind==="removed").length,1);
});
