import { redirect } from "next/navigation";
import { MediaAdminDashboard } from "@/components/media-admin/media-admin-dashboard";
import { backendGet } from "@/lib/backend";
import { requireMediaSetupComplete } from "@/lib/require-media-setup";
import type { DashboardContext } from "@/lib/contracts/context";
export default async function BotsPage() {
  const context = await backendGet<DashboardContext>("/api/v1/context");
  await requireMediaSetupComplete(context);
  if (!context) redirect("/login");
  return <MediaAdminDashboard context={context} view="bots" />;
}
