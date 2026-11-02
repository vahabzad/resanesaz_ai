import * as cheerio from "cheerio";
import { fetchPublicHtml, fetchPublicXml } from "./url-safety";

// Address evidence only: this never adds articles to the discovery/validation
// set. Follow at most five same-origin maps and two children per index.
export async function sitemapArticleUrls(sourceUrl: string, signal: AbortSignal, fetchers = { robots: fetchPublicHtml, xml: fetchPublicXml }) {
  const origin = new URL(sourceUrl).origin;
  const safe = (value: string, base: string) => {
    try { const url = new URL(value, base); return url.origin === origin && !url.username && !url.password && !url.search && !url.hash ? url.toString() : null; } catch { return null; }
  };
  signal.throwIfAborted();
  let roots: string[];
  try {
    const robots = await fetchers.robots(`${origin}/robots.txt`, { maxBytes: 64_000, timeoutMs: 10_000 });
    roots = [...new Set([...robots.body.matchAll(/^Sitemap:\s*(\S+)/gim)].flatMap(match => { const url = safe(match[1], robots.finalUrl); return url ? [url] : []; }))];
  } catch { signal.throwIfAborted(); return []; }
  roots.sort((a, b) => Number(/news/i.test(b) && !/archive/i.test(b)) - Number(/news/i.test(a) && !/archive/i.test(a)));
  const queue = roots.slice(0, 3).map(url => ({ url, depth: 0 }));
  const visited = new Set<string>();
  const articles = new Set<string>();
  while (queue.length && visited.size < 5 && articles.size < 1000) {
    signal.throwIfAborted();
    const item = queue.shift()!;
    if (visited.has(item.url)) continue;
    visited.add(item.url);
    try {
      const page = await fetchers.xml(item.url, { maxBytes: 2_000_000, timeoutMs: 10_000 });
      if (new URL(page.finalUrl).origin !== origin) continue;
      const $ = cheerio.load(page.body, { xmlMode: true });
      if ($("sitemapindex").length && item.depth < 2) {
        const children = $("sitemap > loc").slice(0, 2).map((_, node) => safe($(node).text().trim(), page.finalUrl)).get().filter((url): url is string => !!url);
        queue.unshift(...children.map(url => ({ url, depth: item.depth + 1 })));
      } else {
        $("urlset > url > loc").each((_, node) => { const url = safe($(node).text().trim(), page.finalUrl); if (url && articles.size < 1000) articles.add(url); });
      }
    } catch { signal.throwIfAborted(); }
  }
  return [...articles];
}
