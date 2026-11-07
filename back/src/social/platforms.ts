import { isSocialPlatform, socialPlatformKeys, type SocialPlatform } from "@media/contracts/social-platforms";
export { isSocialPlatform, socialPlatformKeys };

import { normalizeSocialSource as normalizeAddress } from "@media/contracts/social-source";
export { detectSocialPlatform, resolveSocialSource, SocialSourceAddressError } from "@media/contracts/social-source";
export class SocialCrawlerError extends Error {
  constructor(readonly code: string) { super(code); this.name = "SocialCrawlerError"; }
}
export function normalizeSocialSource(platform: SocialPlatform, input: string): string {
  try { return normalizeAddress(platform, input); } catch { throw new SocialCrawlerError("SOCIAL_ADDRESS_INVALID"); }
}
export const browserHome: Record<SocialPlatform, string> = {
  aparat: "https://www.aparat.com/", bale: "https://web.bale.ai/", eitaa: "https://web.eitaa.com/",
  facebook: "https://www.facebook.com/", instagram: "https://www.instagram.com/", rubika: "https://web.rubika.ir/",
  rubino: "https://m.rubika.ir/", shad: "https://web.shad.ir/", soroush: "https://web.splus.ir/",
  telegram: "https://web.telegram.org/k/", tiktok: "https://www.tiktok.com/", x: "https://x.com/", youtube: "https://www.youtube.com/",
};
const transportRoots: Record<SocialPlatform, string[]> = {
  aparat: ["aparat.com", "aparat.ir", "static.aparat.com"], bale: ["bale.ai", "ble.ir"],
  eitaa: ["eitaa.com", "eitaa.ir"], facebook: ["facebook.com", "facebook.net", "fbcdn.net", "fbsbx.com"],
  instagram: ["instagram.com", "cdninstagram.com", "fbcdn.net", "facebook.com"],
  rubika: ["rubika.ir", "rubino.ir"], rubino: ["rubika.ir", "rubino.ir"], shad: ["shad.ir", "shadlink.ir"],
  soroush: ["splus.ir", "sapp.ir"], telegram: ["telegram.org", "telegram.me", "t.me", "telesco.pe"],
  tiktok: ["tiktok.com", "tiktokcdn.com", "tiktokcdn-us.com", "tiktokv.com", "ttwstatic.com", "ibyteimg.com", "byteoversea.com", "ibytedtos.com", "muscdn.com"],
  x: ["x.com", "twitter.com", "twimg.com"], youtube: ["youtube.com", "ytimg.com", "googlevideo.com", "ggpht.com", "google.com", "gstatic.com", "googleapis.com", "googleusercontent.com"],
};
export function allowsSocialHost(platform: SocialPlatform, hostname: string): boolean {
  return transportRoots[platform].some(root => hostname === root || hostname.endsWith(`.${root}`));
}
