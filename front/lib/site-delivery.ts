import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { SitePage } from "./contracts/sites";

export const siteDelivery = cache(async (path: string, preview = false): Promise<SitePage> => {
  const incoming = preview ? await headers() : null;
  const response = await fetch(new URL(path, process.env.BACKEND_INTERNAL_URL ?? process.env.BACKEND_URL ?? "http://127.0.0.1:4000"), { cache: "no-store", headers: preview ? { cookie: incoming?.get("cookie") ?? "" } : {} });
  if ([401, 403, 404].includes(response.status)) notFound();
  if (!response.ok) throw new Error("Site delivery is unavailable.");
  return (await response.json()).data as SitePage;
});
