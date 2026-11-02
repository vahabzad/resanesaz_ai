import { publicSiteUrl } from "@/lib/site-seo";
export const dynamic = "force-dynamic";
// Presentation-only serialization: publication eligibility is owned by the versioned backend API.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const response = await fetch(new URL(`/api/v1/public/sites/${encodeURIComponent(slug)}/sitemap`, process.env.BACKEND_INTERNAL_URL ?? process.env.BACKEND_URL ?? "http://127.0.0.1:4000"), { cache: "no-store" });
  if (!response.ok) return new Response(null, { status: response.status, headers: { "cache-control": "no-store" } });
  const data = (await response.json()).data as { articles: { path: string; modifiedAt: string }[] };
  const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const urls = data.articles.flatMap(article => { const url = publicSiteUrl(article.path); return url ? [`<url><loc>${escape(url)}</loc><lastmod>${escape(article.modifiedAt)}</lastmod></url>`] : []; });
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-store" } });
}
