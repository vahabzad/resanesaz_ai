export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return parseCount(value);
}

export function asNullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export function parseCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }

  const text = asString(value);
  if (!text) {
    return null;
  }

  const normalized = text
    .replace(/[۰٠]/g, '0')
    .replace(/[۱١]/g, '1')
    .replace(/[۲٢]/g, '2')
    .replace(/[۳٣]/g, '3')
    .replace(/[۴٤]/g, '4')
    .replace(/[۵٥]/g, '5')
    .replace(/[۶٦]/g, '6')
    .replace(/[۷٧]/g, '7')
    .replace(/[۸٨]/g, '8')
    .replace(/[۹٩]/g, '9')
    .replace(/[,\u066C]/g, '')
    .trim();
  const match = normalized.match(/^([\d.]+)\s*([KkMm])?/);
  if (!match) {
    return null;
  }

  const multiplier = match[2]?.toLowerCase() === 'm'
    ? 1_000_000
    : match[2]?.toLowerCase() === 'k'
      ? 1_000
      : 1;
  const parsed = Number.parseFloat(match[1]) * multiplier;
  return Number.isNaN(parsed) ? null : Math.round(parsed);
}

export function unixSecondsToDate(value: unknown): Date | null {
  const seconds = asNumber(value);
  if (seconds === null) return null;

  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}
