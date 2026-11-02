import { redirect } from "next/navigation";
import Link from "next/link";
import { PlatformShell } from "@/components/platform/platform-shell";
import { PlatformCategories } from "@/components/platform/platform-categories";
import type { PlatformContext } from "@/lib/contracts/context";
import type { PlatformCategory } from "@/lib/contracts/platform-categories";
import { backendGet } from "@/lib/backend";

export default async function PlatformCategoriesPage() {
  const context = await backendGet<PlatformContext>("/api/v1/platform/context");
  if (!context) redirect("/login");
  if (!context.isPlatformAdmin) return <main className="platform-access"><h1>دسترسی محدود</h1><p>این بخش فقط برای سوپر ادمین قابل دسترسی است.</p><Link href="/">بازگشت</Link></main>;
  const categories = await backendGet<PlatformCategory[]>("/api/v1/platform/categories");
  if (!categories) redirect("/login");
  return <PlatformShell context={context} active="categories" title="دسته‌بندی‌های خبری"><PlatformCategories initialCategories={categories} /></PlatformShell>;
}
