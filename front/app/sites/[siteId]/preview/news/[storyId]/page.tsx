import { redirect } from "next/navigation";
import { NewsSite } from "@/components/sites/news-site";
import { siteDelivery } from "@/lib/site-delivery";
import { backendGet } from "@/lib/backend";
import type { DashboardContext } from "@/lib/contracts/context";
import { requireMediaSetupComplete } from "@/lib/require-media-setup";
export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function PreviewStory({ params }: { params: Promise<{ siteId: string; storyId: string }> }) {
  const context = await backendGet<DashboardContext>("/api/v1/context");
  await requireMediaSetupComplete(context);
  if (!context) redirect("/login");
  const { siteId, storyId } = await params; const data = await siteDelivery(`/api/v1/sites/${encodeURIComponent(siteId)}/preview/stories/${encodeURIComponent(storyId)}`, true);
  return <NewsSite data={data} basePath={`/sites/${siteId}/preview`} storyId={storyId} />;
}
