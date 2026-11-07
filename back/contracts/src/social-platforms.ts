export const socialPlatformKeys = ["aparat", "bale", "eitaa", "facebook", "instagram", "rubika", "rubino", "shad", "soroush", "telegram", "tiktok", "x", "youtube"] as const;
export type SocialPlatform = typeof socialPlatformKeys[number];
export type SourceAdapter = "web" | "rss" | SocialPlatform;
export const socialPlatformLabels: Record<SocialPlatform, string> = {
  aparat: "آپارات", bale: "بله", eitaa: "ایتا", facebook: "فیسبوک", instagram: "اینستاگرام",
  rubika: "روبیکا", rubino: "روبینو", shad: "شاد", soroush: "سروش", telegram: "تلگرام",
  tiktok: "تیک‌تاک", x: "ایکس", youtube: "یوتیوب",
};
export function isSocialPlatform(value: string): value is SocialPlatform {
  return (socialPlatformKeys as readonly string[]).includes(value);
}
