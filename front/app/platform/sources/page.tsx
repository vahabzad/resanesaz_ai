import { isSocialPlatform } from "@/lib/contracts/social-platforms";
import { redirect } from "next/navigation";
import Link from "next/link";
import { backendGet } from "@/lib/backend";
import type { PlatformContext } from "@/lib/contracts/context";
import type { PlatformSourcesWorkspace } from "@/lib/contracts/sources";
import { PlatformSources } from "@/components/platform/platform-sources";

export default async function PlatformSourcesPage({ searchParams }: { searchParams: Promise<{ socialLogin?: string | string[] }> }) {
  const context = await backendGet<PlatformContext>("/api/v1/platform/context");
  if (!context) redirect("/login");
  if (!context.isPlatformAdmin) return <main className="platform-access"><h1>دسترسی محدود</h1><p>این بخش فقط برای مدیر پلتفرم است.</p><Link href="/">بازگشت به رسانه</Link></main>;
  const workspace = await backendGet<PlatformSourcesWorkspace>("/api/v1/platform/sources");
  if (!workspace) redirect("/login");
  const requestedPlatform = (await searchParams).socialLogin;
  const platform = typeof requestedPlatform === "string" && isSocialPlatform(requestedPlatform) ? requestedPlatform : undefined;
  return <PlatformSources key={platform ?? "sources"} context={context} initialWorkspace={workspace} initialLoginPlatform={platform} />;
}
