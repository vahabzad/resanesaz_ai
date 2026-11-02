"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

type Option = { value: string; label: string };
type Popup = { top: number; left: number; width: number; maxHeight: number };

export function FormSelect({ name, label, options, value = "", required = false, disabled = false, onChange }: {
  name: string; label: string; options: Option[]; value?: string;
  required?: boolean; disabled?: boolean; onChange: (value: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", time: 0 });
  const [popup, setPopup] = useState<Popup | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const open = popup !== null;
  const selected = options.find(option => option.value === value);

  function show(index = Math.max(0, options.findIndex(option => option.value === value))) {
    const element = trigger.current;
    if (!element || element.matches(":disabled") || !options.length) return;
    const rect = element.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const upward = below < 240 && above > below;
    const maxHeight = Math.max(44, Math.min(280, upward ? above : below));
    const height = Math.min(options.length * 44 + 10, maxHeight);
    const width = Math.min(rect.width, window.innerWidth - 16);
    setActive(index);
    setContainer(element.closest("dialog") ?? document.body);
    setPopup({ top: upward ? rect.top - height - 4 : rect.bottom + 4, left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)), width, maxHeight: height });
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || trigger.current?.matches(":disabled")) return;
    onChange(option.value);
    setInvalid(false);
    setPopup(null);
    trigger.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !list.current?.contains(target)) setPopup(null);
    }
    function closeOnScroll(event: Event) {
      if (!list.current?.contains(event.target as Node)) setPopup(null);
    }
    const close = () => setPopup(null);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        if (!open) show();
        else setActive(index => Math.max(0, Math.min(options.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
        return;
      case "Home":
      case "End":
        event.preventDefault();
        if (!open) show(event.key === "Home" ? 0 : options.length - 1);
        else setActive(event.key === "Home" ? 0 : options.length - 1);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) choose(active); else show();
        return;
      case "Escape":
        if (open) { event.preventDefault(); event.stopPropagation(); setPopup(null); }
        return;
      case "Tab":
        setPopup(null);
        return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      search.current = { text: now - search.current.time > 700 ? event.key : search.current.text + event.key, time: now };
      const index = options.findIndex(option => option.label.toLocaleLowerCase().startsWith(search.current.text.toLocaleLowerCase()));
      if (index >= 0) { if (open) setActive(index); else show(index); }
    }
  }

  return <div className="site-brief-label form-select">
    <label id={`${id}-label`} htmlFor={id}>{label}</label>
    <button ref={trigger} id={id} type="button" role="combobox" className="form-select-trigger" disabled={disabled}
      aria-labelledby={`${id}-label`} aria-expanded={open} aria-controls={`${id}-list`} aria-haspopup="listbox"
      aria-activedescendant={open ? `${id}-option-${active}` : undefined} aria-required={required} aria-invalid={invalid || undefined}
      onKeyDown={keyDown} onClick={() => open ? setPopup(null) : show()} onBlur={() => setPopup(null)}>
      <span className={selected ? "" : "form-select-placeholder"}>{selected?.label ?? "انتخاب کنید"}</span><ChevronDown size={15} aria-hidden="true" />
    </button>
    {/* Retain browser form validation and FormData without opening a native popup. */}
    <select className="form-select-native" name={name} value={value} required={required} disabled={disabled} tabIndex={-1} aria-hidden="true"
      onChange={event => onChange(event.target.value)} onInvalid={event => {
        event.preventDefault();
        setInvalid(true);
        const firstInvalid = Array.from(event.currentTarget.form?.elements ?? []).find(element =>
          (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) && element.willValidate && !element.validity.valid);
        if (firstInvalid === event.currentTarget) { trigger.current?.focus(); show(); }
      }}>
      <option value="" />{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    {popup && createPortal(<div ref={list} id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} dir="rtl" className="form-select-list" style={popup}
      onMouseDown={event => event.preventDefault()}>
      {options.map((option, index) => <div id={`${id}-option-${index}`} key={option.value} role="option" aria-selected={value === option.value}
        className={`form-select-option${index === active ? " active" : ""}`} onPointerMove={() => setActive(index)} onClick={() => choose(index)}>
        <span>{option.label}</span>{value === option.value && <Check size={15} aria-hidden="true" />}
      </div>)}
    </div>, container ?? document.body)}
  </div>;
}
