import { NewsSite } from "@/components/sites/news-site";
import { siteDelivery } from "@/lib/site-delivery";
import { articleMetadata, publicSiteUrl } from "@/lib/site-seo";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string; storyId: string }> }) { const { slug, storyId } = await params; const data = await siteDelivery(`/api/v1/public/sites/${encodeURIComponent(slug)}/stories/${encodeURIComponent(storyId)}`); return articleMetadata(data); }
export default async function PublicStory({ params }: { params: Promise<{ slug: string; storyId: string }> }) {
  const { slug, storyId } = await params; const data = await siteDelivery(`/api/v1/public/sites/${encodeURIComponent(slug)}/stories/${encodeURIComponent(storyId)}`);
  const article = data.articles[0]; const canonical = publicSiteUrl(article.seo?.canonicalPath ?? "");
  const structured = { "@context": "https://schema.org", "@type": "NewsArticle", headline: article.webFull.title, description: article.webFull.lead, inLanguage: article.language,
    publisher: { "@type": "Organization", name: data.site.spec.title }, ...(canonical ? { mainEntityOfPage: canonical } : {}), ...(article.publishedAt ? { datePublished: article.publishedAt } : {}), ...(article.seo?.modifiedAt ? { dateModified: article.seo.modifiedAt } : {}), ...(article.webFull.imageUrl ? { image: [article.webFull.imageUrl] } : {}) };
  return <>{!article.seo?.noindex && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, "\\u003c") }} />}<NewsSite data={data} basePath={`/s/${slug}`} storyId={storyId} /></>;
}
