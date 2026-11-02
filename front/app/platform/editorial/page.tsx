import { redirect } from "next/navigation";
import Link from "next/link";
import { backendGet } from "@/lib/backend";
import type { PlatformContext } from "@/lib/contracts/context";
import type { PlatformEditorialConfig } from "@/lib/contracts/editorial-settings";
import { PlatformEditorialSettings } from "@/components/platform/platform-editorial-config";

export default async function PlatformEditorialPage() {
  const context = await backendGet<PlatformContext>("/api/v1/platform/context");
  if (!context) redirect("/login");
  if (!context.isPlatformAdmin) return <main className="platform-access"><h1>دسترسی محدود</h1><p>این بخش فقط برای ادمین پلتفرم است.</p><Link href="/">بازگشت به رسانه</Link></main>;
  const config = await backendGet<PlatformEditorialConfig>("/api/v1/platform/editorial-config");
  return <PlatformEditorialSettings context={context} initialConfig={config} />;
}
