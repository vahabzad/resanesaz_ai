import { redirect } from "next/navigation";
import Link from "next/link";
import { PlatformShell } from "@/components/platform/platform-shell";
import { SourceAccessRequests, type SourceAccessRequestRow } from "@/components/platform/source-access-requests";
import type { PlatformContext } from "@/lib/contracts/context";
import { backendGet } from "@/lib/backend";

export default async function PlatformSourceRequestsPage() {
  const context = await backendGet<PlatformContext>("/api/v1/platform/context");
  if (!context) redirect("/login");
  if (!context.isPlatformAdmin) return <main className="platform-access"><h1>دسترسی محدود</h1><p>این بخش فقط برای سوپر ادمین قابل دسترسی است.</p><Link href="/">بازگشت</Link></main>;
  const requests = await backendGet<SourceAccessRequestRow[]>("/api/v1/platform/source-access-requests");
  if (!requests) redirect("/login");
  return <PlatformShell context={context} active="source-requests" title="درخواست‌های منابع"><SourceAccessRequests initialRequests={requests} /></PlatformShell>;
}
