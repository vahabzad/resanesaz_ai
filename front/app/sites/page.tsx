import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { backendGet } from "@/lib/backend";
import type { DashboardContext } from "@/lib/contracts/context";
import type { SiteWorkspace } from "@/lib/contracts/sites";
import { requireMediaSetupComplete } from "@/lib/require-media-setup";
export default async function SitesPage({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const params = await searchParams;
  const context = await backendGet<DashboardContext>("/api/v1/context");
  await requireMediaSetupComplete(context);
  if (!context) redirect("/login");
  if (!context.isPlatformAdmin) return <Dashboard context={context} view="sites" />;
  const sites = await backendGet<SiteWorkspace>("/api/v1/sites"); if (!sites) redirect("/login");
  return <Dashboard context={context} view="sites" sitesWorkspace={sites} setupWizardStep={params.setup === "1"} />;
}
