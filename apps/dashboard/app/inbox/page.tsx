import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { getDashboardContext } from "@/lib/server/context";
import { getInboxWorkspace } from "@/lib/server/inbox";

export default async function InboxPage() {
  const context = await getDashboardContext(await headers());
  if (!context) redirect("/login");
  const workspace = await getInboxWorkspace(context.activeMedia.id);
  return <Dashboard context={context} view="inbox" inboxWorkspace={workspace} />;
}
