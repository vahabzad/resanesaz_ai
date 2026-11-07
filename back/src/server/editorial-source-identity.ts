import { detectSocialPlatform, socialSourceHosts } from "@media/contracts/social-source";
import { isSocialPlatform, socialPlatformLabels } from "@media/contracts/social-platforms";
import { z } from "zod";

export type EditorialSourceIdentity = { kind: "website" | "social"; displayName: string; name: string; platform?: string; identifier?: string };
export const editorialSourceIdentitySchema = z.object({ kind: z.enum(["website", "social"]), displayName: z.string().min(1).max(512), name: z.string().max(256), platform: z.string().max(32).optional(), identifier: z.string().max(128).optional() }).strict();

export function editorialSourceIdentity(name: string, address: string, adapterKey?: string): EditorialSourceIdentity {
  const platform = adapterKey && isSocialPlatform(adapterKey) ? adapterKey : detectSocialPlatform(address);
  if (!platform) return { kind: "website", displayName: name, name };
  const url = new URL(address);
  const parts = url.pathname.split("/").filter(Boolean).map(part => { try { return decodeURIComponent(part); } catch { return part; } });
  const identifier = platform === "shad" ? new URLSearchParams(url.hash.slice(1)).get("c") ?? ""
    : platform === "facebook" && parts[0] === "profile.php" ? url.searchParams.get("id") ?? ""
    : platform === "youtube" && ["channel", "c", "user"].includes(parts[0]) ? parts[1] ?? "" : parts[0] ?? "";
  const safeIdentifier = /^@?[\p{L}\p{N}_.-]{1,128}$/u.test(identifier) && !/^(watch|v|shorts|p|reel|stories|status|login|profile\.php)$/i.test(identifier) ? identifier.replace(/^@/, "") : "";
  const label = socialPlatformLabels[platform];
  const trimmed = name.trim();
  const normalizedName = trimmed.toLowerCase().replace(/^www\./, "");
  const hostName = socialSourceHosts[platform].some(host => normalizedName === host.replace(/^www\./, "") || normalizedName.startsWith(`${host.replace(/^www\./, "")}/`));
  const generic = !trimmed || hostName || [label, platform, address].some(value => trimmed.toLowerCase() === value.toLowerCase()) || /^https?:\/\//i.test(trimmed);
  const handle = platform !== "shad" && !(platform === "youtube" && parts[0] !== `@${safeIdentifier}`) && !(platform === "facebook" && parts[0] === "profile.php");
  const accountName = generic ? (safeIdentifier ? handle ? `@${safeIdentifier}` : `با شناسهٔ ${safeIdentifier}` : "") : trimmed;
  const kind = ["bale", "eitaa", "telegram", "soroush", "rubika", "shad", "youtube", "aparat"].includes(platform) ? "کانال" : "صفحه";
  return { kind: "social", name: accountName, platform, identifier: safeIdentifier || undefined,
    displayName: accountName ? `${/^(کانال|صفحه|پیج)\s/.test(accountName) ? "" : `${kind} `}${accountName}${accountName.endsWith(`در ${label}`) ? "" : ` در ${label}`}` : "منبع اجتماعی با نام نامشخص" };
}
