import { redirect } from "next/navigation";
import { PlatformShell } from "@/components/platform/platform-shell";
import { MediaRequests } from "@/components/platform/media-requests";
import type { PlatformContext } from "@/lib/contracts/context";
import type { MediaRequestsWorkspace } from "@/lib/contracts/media-requests";
import { backendGet } from "@/lib/backend";
export default async function MediaRequestsPage() {
  const context = await backendGet<PlatformContext>("/api/v1/platform/context");
  if (!context) redirect("/login");
  if (!context.isPlatformAdmin) return <main className="platform-access"><h1>دسترسی محدود</h1><p>بررسی درخواست رسانه فقط برای سوپر ادمین مجاز است.</p></main>;
  const requests = await backendGet<MediaRequestsWorkspace>("/api/v1/platform/media-requests");
  if (!requests) redirect("/login");
  return <PlatformShell context={context} active="media-requests" title="درخواست‌های رسانه"><MediaRequests initial={requests} /></PlatformShell>;
}
