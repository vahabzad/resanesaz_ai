export const BALE_JOIN_LABELS = [
  'پیوستن',
  'پیوستن به کانال',
  'join',
  'join channel',
] as const;

export const normalizeBaleActionLabel = (value: string): string => value
  .replace(/[يى]/g, 'ی')
  .replace(/ك/g, 'ک')
  .replace(/[\u200c\u200d\u200e\u200f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/[!…]+$/g, '')
  .toLocaleLowerCase('en-US');

export const isBaleJoinActionLabel = (value: string): boolean => {
  const normalized = normalizeBaleActionLabel(value);
  return BALE_JOIN_LABELS.some((label) => normalizeBaleActionLabel(label) === normalized);
};
