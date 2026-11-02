"use client";
export type CategoryNames = { nameFa: string; nameEn: string; nameAr: string };
export function CategoryNameFields({ value, onChange, disabled = false }: { value: CategoryNames; onChange: (value: CategoryNames) => void; disabled?: boolean }) {
  return <>{([ ["nameFa", "عنوان فارسی", "rtl"], ["nameEn", "English title", "ltr"], ["nameAr", "العنوان بالعربية", "rtl"] ] as const).map(([key, label, dir]) => <label key={key}>{label}<input required minLength={2} maxLength={100} disabled={disabled} value={value[key]} onChange={event => onChange({ ...value, [key]: event.target.value })} dir={dir} /></label>)}</>;
}
