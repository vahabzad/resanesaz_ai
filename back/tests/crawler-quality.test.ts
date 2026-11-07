import assert from "node:assert/strict";
import test from "node:test";
import { buildCrawler, CrawlerBuildError, extractionDiagnostics, pageEvidence, validateSample } from "../src/server/crawler-builder";
import { runWebCrawler } from "../src/server/web-crawler";
import type { CrawlerRecipe } from "../src/server/crawler-recipe";
import { repairPlan } from "../src/server/crawler-repair";

const origin = "https://quality.test/";
const text = Array.from({ length: 30 }, (_, i) => `پاراگراف خبر شماره ${i} با اطلاعات دقیق منبع و جزئیات رویداد.`).join(" ");
const recipe: CrawlerRecipe = { contractVersion: "2", linkSelector: ".news a[href]", pathPrefixes: ["/news/", "/liveblog/", "/gallery/"], titleSelectors: ["h1.headline"], bodySelectors: [".article-body"], removeSelectors: [], categorySelectors: [] };
const page = (body = text, extra = "") => `<main><article><h1 class="headline">عنوان اصلی خبر آزمایشی</h1><div class="article-body"><p>${body}</p>${extra}</div></article></main>`;
const listing = `<div class="news">${Array.from({ length: 8 }, (_, i) => `<a href="/news/story-${i}">عنوان خبر آزمایشی ${i}</a>`).join("")}</div>`;
const fetch = async (url: string) => ({ finalUrl: url, body: url === origin ? listing : page() });
const codes = (html: string, value = recipe) => validateSample(html, `${origin}news/story`, value).diagnostics!.issues.map(issue => issue.code);

test("validation distinguishes missing selectors, wrong headlines, incomplete and padded unrelated bodies", () => {
  assert.deepEqual(codes(page()), []);
  assert.ok(codes(page(), { ...recipe, titleSelectors: [".missing"] }).includes("TITLE_SELECTOR_MISSING"));
  assert.ok(codes(page(), { ...recipe, bodySelectors: [".missing"] }).includes("BODY_SELECTOR_MISSING"));
  assert.ok(codes(page() + '<aside><h2 class="other">خبر کاملاً نامربوط</h2></aside>', { ...recipe, titleSelectors: [".other"] }).includes("TITLE_MISMATCH"));
  const metadata = `<script type="application/ld+json">${JSON.stringify({ "@type": "NewsArticle", url: `${origin}news/story`, headline: "عنوان اصلی خبر آزمایشی", articleBody: text })}</script>`;
  assert.ok(codes(metadata + page(text.slice(0, 200))).includes("ARTICLE_TRUNCATED"));
  assert.ok(codes(metadata + page("محتوای نامربوط تبلیغاتی برای فروش کالا و معرفی محصولات تازه. ".repeat(80))).includes("BODY_CONTENT_MISMATCH"));
  assert.ok(codes(page(text, `<div class="related">${text}</div>`)).includes("CONTENT_CONTAMINATED"));
  assert.deepEqual(codes(page(text, `<div class="related">${text}</div>`), { ...recipe, removeSelectors: [".related"] }), []);
  const removal = metadata + page(text.slice(0, 100), `<div class="important">${text.slice(100)}</div>`);
  assert.ok(codes(removal, { ...recipe, removeSelectors: [".important"] }).includes("REMOVE_CONTENT_LOSS"));
  const diagnostic = extractionDiagnostics(removal, `${origin}news/story`, { ...recipe, removeSelectors: [".important"] });
  assert.equal(diagnostic.removeSelectors[0].matches, 1);
  assert.ok(diagnostic.result.diagnostics!.metrics.removalLoss > 80);
});

test("category absence is allowed, exposed categories cannot be silently lost or replaced", () => {
  assert.equal(validateSample(page(), origin, recipe).categoryStatus, "not_exposed");
  assert.ok(codes(page() + '<div class="desk">World</div>', { ...recipe, categorySelectors: [".missing"] }).includes("CATEGORY_SELECTOR_MISSING"));
  assert.ok(codes('<meta property="article:section" content="World">' + page() + '<div class="desk">Sports</div>', { ...recipe, categorySelectors: [".desk"] }).includes("CATEGORY_CONTENT_MISMATCH"));
  const gallery = '<h1 class="headline">گزارش تصویری رویداد</h1><figure><figcaption class="photo-caption">' + text + '</figcaption></figure>';
  assert.equal(validateSample(gallery, `${origin}gallery/event`, { ...recipe, bodySelectors: [".photo-caption"] }).passed, true);
  const summaryOnly = `<meta name="description" content="${text}">` + page(text);
  const live = validateSample(summaryOnly, `${origin}liveblog/archive`, recipe);
  assert.equal(live.passed, false);
  assert.ok(live.diagnostics?.issues.some(issue => issue.code === "LIVEBLOG_SUMMARY_ONLY" && !issue.repairable));
  const closed = '<main><header><h1 class="headline">عنوان اصلی خبر آزمایشی</h1><div class="article-body"><p>This live page is now closed. You can continue to follow our coverage here.</p></div></header></main>';
  assert.ok(validateSample(closed, `${origin}liveblog/closed`, recipe).diagnostics?.issues.some(issue => issue.code === "LIVEBLOG_UPDATES_UNAVAILABLE" && !issue.repairable));
  assert.equal(validateSample(closed.replace('</div>', `<p>${text.slice(0, 120)}</p><p>${text.slice(120, 240)}</p></div>`), `${origin}liveblog/closed`, recipe).passed, true);
});

