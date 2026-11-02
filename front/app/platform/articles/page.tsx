import { redirect } from "next/navigation";
import Link from "next/link";
import { backendGet } from "@/lib/backend";
import type { PlatformContext } from "@/lib/contracts/context";
import type { PlatformArticlesWorkspace } from "@/lib/contracts/platform-articles";
import { PlatformArticles } from "@/components/platform/platform-articles";

export default async function PlatformArticlesPage() {
  const context = await backendGet<PlatformContext>("/api/v1/platform/context");
  if (!context) redirect("/login");
  if (!context.isPlatformAdmin) return <main className="platform-access"><h1>دسترسی محدود</h1><p>این بخش فقط برای مدیر پلتفرم است.</p><Link href="/">بازگشت به رسانه</Link></main>;
  const workspace = await backendGet<PlatformArticlesWorkspace>("/api/v1/platform/articles");
  if (!workspace) redirect("/login");
  return <PlatformArticles context={context} initialWorkspace={workspace} />;
}
