import { redirect } from "next/navigation";
import Link from "next/link";
import { PlatformShell } from "@/components/platform/platform-shell";
import { PlatformAdmins } from "@/components/platform/platform-admins";
import type { PlatformContext } from "@/lib/contracts/context";
import type { PlatformMediaAdmin } from "@/lib/contracts/platform-admins";
import { backendGet } from "@/lib/backend";

export default async function PlatformAdminsPage() {
  const context = await backendGet<PlatformContext>("/api/v1/platform/context");
  if (!context) redirect("/login");
  if (!context.isPlatformAdmin) return <main className="platform-access"><h1>دسترسی محدود</h1><p>این صفحه فقط برای سوپر ادمین قابل دسترسی است.</p><Link href="/">بازگشت</Link></main>;
  const admins = await backendGet<PlatformMediaAdmin[]>("/api/v1/platform/admins");
  if (!admins) redirect("/login");
  return <PlatformShell context={context} active="admins" title="ادمین‌ها"><PlatformAdmins initialAdmins={admins} /></PlatformShell>;
}
