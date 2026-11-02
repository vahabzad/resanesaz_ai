import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { backendGet } from "@/lib/backend";
import type { DashboardContext } from "@/lib/contracts/context";
import type { EditorialWorkspace } from "@/lib/contracts/editorial";
import { requireMediaSetupComplete } from "@/lib/require-media-setup";

export default async function EditorialPage({ searchParams }: { searchParams: Promise<{ rawArticleId?: string }> }) {
  const context = await backendGet<DashboardContext>("/api/v1/context");
  await requireMediaSetupComplete(context);
  if (!context) redirect("/login");
  const workspace = await backendGet<EditorialWorkspace>("/api/v1/editorial");
  if (!workspace) redirect("/login");
  const { rawArticleId } = await searchParams;
  return <Dashboard context={context} view="editorial" editorialWorkspace={workspace} rawArticleId={rawArticleId} />;
}
