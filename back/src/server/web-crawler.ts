import * as cheerio from "cheerio";
import { setTimeout as delay } from "node:timers/promises";

import { assertPublicHttpsUrl, fetchPublicHtml, UnsafeSourceUrlError } from "@/src/server/url-safety";
import type { CrawlerRecipe } from "@/src/server/crawler-recipe";
import { sitemapArticleUrls } from "./crawler-sitemap";

type ProgressHandler = (event: Record<string, unknown>) => Promise<void> | void;

export function describeArticleFailure(error: unknown): { code: string; reason: string } {
  if (error instanceof UnsafeSourceUrlError) return { code: "UNSAFE_SOURCE_URL", reason: "آدرس خبر یا مقصد تغییر مسیر مجاز نیست، یا دامنه resolve نشد" };
  const message = error instanceof Error ? error.message : "";
  const status = /^UPSTREAM_(\d{3})$/.exec(message)?.[1];
  if (status) return { code: `UPSTREAM_${status}`, reason: `سایت پاسخ HTTP ${status} داد` };
  const reasons: Record<string, string> = {
    ARTICLE_INVALID: "عنوان یا متن کافی با الگوی فعلی صفحه پیدا نشد",
    UPSTREAM_TIMEOUT: "مهلت دریافت صفحه تمام شد",
    RESPONSE_TOO_LARGE: "حجم صفحه از سقف مجاز بیشتر است",
    REDIRECT_LIMIT: "تعداد تغییر مسیرها از سقف مجاز بیشتر است",
    EMPTY_RESPONSE: "سایت صفحهٔ خالی برگرداند",
  };
  if (reasons[message]) return { code: message, reason: reasons[message] };
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH", "EAI_AGAIN", "ENOTFOUND"].includes(code)) return { code, reason: "ارتباط شبکه با سایت برقرار نشد یا قطع شد" };
  if (["CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "DEPTH_ZERO_SELF_SIGNED_CERT", "ERR_TLS_CERT_ALTNAME_INVALID"].includes(code)) return { code: "TLS_ERROR", reason: "اعتبارسنجی گواهی HTTPS سایت ناموفق بود" };
  return { code: "EXTRACTION_FAILED", reason: "دریافت یا پردازش صفحه ناموفق بود" };
}

export function safeArticleLogUrl(value: string) {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`.slice(0, 1000);
}

export async function fetchArticlePage(url: string, signal: AbortSignal, onRetry?: (code: string) => Promise<void> | void, fetchPage = fetchPublicHtml) {
  signal.throwIfAborted();
  try {
    return await fetchPage(url, { timeoutMs: 20_000 });
  } catch (error) {
    signal.throwIfAborted();
    const { code } = describeArticleFailure(error);
    if (!/^(UPSTREAM_(?:408|429|5\d\d)|UPSTREAM_TIMEOUT|ETIMEDOUT|ECONNRESET|EAI_AGAIN)$/.test(code)) throw error;
    await onRetry?.(code);
    await delay(1000, undefined, { signal });
    // Each retry uses the same public URL and redirect validation as the first request.
    return fetchPage(url, { timeoutMs: 20_000 });
  }
}

// Some publishers expose both /news/123 and /news/123/title, but serve only
// the latter. Use only an unambiguous published link from the listing, prior
// successful validation or the publisher's sitemap. Canonical metadata must
// confirm the exact target; the discovery and extraction gates stay intact.
export async function fetchListedArticlePage(url: string, listing: { body: string; finalUrl: string }, signal: AbortSignal, options: {
  fetchPage?: typeof fetchPublicHtml;
  onRetry?: (code: string) => Promise<void> | void;
  onAlias?: (from: string, to: string) => Promise<void> | void;
  knownArticleUrls?: string[];
  onAliasFailure?: (reason: "missing" | "ambiguous" | "canonical", candidates: string[]) => Promise<void> | void;
  lookupPublishedUrls?: () => Promise<string[]>;
} = {}) {
  const fetchPage = options.fetchPage ?? fetchPublicHtml;
  try { return await fetchArticlePage(url, signal, options.onRetry, fetchPage); }
  catch (error) {
    signal.throwIfAborted();
    if (!["UPSTREAM_403", "UPSTREAM_404"].includes(describeArticleFailure(error).code)) throw error;
    const original = new URL(url);
    if (original.origin !== new URL(listing.finalUrl).origin || original.username || original.password || !/\/(?:news|articles?|stories)\/\d+\/?$/i.test(original.pathname)) throw error;
    const prefix = original.pathname.replace(/\/$/, "") + "/";
    const $ = cheerio.load(listing.body);
    const candidates = new Set<string>();
    const publishedUrls = [...$("a[href]").map((_, node) => $(node).attr("href")!).get(), ...(options.knownArticleUrls ?? []).slice(0, 1000)];
    const collect = (urls: string[]) => { for (const href of urls) {
      try {
        const candidate = new URL(href, listing.finalUrl);
        const suffix = candidate.pathname.slice(prefix.length).replace(/\/$/, "");
        if (candidate.origin !== original.origin || candidate.username || candidate.password || candidate.search !== original.search || !candidate.pathname.startsWith(prefix) || !suffix || suffix.includes("/") || /%2f|%5c/i.test(suffix)) continue;
        candidate.hash = "";
        candidates.add(candidate.toString());
      } catch { /* Malformed external evidence is ignored. */ }
    } };
    collect(publishedUrls);
    if (!candidates.size && options.lookupPublishedUrls) collect(await options.lookupPublishedUrls());
    if (candidates.size !== 1) { await options.onAliasFailure?.(candidates.size ? "ambiguous" : "missing", [...candidates]); throw error; }
    const [candidate] = candidates;
    const page = await fetchArticlePage(candidate, signal, options.onRetry, fetchPage);
    const canonicalHref = cheerio.load(page.body)("link[rel='canonical']").attr("href");
    if (!canonicalHref) { await options.onAliasFailure?.("canonical", [candidate]); throw error; }
    let canonical: URL;
    try { canonical = new URL(canonicalHref, page.finalUrl); } catch { throw error; }
    canonical.hash = "";
    if (canonical.toString() !== candidate || new URL(page.finalUrl).toString() !== candidate) { await options.onAliasFailure?.("canonical", [candidate]); throw error; }
    await options.onAlias?.(safeArticleLogUrl(url), safeArticleLogUrl(candidate));
    return page;
  }
}

export async function fetchFullArticle(url: string, signal: AbortSignal, fetchPage = fetchPublicHtml) {
  const page = await fetchArticlePage(url, signal, undefined, fetchPage);
  const article = extractArticle(page.body, page.finalUrl);
  if (!article) throw new Error("ARTICLE_INVALID");
  return article;
}

export type CrawledArticle = {
  url: string;
  title: string;
  publishedAt: string | null;
  summary: string | null;
  content: string | null;
  contentHtml: string | null;
  imageUrl: string | null;
  categories: string[];
  tags: string[];
  author: string | null;
};

export const excludedArticlePath = /\/(?:service|category|topics?|tag|overview|search|archive|authors?|profiles?|about|contact)(?:\/|$)/i;

function absoluteHttp(value: string | undefined, base: string) {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" ? url.toString().split("#")[0] : null;
  } catch {
    return null;
  }
}

function cleanText(value: string | null | undefined) {
  if (!value) return null;
  const text = cheerio.load(value, null, false).root().text().replace(/[\t\r\u00a0 ]+/g, " ").replace(/\n\s*\n\s*\n/g, "\n\n").trim();
  return text || null;
}

function structuredRecords($: cheerio.CheerioAPI, wantedType = /^(?:NewsArticle|Article|ReportageNewsArticle)$/i) {
  const records: Record<string, unknown>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const types = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
    if (types.some((type) => typeof type === "string" && wantedType.test(type))) records.push(record);
    if (record["@graph"]) visit(record["@graph"]);
  };
  $("script[type='application/ld+json']").each((_, node) => {
    try { visit(JSON.parse($(node).text())); } catch { /* malformed structured data is ignored */ }
  });
  return records;
}

export function structuredArticleText(html: string) {
  return cleanText(firstString(structuredRecords(cheerio.load(html))[0]?.articleBody));
}

function firstString(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") return String(value).trim() || null;
  if (Array.isArray(value)) return value.map(firstString).find(Boolean) ?? null;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return firstString(record.name ?? record.url ?? record.contentUrl);
  }
  return null;
}

function articleImage(value: unknown): string | null {
  if (Array.isArray(value)) return value.map(articleImage).find(Boolean) ?? null;
  if (value && typeof value === "object") {
    const image = value as Record<string, unknown>;
    return firstString(image.url ?? image.contentUrl ?? image["@id"]);
  }
  return typeof value === "string" ? value : null;
}

function stringList(value: unknown) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.flatMap((item) => typeof item === "string" ? item.split(/[,،|]/) : []).map((item) => item.trim()).filter(Boolean))];
}

export function extractArticleCategories(html: string, url: string): string[] {
  return articleCategories(cheerio.load(html), url);
}

function articleCategories($: cheerio.CheerioAPI, url: string, selectors: string[] = []): string[] {
  const normalize = (values: string[]) => [...new Set(values.map((value) => cleanText(value)?.replace(/\s+/g, " ").trim()).filter((value): value is string => !!value && value.length <= 200))].slice(0, 20);
  const selected: string[] = [];
  for (const css of selectors) {
    $(css).slice(0, 20).each((_, node) => {
      const element = $(node);
      if (element.closest("aside,footer").length) return;
      const globalHeader = element.parents("header").toArray().some((header) => !$(header).parents("main,article,[role='main']").length);
      if ((globalHeader || element.closest("nav").length) && !element.closest(".breadcrumb,.breadcrumbs,[class*='Breadcrumb'],[aria-label='breadcrumb' i],[itemtype*='BreadcrumbList']").length) return;
      const href = element.attr("href");
      if (href) {
        try { const target = new URL(href, url); const current = new URL(url); if (target.origin !== current.origin || target.pathname === current.pathname || /^\/(?:fa|en|ar)?\/?$/.test(target.pathname)) return; } catch { return; }
      }
      const values = stringList(element.attr("content") ?? element.text());
      selected.push(...values.filter((value) => !/^(?:home|homepage|خانه|صفحه\s*اصلی|صفحه\s*نخست)$/i.test(value) && value !== $("h1").first().text().trim()));
    });
  }
  const specific = normalize(selected);
  if (specific.length) return specific;
  const structured = normalize(structuredRecords($).flatMap((record) => stringList(record.articleSection)));
  if (structured.length) return structured;
  const metadata: string[] = [];
  $("meta").each((_, node) => {
    const element = $(node);
    const key = (element.attr("property") ?? element.attr("name") ?? element.attr("itemprop") ?? "").toLowerCase();
    if (["article:section", "og:article:section", "articlesection", "pagesection", "section", "category"].includes(key)) metadata.push(...stringList(element.attr("content")));
  });
  const explicit = normalize(metadata);
  if (explicit.length) return explicit;
  const semantic = normalize($("[itemprop='articleSection']").map((_, node) => $(node).attr("content") ?? $(node).text()).get());
  if (semantic.length) return semantic;
  const current = new URL(url);
  const headline = cleanText($("h1").first().text());
  const crumbs: string[] = [];
  const addCrumb = (name: string | null, href: string | null) => {
    const text = cleanText(name);
    if (!text || text === headline || /^(?:home|homepage|خانه|صفحه\s*اصلی|صفحه\s*نخست|خانهٔ سایت)$/i.test(text)) return;
    if (href) {
      try {
        const target = new URL(href, current);
        if (target.origin !== current.origin || target.pathname.replace(/\/$/, "") === current.pathname.replace(/\/$/, "") || /^\/(?:fa|en|ar)?\/?$/.test(target.pathname)) return;
      } catch { return; }
    }
    crumbs.push(text);
  };
  for (const record of structuredRecords($, /^BreadcrumbList$/i)) {
    if (!Array.isArray(record.itemListElement)) continue;
    for (const entry of record.itemListElement) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const detail = item.item && typeof item.item === "object" ? item.item as Record<string, unknown> : null;
      addCrumb(firstString(item.name ?? detail?.name), firstString(detail?.["@id"] ?? detail?.url ?? item.item));
    }
  }
  if (normalize(crumbs).length) return normalize(crumbs);
  // Only explicit breadcrumb containers; never infer categories from the
  // whole navigation menu, keywords, related-news links or the article title.
  $(".breadcrumb, .breadcrumbs, [class*='Breadcrumb'], [aria-label='breadcrumb' i], [aria-label='breadcrumbs' i], [itemtype*='BreadcrumbList']").slice(0, 10).each((_, node) => {
    const element = $(node);
    if (element.closest("aside, footer").length) return;
    element.find("a[href]").each((_, link) => addCrumb($(link).text(), $(link).attr("href") ?? null));
  });
  return normalize(crumbs);
}

export function discoverArticleLinks(html: string, listingUrl: string, recipe?: CrawlerRecipe) {
  const $ = cheerio.load(html);
  const origin = new URL(listingUrl).origin;
  const links = new Map<string, string>();
  $(recipe?.linkSelector ?? "a[href]").each((_, node) => {
    const url = absoluteHttp($(node).attr("href"), listingUrl);
    const title = cleanText($(node).attr("title") ?? $(node).text());
    if (!url || new URL(url).origin !== origin || !title || title.length < 8) return;
    const pathname = new URL(url).pathname;
    if (pathname === new URL(listingUrl).pathname || excludedArticlePath.test(pathname)) return;
    const looksLikeArticle = /\/(?:news|articles?|stories)\/[^/]+/i.test(pathname) || /\/(?:\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{5,})(?:\/|$)/.test(pathname);
    const recipeMatch = recipe && (recipe.pathPrefixes.length ? recipe.pathPrefixes.some((prefix) => pathname.startsWith(prefix)) : recipe.linkSelector !== "a[href]");
    if ((recipe ? recipeMatch : looksLikeArticle) && !links.has(url)) links.set(url, title);
  });
  return [...links].slice(0, 500).map(([url, title]) => ({ url, title }));
}

export function extractArticle(html: string, url: string, recipe?: CrawlerRecipe): CrawledArticle | null {
  const $ = cheerio.load(html);
  const structured = structuredRecords($)[0] ?? {};
  // Prefer the actual article body over article cards in navigation/related news.
  const bodySelectors = recipe?.bodySelectors ?? ["[itemprop='articleBody']", ".article-body", ".news-body", ".news_body", ".news-body-photo", ".item-body", ".body", "article", "main .content", "main"];
  let contentNode = $("__missing_article_body__");
  for (const selector of bodySelectors) {
    const candidates = $(selector).filter((_, node) => !$(node).closest("nav,aside,footer").length && !$(node).parents("header").addBack("header").toArray().some((header) => !$(header).parents("main,article,[role='main']").length));
    let best = candidates.first();
    candidates.each((_, node) => { if ($(node).text().trim().length > best.text().trim().length) best = $(node); });
    if (best.text().trim().length >= 80 || best.find("video[src],audio[src]").length) { contentNode = best.clone(); break; }
  }
  contentNode.find("script,style,noscript,iframe,object,embed,form,nav,aside,footer").remove();
  for (const css of recipe?.removeSelectors ?? []) contentNode.find(css).remove();
  contentNode.find("*").each((_, element) => {
    const node = $(element);
    for (const attribute of Object.keys(node.attr() ?? {})) if (/^on/i.test(attribute) || attribute === "srcdoc") node.removeAttr(attribute);
    for (const attribute of ["href", "src", "poster"]) {
      const current = node.attr(attribute);
      if (!current) continue;
      const safe = absoluteHttp(current, url);
      if (safe) node.attr(attribute, safe); else node.removeAttr(attribute);
    }
  });
  const meta = (...selectors: string[]) => selectors.map((selector) => $(selector).first().attr("content")?.trim()).find(Boolean) ?? null;
  const recipeTitle = recipe?.titleSelectors.map((css) => $(css).first().text().trim()).find(Boolean);
  const title = cleanText(recipeTitle ?? firstString(structured.headline ?? structured.headLine ?? structured.name) ?? meta("meta[property='og:title']") ?? $("h1").first().text());
  const contentHtml = contentNode.html()?.trim() || null;
  const content = cleanText(contentNode.text()) ?? cleanText(firstString(structured.articleBody));
  if (!title || !content || content.length < 80) return null;
  const imageCandidates = [articleImage(structured.image), meta("meta[property='og:image']", "meta[name='twitter:image']"), ...contentNode.find("img").map((_, node) => $(node).attr("data-src") ?? $(node).attr("data-original") ?? $(node).attr("data-lazy-src") ?? $(node).attr("src")).get()];
  const imageUrl = imageCandidates.map((value) => absoluteHttp(value ?? undefined, url)).find(Boolean) ?? null;
  return {
    url,
    title,
    publishedAt: firstString(structured.datePublished) ?? meta("meta[property='article:published_time']") ?? $("time[datetime]").first().attr("datetime") ?? null,
    summary: cleanText(firstString(structured.description) ?? meta("meta[name='description']", "meta[property='og:description']")),
    content,
    contentHtml,
    imageUrl,
    categories: articleCategories($, url, recipe?.categorySelectors),
    tags: stringList(structured.keywords),
    author: cleanText(firstString(structured.author) ?? meta("meta[name='author']")),
  };
}

export async function runWebCrawler(listingUrl: string, signal: AbortSignal, onProgress?: ProgressHandler, recipe?: CrawlerRecipe, knownArticleUrls: string[] = []) {
  signal.throwIfAborted();
  await onProgress?.({ sequence: 1, stage: "validation", status: "running", message: "آدرس منبع در Backend اصلی اعتبارسنجی شد." });
  await assertPublicHttpsUrl(listingUrl);
  const listing = await fetchPublicHtml(listingUrl, { timeoutMs: 20_000 });
  const links = discoverArticleLinks(listing.body, listing.finalUrl, recipe);
  let sitemap: Promise<string[]> | undefined;
  await onProgress?.({ sequence: 2, stage: "discovery", status: "running", message: `${links.length} پیوند خبر در صفحهٔ منبع شناسایی شد.` });
  const articles: CrawledArticle[] = [];
  let failed = 0;
  for (let index = 0; index < links.length; index += 1) {
    signal.throwIfAborted();
    const startedAt = Date.now();
    const articleUrl = safeArticleLogUrl(links[index].url);
    await onProgress?.({ sequence: index * 2 + 3, stage: "article", status: "started", message: `دریافت خبر ${index + 1} از ${links.length} آغاز شد.`, articleUrl });
    try {
      const page = await fetchListedArticlePage(links[index].url, listing, signal, {
        knownArticleUrls,
        lookupPublishedUrls: () => sitemap ??= sitemapArticleUrls(listing.finalUrl, signal),
        onRetry: (errorCode) => onProgress?.({ sequence: index * 2 + 3, stage: "article", status: "retrying", level: "warn", articleUrl, errorCode, message: `دریافت خبر ${index + 1} به خطای موقت برخورد؛ تلاش دوم و آخر انجام می‌شود.` }),
        onAlias: (_from, to) => onProgress?.({ stage: "article-address", status: "progress", articleUrl: to, message: "نشانی کوتاه پاسخ نداد؛ نشانی کامل ثبت‌شدهٔ همان خبر با canonical صفحه تأیید شد." }),
      });
      const article = extractArticle(page.body, page.finalUrl, recipe);
      if (!article) throw new Error("ARTICLE_INVALID");
      articles.push(article);
      await onProgress?.({ sequence: index * 2 + 4, stage: "article", status: "progress", message: `خبر ${index + 1} از ${links.length} استخراج شد.`, articleUrl, durationMs: Date.now() - startedAt });
    } catch (error) {
      signal.throwIfAborted();
      const failure = describeArticleFailure(error);
      failed += 1;
      await onProgress?.({ sequence: index * 2 + 4, stage: "article", status: "warning", level: "warn", message: `خبر ${index + 1} از ${links.length}: ${failure.reason}.`, articleUrl, errorCode: failure.code, durationMs: Date.now() - startedAt });
    }
  }
  await onProgress?.({ sequence: links.length * 2 + 3, stage: "extraction-summary", status: failed ? "warning" : "completed", level: failed ? "warn" : "info", message: `استخراج تمام شد: ${links.length} لینک بررسی شد؛ ${articles.length} خبر استخراج شد و ${failed} لینک ناموفق بود.` });
  return { discovered: links.length, failed, articles };
}
