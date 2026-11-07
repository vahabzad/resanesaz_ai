import * as cheerio from "cheerio";
import { discoverArticleLinks, excludedArticlePath } from "./web-crawler";

export type ArticleLink = { url: string; title: string };
export function linkFamily(url: string) {
  const path = new URL(url).pathname.toLowerCase();
  if (/liveblog|live-updates|\/live\//.test(path)) return "liveblog";
  let decoded = path; try { decoded = decodeURI(path); } catch { /* Malformed path escapes remain opaque data. */ }
  if (/photo|galler|picture|تصویر|عکس/.test(decoded)) return "gallery";
  if (/video|audio|podcast/.test(path)) return "multimedia";
  return path.split("/").filter(value => value && !/^\d+$/.test(value) && !/^(fa|en|ar)$/.test(value))[0] ?? "article";
}
export function diverseLinks(links: ArticleLink[], limit: number, fingerprint = (link: ArticleLink) => linkFamily(link.url)) {
  const selected = new Map<string, ArticleLink>();
  const groups = new Set<string>();
  for (const link of links) {
    const key = fingerprint(link);
    if (!groups.has(key) && selected.size < limit) { selected.set(link.url, link); groups.add(key); }
  }
  // An archived liveblog often shares its path family with the current one but
  // has a different body template. Cover both ends inside each family as well.
  const lastByGroup = new Map<string, ArticleLink>();
  for (const link of links) lastByGroup.set(fingerprint(link), link);
  for (const link of lastByGroup.values()) if (selected.size < limit) selected.set(link.url, link);
  for (let index = 0; selected.size < limit && index < links.length; index++) {
    const link = links[Math.round(index * (links.length - 1) / Math.max(1, Math.min(limit, links.length) - 1))];
    if (link) selected.set(link.url, link);
  }
  for (const link of links) if (selected.size < limit) selected.set(link.url, link);
  return [...selected.values()];
}
export function candidateLinks(html: string, base: string) {
  const known = discoverArticleLinks(html, base);
  const $ = cheerio.load(html); const links = new Map(known.map(link => [link.url, link]));
  $("a[href]").each((_, node) => {
    try {
      const target = new URL($(node).attr("href")!, base);
      const title = $(node).text().replace(/\s+/g, " ").trim();
      if (target.protocol !== "https:" || target.origin !== new URL(base).origin || target.username || target.password || excludedArticlePath.test(target.pathname) || target.pathname.split("/").filter(Boolean).length < 2 || title.length < 8 || $(node).closest("nav,footer,aside").length) return;
      target.hash = "";
      if (links.size < 500) links.set(target.toString(), { url: target.toString(), title });
    } catch { /* Invalid discovery links never become fetch candidates. */ }
  });
  return [...links.values()];
}
export function pageLayout(html: string, url: string) {
  const $ = cheerio.load(html);
  const heading = $("main h1,article h1,h1").first();
  const body = $("[itemprop='articleBody'],article,[class*='body'],[class*='text'],[class*='caption'],[class*='live']").filter((_, node) => $(node).text().trim().length >= 80).first();
  const signature = (node: ReturnType<typeof $>) => `${node.prop("tagName") ?? ""}.${(node.attr("class") ?? "").split(/\s+/).slice(0, 3).map(value => value.replace(/[a-f0-9]{8,}/gi, "hash")).join(".")}`;
  return `${linkFamily(url)}|${signature(heading.parent())}|${signature(body)}|figures:${Math.min(2, $("figure").length)}|live:${$("[class*='liveblog'],[itemprop='liveBlogUpdate']").length > 0}`;
}
