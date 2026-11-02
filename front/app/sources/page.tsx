import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { backendGet } from "@/lib/backend";
import type { DashboardContext } from "@/lib/contracts/context";
import type { SourcesWorkspace } from "@/lib/contracts/sources";
import { requireMediaSetupComplete } from "@/lib/require-media-setup";

export default async function SourcesPage() {
  const context = await backendGet<DashboardContext>("/api/v1/context");
  await requireMediaSetupComplete(context);
  if (!context) redirect("/login");
  if (!context.isPlatformAdmin) return <Dashboard context={context} view="sources" />;
  const workspace = await backendGet<SourcesWorkspace>("/api/v1/sources");
  if (!workspace) redirect("/login");
  return <Dashboard context={context} view="sources" sourcesWorkspace={workspace} />;
}
