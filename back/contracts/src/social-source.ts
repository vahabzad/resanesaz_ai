import { socialPlatformKeys, socialPlatformLabels, type SocialPlatform } from "./social-platforms.js";

export const socialSourceHosts: Record<SocialPlatform, readonly string[]> = {
  aparat: ["aparat.com", "www.aparat.com"], bale: ["ble.ir", "bale.ai", "web.bale.ai"],
  eitaa: ["eitaa.com", "www.eitaa.com", "web.eitaa.com"], facebook: ["facebook.com", "www.facebook.com", "m.facebook.com"],
  instagram: ["instagram.com", "www.instagram.com"], rubika: ["rubika.ir", "web.rubika.ir"],
  rubino: ["rubino.ir", "rubika.ir", "m.rubika.ir"], shad: ["shad.ir", "shadlink.ir", "web.shad.ir"],
  soroush: ["splus.ir", "www.splus.ir", "sapp.ir", "web.splus.ir"], telegram: ["t.me", "telegram.me"],
  tiktok: ["tiktok.com", "www.tiktok.com", "m.tiktok.com"], x: ["x.com", "www.x.com", "twitter.com", "www.twitter.com"],
  youtube: ["youtube.com", "www.youtube.com", "m.youtube.com"],
};
export const socialSourceInfo: Record<SocialPlatform, { host: string; example: string; label: string; hint: string }> = {
  instagram: { host: "www.instagram.com", example: "@page_name", label: "آیدی یا لینک پیج اینستاگرام", hint: "آیدی پیج یا لینک پروفایل را وارد کنید؛ لینک پست و ریلز پذیرفته نمی‌شود." },
  telegram: { host: "t.me", example: "@channel_name", label: "آیدی یا لینک کانال تلگرام", hint: "آیدی کانال عمومی یا لینک t.me را وارد کنید؛ لینک دعوت یا پیام مناسب نیست." },
  bale: { host: "ble.ir", example: "@channel_name", label: "آیدی یا لینک کانال بله", hint: "آیدی کانال یا لینک عمومی ble.ir را وارد کنید." },
  eitaa: { host: "eitaa.com", example: "@channel_name", label: "آیدی یا لینک کانال ایتا", hint: "آیدی کانال یا لینک عمومی eitaa.com را وارد کنید." },
  rubika: { host: "rubika.ir", example: "@channel_name", label: "آیدی یا لینک کانال روبیکا", hint: "آیدی کانال یا لینک rubika.ir را وارد کنید؛ برای پیج روبینو، روبینو را انتخاب کنید." },
  rubino: { host: "rubino.ir", example: "@page_name", label: "آیدی یا لینک پیج روبینو", hint: "آیدی پیج یا لینک rubino.ir را وارد کنید." },
  shad: { host: "web.shad.ir", example: "https://web.shad.ir/#c=c…", label: "لینک یا شناسهٔ کانال شاد", hint: "لینک کانال از نسخهٔ وب شاد با #c= یا شناسهٔ کانال (GUID) را وارد کنید؛ نام نمایشی کانال کافی نیست." },
  soroush: { host: "splus.ir", example: "@channel_name", label: "آیدی یا لینک کانال سروش", hint: "آیدی کانال یا لینک عمومی splus.ir را وارد کنید." },
  x: { host: "x.com", example: "@account_name", label: "آیدی یا لینک صفحهٔ ایکس", hint: "آیدی حساب یا لینک پروفایل x.com و twitter.com را وارد کنید؛ لینک یک پست مناسب نیست." },
  youtube: { host: "www.youtube.com", example: "@channel_name", label: "آیدی یا لینک کانال یوتیوب", hint: "شناسهٔ @ کانال یا لینک کانال را وارد کنید؛ لینک ویدیو و پلی‌لیست مناسب نیست." },
  aparat: { host: "www.aparat.com", example: "channel_name", label: "آیدی یا لینک کانال آپارات", hint: "نام کاربری کانال یا لینک پروفایل aparat.com را وارد کنید؛ لینک ویدیو مناسب نیست." },
  facebook: { host: "www.facebook.com", example: "page.name", label: "آیدی یا لینک صفحهٔ فیسبوک", hint: "نام کاربری صفحه یا لینک پروفایل عمومی را وارد کنید؛ لینک گروه و پست مناسب نیست." },
  tiktok: { host: "www.tiktok.com", example: "@account_name", label: "آیدی یا لینک صفحهٔ تیک‌تاک", hint: "نام کاربری یا لینک پروفایل تیک‌تاک را وارد کنید؛ لینک ویدیو مناسب نیست." },
};
export class SocialSourceAddressError extends Error {
  constructor(readonly code: "SOCIAL_ADDRESS_INVALID" | "SOCIAL_PLATFORM_REQUIRED" | "SOCIAL_PLATFORM_MISMATCH", readonly detectedPlatform: SocialPlatform | null = null) {
    super(code === "SOCIAL_PLATFORM_REQUIRED" ? "ابتدا شبکهٔ اجتماعی را انتخاب کنید." : code === "SOCIAL_PLATFORM_MISMATCH" && detectedPlatform ? `این لینک مربوط به ${socialPlatformLabels[detectedPlatform]} است؛ شبکه را تغییر دهید یا آدرس درست وارد کنید.` : "آیدی یا لینک معتبر کانال / صفحه را مطابق راهنما وارد کنید.");
  }
}
export function detectSocialPlatform(input: string): SocialPlatform | null {
  try {
    const hostname = new URL(input.trim()).hostname;
    if (hostname === "m.rubika.ir" || hostname === "rubino.ir") return "rubino";
    return socialPlatformKeys.find(key => key !== "rubino" && socialSourceHosts[key].includes(hostname)) ?? null;
  } catch { return null; }
}
const invalid = (): never => { throw new SocialSourceAddressError("SOCIAL_ADDRESS_INVALID"); };
export function normalizeSocialSource(platform: SocialPlatform, input: string): string {
  let url: URL;
  try { url = new URL(input); } catch { return invalid(); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !socialSourceHosts[platform].includes(url.hostname)) return invalid();
  if (platform === "shad") {
    const guid = url.hostname === "web.shad.ir" ? new URLSearchParams(url.hash.slice(1)).get("c") : url.pathname.slice(1).replace(/\/$/, "");
    if (!guid || !/^c[A-Za-z0-9]{5,100}$/.test(guid) || url.search) return invalid();
    return `https://web.shad.ir/#c=${guid}`;
  }
  if (url.hash || (url.search && !(platform === "facebook" && url.pathname === "/profile.php" && [...url.searchParams.keys()].every(key => key === "id")))) return invalid();
  if (platform === "youtube") {
    let parts: string[];
    try { parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent); } catch { return invalid(); }
    const tabs = ["videos", "shorts", "streams", "featured", "about", "playlists", "community", "posts"];
    if (/^@[\p{L}\p{N}_.-]+$/u.test(parts[0] ?? "") && parts.length <= 2 && (!parts[1] || tabs.includes(parts[1]))) return `https://www.youtube.com/${encodeURIComponent(parts[0]).replace("%40", "@")}`;
    if (["channel", "c", "user"].includes(parts[0]) && /^[\p{L}\p{N}_.-]+$/u.test(parts[1] ?? "") && parts.length <= 3 && (!parts[2] || tabs.includes(parts[2])) && (parts[0] !== "channel" || /^UC[A-Za-z0-9_-]{22}$/.test(parts[1]))) return `https://www.youtube.com/${parts[0]}/${encodeURIComponent(parts[1])}`;
    return invalid();
  }
  if (platform === "facebook" && url.pathname === "/profile.php") {
    const id = url.searchParams.get("id");
    return id && /^\d+$/.test(id) ? `https://www.facebook.com/profile.php?id=${id}` : invalid();
  }
  const rawPath = url.pathname.replace(/^\/+|\/+$/g, "");
  const path = platform === "tiktok" ? rawPath : rawPath.replace(/^@/, "");
  const ordinary = (platform === "tiktok" ? /^@[A-Za-z0-9_.]{1,24}$/ : platform === "facebook" ? /^[A-Za-z0-9.]{1,100}$/ : /^[A-Za-z0-9_.-]{1,100}$/).test(path);
  const reserved = /^(?:login|signin|accounts|explore|home|settings|notifications|messages|watch|feed|reels?|p|s|share|joinchat|groups|search|checkpoint|photo|photos|profile\.php|permalink\.php|story\.php|home\.php|help|sharer\.php|marketplace|gaming|friends|events)$/i;
  const patterns: Partial<Record<SocialPlatform, RegExp>> = {
    eitaa: /^[A-Za-z][A-Za-z0-9_]{3,31}$/, soroush: /^[A-Za-z][A-Za-z0-9_]{3,31}$/,
    bale: /^[A-Za-z0-9_]{3,64}$/, rubika: /^[A-Za-z0-9_]{3,64}$/,
    telegram: /^[A-Za-z0-9_]{1,64}$/, instagram: /^[A-Za-z0-9_.]{1,30}$/, x: /^[A-Za-z0-9_]{1,15}$/,
    aparat: /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,79}$/, tiktok: /^@[A-Za-z0-9_][A-Za-z0-9_.]{0,23}$/,
  };
  if (patterns[platform] && !patterns[platform]!.test(path)) return invalid();
  if ((platform === "aparat" && /^(v|shorts|etc|api|live)$/i.test(path)) || (platform === "tiktok" && path.endsWith("."))) return invalid();
  if (!ordinary || reserved.test(path) || path === "." || path === "..") return invalid();
  return `https://${socialSourceInfo[platform].host}/${path}`;
}
export function resolveSocialSource(platform: SocialPlatform | undefined, input: string): { platform: SocialPlatform; url: string } {
  const value = input.trim();
  if (!value || value.length > 2048) return invalid();
  const looksLikeUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
  const detected = looksLikeUrl ? detectSocialPlatform(value) : null;
  const selected = platform ?? detected;
  if (!selected) throw new SocialSourceAddressError("SOCIAL_PLATFORM_REQUIRED");
  if (looksLikeUrl) {
    let hostname: string;
    try { hostname = new URL(value).hostname; } catch { return invalid(); }
    if (!socialSourceHosts[selected].includes(hostname) && detected) throw new SocialSourceAddressError("SOCIAL_PLATFORM_MISMATCH", detected);
    return { platform: selected, url: normalizeSocialSource(selected, value) };
  }
  if (/[\s\/?#:\\]/.test(value)) return invalid();
  const handle = value.replace(/^@/, "");
  const url = selected === "shad" ? `https://web.shad.ir/#c=${handle}` : `https://${socialSourceInfo[selected].host}/${["tiktok", "youtube"].includes(selected) ? "@" : ""}${handle}`;
  return { platform: selected, url: normalizeSocialSource(selected, url) };
}
