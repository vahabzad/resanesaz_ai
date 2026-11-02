import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { backendGet } from "@/lib/backend";
import type { DashboardContext } from "@/lib/contracts/context";
import type { InboxWorkspace } from "@/lib/contracts/inbox";
import { requireMediaSetupComplete } from "@/lib/require-media-setup";

export default async function InboxPage() {
  const context = await backendGet<DashboardContext>("/api/v1/context");
  await requireMediaSetupComplete(context);
  if (!context) redirect("/login");
  if (!context.isPlatformAdmin) return <Dashboard context={context} view="inbox" />;
  const workspace = await backendGet<InboxWorkspace>("/api/v1/articles");
  if (!workspace) redirect("/login");
  return <Dashboard context={context} view="inbox" inboxWorkspace={workspace} />;
}
