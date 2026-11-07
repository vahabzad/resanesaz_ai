export const SHAD_JOIN_LABELS = ["عضویت در کانال"] as const;

export const normalizeShadActionLabel = (value: string): string =>
  value
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200c\u200d\u200e\u200f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[!…]+$/g, "")
    .toLocaleLowerCase("fa-IR");

const NORMALIZED_SHAD_JOIN_LABELS = new Set(
  SHAD_JOIN_LABELS.map(normalizeShadActionLabel),
);

export const isShadJoinActionLabel = (value: string): boolean =>
  NORMALIZED_SHAD_JOIN_LABELS.has(normalizeShadActionLabel(value));