test("evidence prioritizes actual containers and removes active content and secret-bearing attributes", () => {
  const html = '<meta name="csrf-token" content="secret-csrf"><form>secret-form</form><script>secret-script</script><a href="https://user:secret-pass@quality.test/news/story?token=secret-query" onclick="secret-action()">عنوان لینک خبر</a>' + '<span>layout</span>'.repeat(3000) + page(text);
  const evidence = pageEvidence(html, origin, recipe);
  assert.doesNotMatch(evidence, /secret|onclick|csrf-token/);
  assert.match(evidence, /CONTENT_CONTAINERS:[\s\S]*article-body/);
  assert.ok(evidence.length <= 20000);
});

test("initial evidence and validation cover liveblogs and galleries rather than just evenly spaced links", async () => {
  const mixedListing = listing.replace('</div>', '<a href="/liveblog/rare">عنوان پوشش زنده رویداد</a><a href="/gallery/rare">تصاویر رویداد خبری</a></div>');
  let attempts = 0;
  const result = await buildCrawler(origin, "web", new AbortController().signal, async () => {}, {
    fetch: async url => ({ finalUrl: url, body: url === origin ? mixedListing : url.includes("/liveblog/") ? page().replaceAll("article-body", "live-updates") : url.includes("/gallery/") ? page().replaceAll("article-body", "photo-caption") : page() }),
    generate: async evidence => {
      attempts++;
      const pages = (evidence as { pages: Array<{ layout: string; html: string }> }).pages;
      assert.ok(pages.some(item => item.layout.includes("liveblog")));
      assert.ok(pages.some(item => item.layout.includes("gallery")));
      return { ...recipe, bodySelectors: [".article-body", ".live-updates", ".photo-caption"] };
    },
  });
  assert.equal(attempts, 1);
  assert.ok(result.report.samples.some(sample => sample.url.includes("/gallery/")));
  assert.ok(result.report.samples.some(sample => sample.url.includes("/liveblog/")));
  assert.ok(result.report.samples.length <= 12);
  assert.ok(result.report.sampling!.layouts >= 3);
});

test("category-only repair cannot mutate already correct extraction or discovery selectors", async () => {
  const categoryFailure = validateSample(page(), origin, { ...recipe, categorySelectors: [".missing"] });
  assert.equal(repairPlan([categoryFailure], [`${origin}news/missing`]).onlyCategories, false);
  assert.equal(repairPlan([categoryFailure, { ...validateSample(page(), origin, recipe), passed: false, errorCode: "SAMPLE_CONTENT_REGRESSION" }]).onlyCategories, false);
  let attempts = 0;
  const result = await buildCrawler(origin, "web", new AbortController().signal, async () => {}, {
    fetch: async url => ({ finalUrl: url, body: url === origin ? listing : page() + '<div class="desk">World</div>' }),
    generate: async evidence => {
      attempts++;
      if (attempts === 1) return { ...recipe, categorySelectors: [".missing"] };
      assert.equal((evidence as { feedback: { repairPlan: { onlyCategories: boolean } } }).feedback.repairPlan.onlyCategories, true);
      return { ...recipe, bodySelectors: [".wrong-body"], titleSelectors: [".wrong-title"], linkSelector: ".wrong-links", categorySelectors: [".desk"] };
    },
  });
  assert.equal(attempts, 2);
  assert.ok("recipe" in result.config);
  assert.deepEqual(result.config.recipe?.bodySelectors, recipe.bodySelectors);
  assert.equal(result.config.recipe?.linkSelector, recipe.linkSelector);
});

test("a rare archived liveblog near the end of its family appears in first-generation evidence", async () => {
  const links = Array.from({ length: 32 }, (_, i) => ({ url: `${origin}${[1, 2, 30].includes(i) ? "liveblog" : "news"}/story-${i}`, title: `عنوان خبر کامل شماره ${i}` }));
  const html = `<div class="news">${links.map(link => `<a href="${link.url}">${link.title}</a>`).join("")}</div>`;
  let attempts = 0;
  const result = await buildCrawler(origin, "web", new AbortController().signal, async () => {}, {
    fetch: async url => ({ finalUrl: url, body: url === origin ? html : url.endsWith("story-30") ? page().replaceAll("article-body", "archived-summary") : page() }),
    generate: async evidence => { attempts++; assert.match(JSON.stringify((evidence as { pages: unknown }).pages), /archived-summary/); return { ...recipe, bodySelectors: [".article-body", ".archived-summary"] }; },
  }, { operation: "build", previousVersionId: null, recipe: null, failures: [] });
  assert.equal(attempts, 1); assert.ok(result.report.samples.some(sample => sample.url.endsWith("story-30") && sample.passed));
  assert.ok(result.report.samples.length <= 12);
});

