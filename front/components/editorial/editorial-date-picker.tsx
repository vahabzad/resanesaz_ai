"use client";

import { useState } from "react";
import { calendarDate, calendarDay, calendarMonth, fromTehranLocal, localDay, selectCalendarDay, tehranLocal, type CalendarMode } from "@/lib/editorial-calendar";

const months = {
  persian: ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"],
  gregory: ["ژانویه", "فوریه", "مارس", "آوریل", "مه", "ژوئن", "ژوئیه", "اوت", "سپتامبر", "اکتبر", "نوامبر", "دسامبر"],
};

export function EditorialDatePicker({ value, disabled, onChange, label = "تاریخ دریافت از", timeLabel = "ساعت دریافت از (به وقت تهران)" }: { value: string; disabled: boolean; onChange: (value: string) => void; label?: string; timeLabel?: string }) {
  const [calendar, setCalendar] = useState<CalendarMode>("persian");
  const [anchor, setAnchor] = useState(() => localDay(value));
  const [error, setError] = useState("");
  const month = calendarMonth(anchor, calendar);
  const selected = localDay(value);
  const selection = calendarDate(selected, calendar);
  const local = tehranLocal(value);
  function changeDay(day: number) {
    const next = selectCalendarDay(day, value);
    if (next) { setError(""); onChange(next); }
    else setError("این ساعت در تاریخ انتخابی به وقت تهران معتبر نیست؛ ساعت دیگری انتخاب کنید.");
  }
  return <div className="editorial-date-picker">
    <label>نمایش تقویم<select aria-label="نمایش تقویم" disabled={disabled} value={calendar} onChange={e => { setCalendar(e.target.value as CalendarMode); setAnchor(selected); }}><option value="persian">شمسی</option><option value="gregory">میلادی</option></select></label>
    <fieldset disabled={disabled} className="editorial-calendar"><legend>{label} · {calendar === "persian" ? "شمسی" : "میلادی"}</legend>
      <div className="editorial-calendar-header">
        <button type="button" className="secondary-button" aria-label="ماه قبل" onClick={() => setAnchor(month.first - 1)}>‹</button>
        <select aria-label="ماه تقویم" value={month.month} onChange={e => { const next = calendarDay(month.year, Number(e.target.value), 1, calendar); if (next !== null) setAnchor(next); }}>{months[calendar].map((name, i) => <option key={name} value={i + 1}>{name}</option>)}</select>
        <input key={`${calendar}:${month.year}`} aria-label="سال تقویم" type="number" min={1000} max={9999} defaultValue={month.year} onBlur={e => { const next = calendarDay(Number(e.target.value), month.month, 1, calendar); if (next !== null) setAnchor(next); else e.target.value = String(month.year); }} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} />
        <button type="button" className="secondary-button" aria-label="ماه بعد" onClick={() => setAnchor(month.first + month.days.length)}>›</button>
      </div>
      <div className="editorial-calendar-grid">
        {["ش", "ی", "د", "س", "چ", "پ", "ج"].map((name, i) => <span className="editorial-calendar-weekday" key={i} aria-label={["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"][i]}>{name}</span>)}
        {Array.from({ length: month.offset }, (_, i) => <span key={`blank-${i}`} />)}
        {month.days.map((day, i) => <button type="button" key={day} aria-label={`${i + 1} ${months[calendar][month.month - 1]} ${month.year}`} aria-pressed={day === selected} onClick={() => changeDay(day)}>{(i + 1).toLocaleString("fa-IR")}</button>)}
      </div>
      <p className="editorial-calendar-selection" aria-live="polite">انتخاب‌شده: {selection.day.toLocaleString("fa-IR")} {months[calendar][selection.month - 1]} {selection.year.toLocaleString("fa-IR", { useGrouping: false })}</p>
    </fieldset>
    <label>{timeLabel}<input aria-label={timeLabel} type="time" dir="ltr" required step="1" disabled={disabled} defaultValue={local.slice(11)} key={local.slice(0, 10)} onChange={e => {
      const next = fromTehranLocal(`${local.slice(0, 10)}T${e.target.value}`);
      e.target.setCustomValidity(next ? "" : "ساعت معتبر به وقت تهران وارد کنید.");
      if (next) { setError(""); onChange(next); }
    }} /></label>
    {error && <p role="alert" className="editorial-feedback error">{error}</p>}
    <small>تغییر نمایش شمسی و میلادی، تاریخ و ساعت انتخاب‌شده را تغییر نمی‌دهد.</small>
  </div>;
}
