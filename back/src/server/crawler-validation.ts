import * as cheerio from "cheerio";
import type { CrawlerRecipe } from "./crawler-recipe";
import { extractArticle, extractArticleCategories, safeArticleLogUrl, structuredArticleText, articleBodyNode, articleTitleNode, type CrawledArticle } from "./web-crawler";
import { pageLayout } from "./crawler-sampling";

export type QualityIssue = { code: string; stage: "title" | "body" | "category" | "document"; repairable: boolean };
export type SampleResult = { url: string; passed: boolean; title: string | null; contentLength: number; errorCode: string | null; categories?: string[]; categoryStatus?: "found" | "missing" | "not_exposed"; diagnostics?: { layout: string; issues: QualityIssue[]; metrics: Record<string, number> } };
const normalize = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function contentWitness(text: string) {
  const words = normalize(text).split(/\s+/);
  return [...new Set(Array.from({ length: Math.min(32, words.length) }, (_, index) => words.slice(Math.floor(index * Math.max(0, words.length - 6) / 31), Math.floor(index * Math.max(0, words.length - 6) / 31) + 6).join(" ")))];
}
export function witnessRecall(witness: string[], text: string) { const content = normalize(text); return witness.length ? witness.filter(value => content.includes(value)).length / witness.length : 0; }
function recall(reference: string, extracted: string) {
  const source = normalize(reference).split(/\s+/); const available = new Map<string, number>();
  for (const word of normalize(extracted).split(/\s+/)) available.set(word, (available.get(word) ?? 0) + 1);
  let matched = 0;
  for (const word of source) if ((available.get(word) ?? 0) > 0) { matched++; available.set(word, available.get(word)! - 1); }
  return source.length ? matched / source.length : 0;
}
export function validateSample(html: string, url: string, recipe: CrawlerRecipe, extracted?: CrawledArticle | null): SampleResult {
  const $ = cheerio.load(html); const article = extracted === undefined ? extractArticle(html, url, recipe) : extracted;
  const issues: QualityIssue[] = [];
  const add = (code: string, stage: QualityIssue["stage"], repairable = true) => { issues.push({ code, stage, repairable }); };
  const titleNode = articleTitleNode($, recipe, url);
  const selectedTitle = titleNode.length ? titleNode : undefined;
  const title = article?.title ?? selectedTitle?.text().trim() ?? null;
  const referenceTitles = $("main h1,article h1,[itemprop='headline'],meta[property='og:title']").map((_, node) => $(node).attr("content") ?? $(node).text()).get().filter(Boolean);
  if (!referenceTitles.length) $("h1").filter((_, node) => !$(node).closest("nav,aside,footer,header:not(article header):not(main header)").length).each((_, node) => { referenceTitles.push($(node).text()); });
  if (!selectedTitle) add("TITLE_SELECTOR_MISSING", "title");
  else if (selectedTitle.closest("nav,aside,footer,[class*='related'],[class*='comment']").length || (title && referenceTitles.length && !referenceTitles.some(value => recall(value, title) >= 0.8 && recall(title, value) >= 0.7))) add("TITLE_MISMATCH", "title");
  const body = articleBodyNode($, recipe); const before = body.clone();
  before.find("script,style,noscript,iframe,object,embed,form,nav,aside,footer").remove();
  const cleaned = before.clone(); for (const css of recipe.removeSelectors) cleaned.find(css).remove();
  const length = article?.content?.length ?? 0; const reference = structuredArticleText(html, url);
  if (/liveblog|live-updates/i.test(url)) {
    const main = $("main,article").first().clone();
    main.find("[class*='article-header'],nav,aside,footer,figure,[class*='caption'],[class*='related'],[class*='recommend'],button,[role='button'],script,style").remove();
    const paragraphs = main.find("p").map((_, node) => $(node).text().trim()).get();
    const closed = /(?:this live (?:page|blog) is now closed|live (?:page|blog) has closed)/i;
    if (paragraphs.some(value => closed.test(value)) && paragraphs.filter(value => !closed.test(value)).join(" ").length < 160 && !reference) add("LIVEBLOG_UPDATES_UNAVAILABLE", "document", false);
  }
  // A liveblog's archived header/description is not evidence that its updates
  // were extracted. Do not certify a summary-only fallback as the whole story.
  if (/liveblog|live-updates/i.test(url) && article?.summary && normalize(article.content ?? "") === normalize(article.summary)) {
    const main = $("main,article").first().clone(); main.find("nav,aside,footer,[class*='related'],[class*='recommend']").remove();
    const hasOtherContent = main.find("p,[itemprop='liveBlogUpdate']").length > 2;
    add("LIVEBLOG_SUMMARY_ONLY", "body", hasOtherContent);
  }
  const coverage = reference ? recall(reference, article?.content ?? "") : 0;
  const beforeCoverage = reference ? recall(reference, before.text()) : 0;
  const removalLoss = Math.max(0, before.text().trim().length - cleaned.text().trim().length);
  if (!body.length || recipe.bodySelectors.some(css => /^(?:html|body|main|\*)$/i.test(css.trim()))) add("BODY_SELECTOR_MISSING", "body");
  if (removalLoss > 80 && ((reference && beforeCoverage - coverage > 0.2) || length < 80)) add("REMOVE_CONTENT_LOSS", "body");
  if (reference && reference.length >= 160 && (length < reference.length * 0.8 || coverage < 0.8)) add(length >= reference.length * 0.8 && coverage < 0.4 ? "BODY_CONTENT_MISMATCH" : "ARTICLE_TRUNCATED", "body");
  const suspicious = cleaned.find("[class*='related'],[class*='recommend'],[class*='comment'],[class*='advert'],[id*='comment'],[role='complementary']");
  let contamination = 0;
  suspicious.each((_, node) => { if (!$(node).parents().toArray().some(parent => suspicious.toArray().includes(parent))) contamination += $(node).text().trim().length; });
  const anchorText = cleaned.find("a").text().length; const linkDensity = length ? anchorText / length : 0;
  if (contamination > Math.max(40, length * 0.12) || (cleaned.find("a").length > 8 && linkDensity > 0.35) || cleaned.find("h1").length > 1 || (reference && coverage >= 0.8 && length > reference.length * 1.5 && recall(article?.content ?? "", reference) < 0.65)) add("CONTENT_CONTAMINATED", "body");
  if (!article || length < 80 || length > 200000 || !article.contentHtml) add("EXTRACTION_UNVERIFIED", "body");
  if (!referenceTitles.length && selectedTitle?.prop("tagName") !== "H1" && !selectedTitle?.is("[itemprop='headline']")) add("HEADLINE_UNVERIFIED", "title");
  const fragment = cheerio.load(article?.contentHtml ?? "", null, false);
  if (fragment("script,iframe,object,embed,form").length || fragment("*").toArray().some(node => Object.keys(fragment(node).attr() ?? {}).some(key => /^on/i.test(key) || key === "srcdoc"))) add("OUTPUT_HTML_UNSAFE", "document", false);
  if (!body.length && $("#root,#app,#__next").length && $("script").length && $("main,article").text().trim().length < 80) add("JS_RENDERING_REQUIRED", "document", false);
  const categories = article?.categories ?? []; const expected = extractArticleCategories(html, url);
  const categoryMissing = !categories.length && (!!recipe.categorySelectors?.length || !!expected.length);
  if (categoryMissing) add("CATEGORY_SELECTOR_MISSING", "category");
  else if (expected.length && categories.length && !expected.some(value => categories.some(category => normalize(category) === normalize(value)) )) add("CATEGORY_CONTENT_MISMATCH", "category");
  return { url: safeArticleLogUrl(url), passed: !issues.length, title, contentLength: length, categories, categoryStatus: categories.length ? "found" : categoryMissing ? "missing" : "not_exposed", errorCode: issues.length ? issues.every(issue => issue.stage === "category") ? "SAMPLE_CATEGORY_MISSING" : "SAMPLE_EXTRACTION_INVALID" : null, diagnostics: { layout: pageLayout(html, url), issues, metrics: { structuredLength: reference?.length ?? 0, contentLength: length, structuredRecall: coverage, removalLoss, contaminationLength: contamination, linkDensity } } };
}
export function extractionDiagnostics(html: string, url: string, recipe: CrawlerRecipe) {
  const $ = cheerio.load(html);
  const selectors = (values: string[]) => values.map(selector => { const nodes = $(selector); return { selector, matches: nodes.length, textLength: nodes.toArray().reduce((max, node) => Math.max(max, $(node).text().trim().length), 0) }; });
  return { result: validateSample(html, url, recipe), titleSelectors: selectors(recipe.titleSelectors), bodySelectors: selectors(recipe.bodySelectors), removeSelectors: selectors(recipe.removeSelectors), structuredContentLength: structuredArticleText(html, url)?.length ?? 0 };
}