test("network failures remain mandatory and do not cause repeated CSS generation", async () => {
  let attempts = 0; let forbiddenFetches = 0;
  await assert.rejects(buildCrawler(origin, "web", new AbortController().signal, async () => {}, {
    fetch: async url => { if (url.endsWith("story-2")) { forbiddenFetches++; throw new Error("UPSTREAM_403"); } return fetch(url); },
    generate: async () => { attempts++; return recipe; },
  }), (error: unknown) => error instanceof CrawlerBuildError && error.report?.terminationReason === "EXTERNAL_OR_RENDERING_BLOCKED" && error.report.samples.some(sample => sample.url.endsWith("story-2") && sample.errorCode === "UPSTREAM_403"));
  assert.equal(attempts, 1); assert.equal(forbiddenFetches, 1);
});

test("identical repairs, JavaScript-only pages, request and time budgets cannot pass validation", async () => {
  let attempts = 0;
  await assert.rejects(buildCrawler(origin, "web", new AbortController().signal, async () => {}, { fetch, generate: async () => { attempts++; return { ...recipe, bodySelectors: [".missing"] }; } }), (error: unknown) => error instanceof CrawlerBuildError && error.report?.terminationReason === "NO_REPAIR_PROGRESS");
  assert.equal(attempts, 2);
  const shell = '<h1 class="headline">عنوان صفحه</h1><div id="root"></div><script src="/app.js"></script>';
  assert.ok(codes(shell).includes("JS_RENDERING_REQUIRED"));
  await assert.rejects(buildCrawler(origin, "web", new AbortController().signal, async () => {}, { fetch, generate: async () => recipe, limits: { maxRequests: 2 } }), (error: unknown) => error instanceof CrawlerBuildError && error.code === "CRAWLER_REQUEST_BUDGET");
  await assert.rejects(buildCrawler(origin, "web", new AbortController().signal, async () => {}, { fetch, generate: async (_evidence, signal) => { await new Promise<void>((resolve, reject) => { const timer = setTimeout(resolve, 100); signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true }); }); return recipe; }, limits: { timeoutMs: 30 } }), (error: unknown) => error instanceof CrawlerBuildError && error.code === "CRAWLER_BUILD_TIMEOUT");
});

test("successful historical pages remain mandatory and content regression is rejected without metadata", async () => {
  const historical = `${origin}news/historical`;
  const good = { ...recipe, bodySelectors: [".article-body", ".alternative"] };
  const html = page(text, '<div class="alternative">' + 'متن دیگری که فقط بخشی از صفحه است و نباید جای خبر اصلی بیاید. '.repeat(30) + '</div>');
  await assert.rejects(buildCrawler(origin, "web", new AbortController().signal, async () => {}, {
    fetch: async url => ({ finalUrl: url, body: url === origin ? listing : html }),
    generate: async () => ({ ...recipe, bodySelectors: [".alternative"] }),
  }, { previousVersionId: "old", recipe: good, failures: [], knownArticleUrls: [historical] }), (error: unknown) => error instanceof CrawlerBuildError && !!error.report?.samples.some(sample => sample.url === historical && !sample.passed));
});

test("runtime uses the same quality gate and records specific faults without invoking Codex", async () => {
  const events: Record<string, unknown>[] = [];
  const result = await runWebCrawler(origin, new AbortController().signal, async event => { events.push(event); }, recipe, [], {
    validateUrl: async url => new URL(url),
    fetch: async url => ({ finalUrl: url, body: url === origin ? listing : page(text, '<div class="related">' + text + '</div>') }),
  });
  assert.equal(result.articles.length, 0); assert.equal(result.failed, 8);
  assert.ok(events.some(event => event.errorCode === "CONTENT_CONTAMINATED"));
  const diagnostics = events.find(event => event.stage === "extraction-diagnostics")!;
  assert.equal(JSON.parse(String(diagnostics.message)).issues[0].code, "CONTENT_CONTAMINATED");
});

test("RSS construction stays deterministic and never calls recipe generation", async () => {
  let calls = 0;
  const result = await buildCrawler(origin, "rss", new AbortController().signal, async () => {}, {
    fetch, generate: async () => { calls++; return recipe; },
    fetchFeed: async url => ({ finalUrl: url, body: '<rss version="2.0"><channel><title>News</title><item><title>عنوان خبر خوراک آزمایشی</title><link>https://quality.test/news/1</link><description>چکیده خبر</description></item></channel></rss>' }),
  });
  assert.equal(calls, 0); assert.equal(result.report.passed, true); assert.equal(result.report.samples.length, 1);
});
