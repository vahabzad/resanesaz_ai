import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { getDashboardContext } from "@/lib/server/context";
import { getSourcesWorkspace } from "@/lib/server/sources";

export default async function SourcesPage() {
  const context = await getDashboardContext(await headers());
  if (!context) redirect("/login");
  const workspace = await getSourcesWorkspace(context.activeMedia.id);
  return <Dashboard context={context} view="sources" sourcesWorkspace={workspace} />;
}
