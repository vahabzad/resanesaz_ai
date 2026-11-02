"use client";

import { useId, useState } from "react";
import { Check, FilePenLine, Sparkles, Undo2 } from "lucide-react";
import { editorialPromptPresets, type EditorialPromptPair } from "@/lib/editorial-prompt-presets";

export function EditorialPromptPicker({ value, disabled, canUndo, onApply, onUndo }: {
  value: EditorialPromptPair; disabled: boolean; canUndo: boolean; onApply: (pair: EditorialPromptPair) => void; onUndo: () => void;
}) {
  const id = useId();
  const active = editorialPromptPresets.find(preset => preset.instructions === value.instructions && preset.socialInstructions === value.socialInstructions);
  const [selectedId, setSelectedId] = useState(active?.id ?? "custom");
  const [message, setMessage] = useState("");
  const selected = editorialPromptPresets.find(preset => preset.id === selectedId);
  return <section className="editorial-prompt-picker" aria-label="الگوهای پیشنهادی پرامپت">
    <header><div><span><Sparkles size={15} />شروع از الگو یا متن شخصی</span><h3>سبک نگارش این سردبیر را انتخاب کنید</h3><p>ابتدا متن الگو را ببینید؛ پس از اعمال، هر دو پرامپت قابل ویرایش‌اند.</p></div><small>متن فعلی: {active?.title ?? "شخصی / ویرایش‌شده"}</small></header>
    <fieldset className="editorial-preset-options" disabled={disabled}><legend>الگوی پیشنهادی</legend>{editorialPromptPresets.map(preset => <label className={selectedId === preset.id ? "selected" : ""} key={preset.id}><input type="radio" name={`${id}-preset`} checked={selectedId === preset.id} onChange={() => { setSelectedId(preset.id); setMessage(""); }} /><span><b>{preset.title}</b><small>{preset.description}</small></span>{active?.id === preset.id && <Check size={14} aria-label="متن فعلی مطابق این الگو است" />}</label>)}<label className={`custom ${selectedId === "custom" ? "selected" : ""}`}><input type="radio" name={`${id}-preset`} checked={selectedId === "custom"} onChange={() => { setSelectedId("custom"); setMessage(""); }} /><span><b><FilePenLine size={14} />پرامپت شخصی از ابتدا</b><small>متن خبر و شبکهٔ اجتماعی را خودتان بنویسید.</small></span></label></fieldset>
    {selected ? <div className="editorial-preset-preview"><b>پیش‌نمایش الگوی «{selected.title}»</b><details><summary>مشاهدهٔ متن کامل پرامپت خبر</summary><p>{selected.instructions}</p></details><details><summary>مشاهدهٔ متن کامل پرامپت شبکهٔ اجتماعی</summary><p>{selected.socialInstructions}</p></details></div> : <p className="editorial-preset-custom-help">با «شروع متن شخصی»، هر دو کادر خالی می‌شوند تا دستور خبر و پیام اجتماعی خودتان را بنویسید. متن خالی قابل ذخیره یا اجرای نمونه نیست.</p>}
    <p className="editorial-preset-replace-note">اعمال این انتخاب، فقط دو پرامپت سردبیر فعلی را جایگزین می‌کند. زبان، نام و محدودهٔ منابع و دسته‌ها حفظ می‌شوند؛ متن قبلی قابل بازگردانی است.</p>
    <div className="editorial-preset-actions"><button type="button" className="primary-button" disabled={disabled} onClick={() => { onApply(selected ? { instructions: selected.instructions, socialInstructions: selected.socialInstructions } : { instructions: "", socialInstructions: "" }); setMessage(selected ? `الگوی «${selected.title}» اعمال شد؛ متن‌ها را در کادرهای زیر ویرایش کنید.` : "کادرها برای نوشتن پرامپت شخصی آماده‌اند."); }}>{selected ? <Sparkles size={14} /> : <FilePenLine size={14} />}{selected ? "اعمال این الگو و ویرایش متن" : "شروع متن شخصی"}</button>{canUndo && <button type="button" className="secondary-button" disabled={disabled} onClick={() => { onUndo(); setMessage("متن‌های پیش از آخرین اعمال بازگردانده شدند."); }}><Undo2 size={14} />بازگرداندن متن قبلی</button>}</div>
    {message && <p className="editorial-preset-message" role="status">{message}</p>}
    <small className="editorial-preset-save-note">انتخاب کارت به‌تنهایی متن را تغییر نمی‌دهد؛ ثبت نهایی با «ذخیرهٔ سردبیرها و ادامه» انجام می‌شود.</small>
  </section>;
}
