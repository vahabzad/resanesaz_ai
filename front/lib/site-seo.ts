import type { SitePage } from "./contracts/sites";

export function publicSiteUrl(path: string): string | undefined {
  const configured = process.env.PUBLIC_SITE_URL;
  if (!configured) return undefined;
  try { const url = new URL(configured); if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return undefined; return new URL(path, url.origin).toString(); } catch { return undefined; }
}

export function articleMetadata(data: SitePage) {
  const article = data.articles[0]; const canonical = publicSiteUrl(article.seo?.canonicalPath ?? `/s/${data.site.slug}/news/${article.storyId}`);
  return { title: `${article.webFull.title} | ${data.site.spec.title}`, description: article.webFull.lead,
    robots: { index: !data.preview && article.seo?.noindex === false, follow: true },
    ...(canonical ? { alternates: { canonical } } : {}),
    openGraph: { type: "article" as const, title: article.webFull.title, description: article.webFull.lead, ...(canonical ? { url: canonical } : {}), ...(article.publishedAt ? { publishedTime: article.publishedAt } : {}), ...(article.seo?.modifiedAt ? { modifiedTime: article.seo.modifiedAt } : {}), ...(article.webFull.imageUrl ? { images: [article.webFull.imageUrl] } : {}) } };
}
