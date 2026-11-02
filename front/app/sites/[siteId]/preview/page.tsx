import { redirect } from "next/navigation";
import { NewsSite } from "@/components/sites/news-site";
import { siteDelivery } from "@/lib/site-delivery";
import { backendGet } from "@/lib/backend";
import type { DashboardContext } from "@/lib/contracts/context";
import { requireMediaSetupComplete } from "@/lib/require-media-setup";
export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function PreviewSite({ params, searchParams }: { params: Promise<{ siteId: string }>; searchParams: Promise<{ sectionId?: string; view?: string }> }) {
  const context = await backendGet<DashboardContext>("/api/v1/context");
  await requireMediaSetupComplete(context);
  if (!context) redirect("/login");
  const { siteId } = await params; const { sectionId, view } = await searchParams;
  const data = await siteDelivery(`/api/v1/sites/${encodeURIComponent(siteId)}/preview?${new URLSearchParams({ ...(sectionId ? { sectionId } : {}), ...(view ? { view } : {}) }).toString()}`, true);
  return <NewsSite data={data} basePath={`/sites/${siteId}/preview`} />;
}
