export const RUBIKA_JOIN_LABELS = ['عضویت در کانال'] as const;

export const normalizeRubikaActionLabel = (value: string): string =>
  value
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c\u200d\u200e\u200f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[!…]+$/g, '')
    .toLocaleLowerCase('fa-IR');

const NORMALIZED_RUBIKA_JOIN_LABELS = new Set(
  RUBIKA_JOIN_LABELS.map(normalizeRubikaActionLabel),
);

export const isRubikaJoinActionLabel = (value: string): boolean =>
  NORMALIZED_RUBIKA_JOIN_LABELS.has(normalizeRubikaActionLabel(value));
