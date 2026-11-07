import { defaultAutomaticFreshness, type SectionSettings } from "../contracts/src/editorial-settings";

export function automaticFreshness(settings: SectionSettings) {
  return settings.autoFreshness ?? defaultAutomaticFreshness;
}
export function automaticInputRejection(settings: SectionSettings, article: { ingestedAt: Date; publishedAt: Date | null }, now = new Date()) {
  if (settings.autoReceivedSince && article.ingestedAt.getTime() < Date.parse(settings.autoReceivedSince)) return "AUTO_INPUT_OUTSIDE_START";
  const policy = automaticFreshness(settings);
  if (!article.publishedAt && policy.unknownDatePolicy === "skip") return "AUTO_DATE_UNKNOWN";
  const time = (article.publishedAt ?? article.ingestedAt).getTime();
  if (!Number.isFinite(time) || time > now.getTime()) return "AUTO_DATE_FUTURE";
  if (policy.maxAgeHours !== null && time < now.getTime() - policy.maxAgeHours * 3600000) return "AUTO_NEWS_EXPIRED";
  return null;
}
export function resumedAutomaticSettings(settings: SectionSettings, now = new Date()): SectionSettings {
  if (automaticFreshness(settings).resumeMode === "continue") return settings;
  return { ...settings, autoReceivedSince: new Date(Math.max(now.getTime(), settings.autoReceivedSince ? Date.parse(settings.autoReceivedSince) : 0)).toISOString() };
}
