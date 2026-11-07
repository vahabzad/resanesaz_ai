import * as cheerio from "cheerio";
import type { CrawlerRecipe } from "./crawler-recipe";
import { safeArticleLogUrl, structuredArticleText } from "./web-crawler";

// Every fragment is page data, never a trusted instruction. Retain CSS structure,
// not active content, credentials, query values or arbitrary attribute payloads.
export function pageEvidence(html: string, url: string, recipe?: CrawlerRecipe) {
  const $ = cheerio.load(html);
  const structuredLength = structuredArticleText(html, url)?.length ?? 0;
  $("meta").filter((_, node) => !/^(?:og:title|article:section|og:article:section|pageSection|section|category)$/i.test($(node).attr("property") ?? $(node).attr("name") ?? "")).remove();
  $("script,style,noscript,iframe,form,input,textarea,object,embed").remove();
  $("*").each((_, node) => {
    const element = $(node);
    for (const key of Object.keys(element.attr() ?? {})) if (!["class", "id", "href", "itemprop", "property", "name", "content", "role"].includes(key)) element.removeAttr(key);
    if (!element.is("meta,[itemprop=articleSection]")) element.removeAttr("content");
    const href = element.attr("href");
    if (href) try { if (new URL(href, url).protocol !== "https:") throw new Error("UNSAFE_HREF"); element.attr("href", /^(?:https?:)?\/\//.test(href) ? safeArticleLogUrl(new URL(href, url).toString()) : href.split(/[?#]/)[0]); } catch { element.removeAttr("href"); }
    if ("children" in node) for (const child of node.children) if (child.type === "text") child.data = child.data.trim().replace(/\s+/g, " ").slice(0, 100);
  });
  const fragments = (selector: string, count: number, size: number) => $(selector).slice(0, count).toArray().map(node => $.html(node).slice(0, size)).join("\n");
  const categories = fragments("meta[property='article:section'],meta[name='pageSection'],[itemprop='articleSection'],.breadcrumb,.breadcrumbs,[class*='Breadcrumb'],[class*='category'],[class*='section']", 12, 700).slice(0, 4000);
  const links = fragments("a[href]", 30, 180).slice(0, 3000);
  $("nav,aside,footer").remove();
  $("header").filter((_, node) => !$(node).parents("main,article,[role='main']").length).remove();
  const targets = new Map<string, string>();
  const add = (selector: string) => $(selector).slice(0, 12).each((_, node) => {
    const markup = $.html(node).slice(0, 2200);
    if (!targets.has(markup)) targets.set(markup, markup);
  });
  // Failed and known selectors precede generic containers and document prefixes.
  for (const selector of [...recipe?.bodySelectors ?? [], ...recipe?.titleSelectors ?? []]) add(selector);
  add("[itemprop='articleBody'],article,[class*='liveblog'],[class*='caption'],[class*='article-body'],[class*='story-text']");
  $("h1,p").each((_, node) => { const parent = $(node).parent(); if (parent.attr("class") || parent.attr("id")) { const markup = $.html(parent).slice(0, 2200); targets.set(markup, markup); } });
  return `HEADLINE_MARKUP:\n${fragments("h1,[itemprop='headline']", 3, 700)}\nCATEGORY_MARKUP:\n${categories}\nSTRUCTURED_BODY_LENGTH:${structuredLength}\nCONTENT_CONTAINERS:\n${[...targets.values()].slice(0, 8).join("\n").slice(0, 9000)}\nLINK_PATTERNS:\n${links}\nDOCUMENT_START:\n${$.html().slice(0, 3000)}\nDOCUMENT_END:\n${$.html().slice(-1000)}`.slice(0, 20000);
}
