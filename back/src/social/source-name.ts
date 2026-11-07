import { isSocialPlatform } from "./platforms";

export function socialSourceName(name: string, url: string, adapter: string, profileTitle?: string | null) {
  if (!isSocialPlatform(adapter)) return name;
  const address = new URL(url);
  const handle = address.pathname.split("/").filter(Boolean).join("/") || address.searchParams.get("id") || address.hash.slice(1);
  const fallback = handle ? (handle.startsWith("@") ? handle : `@${handle}`) : address.hostname;
  // Preserve a name explicitly supplied by the administrator.
  if (name && ![address.hostname, address.hostname.replace(/^www\./, ""), fallback].includes(name)) return name;
  const title = profileTitle?.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200);
  return title && title !== address.hostname ? title : fallback;
}
