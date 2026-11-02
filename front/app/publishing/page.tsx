import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { backendGet } from "@/lib/backend";
import type { DashboardContext } from "@/lib/contracts/context";
import type { PublicationWorkspace, SiteWorkspace } from "@/lib/contracts/sites";
import { requireMediaSetupComplete } from "@/lib/require-media-setup";
export default async function PublishingPage() {
  const context = await backendGet<DashboardContext>("/api/v1/context");
  await requireMediaSetupComplete(context);
  if (!context) redirect("/login");
  const [publications, sites] = await Promise.all([backendGet<PublicationWorkspace>("/api/v1/publications"), backendGet<SiteWorkspace>("/api/v1/sites")]);
  if (!publications || !sites) redirect("/login");
  return <Dashboard context={context} view="publishing" sitesWorkspace={sites} publicationWorkspace={publications} />;
}
