import { redirect } from "next/navigation";
import { backendGet } from "@/lib/backend";
import type { PlatformContext } from "@/lib/contracts/context";
import type { CategoryMappingWorkspace } from "@/lib/contracts/category-mappings";
import { PlatformShell } from "@/components/platform/platform-shell";
import { CategoryMappings } from "@/components/platform/category-mappings";

export default async function CategoryMappingsPage() {
  const context = await backendGet<PlatformContext>("/api/v1/platform/context");
  if (!context) redirect("/login");
  if (!context.isPlatformAdmin) return <main className="platform-access"><h1>دسترسی محدود</h1><p>معادل‌سازی دسته‌ها فقط برای سوپر ادمین است.</p></main>;
  const workspace = await backendGet<CategoryMappingWorkspace>("/api/v1/platform/category-mappings");
  if (!workspace) redirect("/login");
  return <PlatformShell context={context} active="category-mappings" title="معادل‌سازی دسته‌های منابع"><CategoryMappings initialWorkspace={workspace} /></PlatformShell>;
}
