import { NewsSite } from "@/components/sites/news-site";
import { siteDelivery } from "@/lib/site-delivery";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const data = await siteDelivery(`/api/v1/public/sites/${encodeURIComponent(slug)}`); return { title: data.site.spec.title, description: data.site.spec.tagline }; }
export default async function PublicSite({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string; sectionId?: string; view?: string }> }) {
  const { slug } = await params; const query = await searchParams;
  const data = await siteDelivery(`/api/v1/public/sites/${encodeURIComponent(slug)}?${new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === "string")).toString()}`);
  return <NewsSite data={data} basePath={`/s/${slug}`} />;
}
