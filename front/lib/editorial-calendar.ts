export type CalendarMode = "persian" | "gregory";
export type CalendarDate = { year: number; month: number; day: number };
const dayMs = 86400000;
const formats = {
  persian: new Intl.DateTimeFormat("en-u-ca-persian", { timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric" }),
  gregory: new Intl.DateTimeFormat("en-u-ca-gregory", { timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric" }),
};

export function calendarDate(day: number, calendar: CalendarMode): CalendarDate {
  const parts = formats[calendar].formatToParts(new Date(day * dayMs));
  const part = (name: string) => Number(parts.find(p => p.type === name)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

// Invert the browser's own Persian calendar, including its leap-year rules.
export function calendarDay(year: number, month: number, day: number, calendar: CalendarMode): number | null {
  if (![year, month, day].every(Number.isInteger) || year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const baseYear = calendar === "persian" ? year + 621 : year;
  let low = Math.floor(Date.UTC(baseYear, 0, 1) / dayMs);
  let high = Math.floor(Date.UTC(baseYear + (calendar === "persian" ? 2 : 1), 0, 1) / dayMs);
  const target = year * 10000 + month * 100 + day;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const date = calendarDate(mid, calendar);
    const value = date.year * 10000 + date.month * 100 + date.day;
    if (value === target) return mid;
    if (value < target) low = mid + 1; else high = mid - 1;
  }
  return null;
}

export function tehranLocal(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const part = (name: string) => parts.find(p => p.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
}

export function fromTehranLocal(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local)) return null;
  const normalized = local.length === 16 ? `${local}:00` : local;
  const wall = Date.parse(`${normalized}Z`);
  if (!Number.isFinite(wall)) return null;
  if (new Date(wall).toISOString().slice(0, 19) !== normalized) return null;
  let instant = wall;
  for (let attempt = 0; attempt < 3; attempt++) {
    const actual = Date.parse(`${tehranLocal(new Date(instant).toISOString())}Z`);
    const correction = wall - actual;
    if (!correction) return new Date(instant).toISOString();
    instant += correction;
  }
  return null; // A nonexistent local time at a historical daylight-saving transition.
}

export function calendarMonth(anchor: number, calendar: CalendarMode) {
  const selected = calendarDate(anchor, calendar);
  const first = anchor - selected.day + 1;
  const days: number[] = [];
  for (let day = first; day < first + 31; day++) {
    const date = calendarDate(day, calendar);
    if (date.year !== selected.year || date.month !== selected.month) break;
    days.push(day);
  }
  return { ...selected, first, days, offset: (new Date(first * dayMs).getUTCDay() + 1) % 7 };
}

export function localDay(iso: string) {
  return Math.floor(Date.parse(`${tehranLocal(iso).slice(0, 10)}T00:00:00Z`) / dayMs);
}

export function selectCalendarDay(day: number, iso: string) {
  return fromTehranLocal(`${new Date(day * dayMs).toISOString().slice(0, 10)}T${tehranLocal(iso).slice(11)}`);
}
