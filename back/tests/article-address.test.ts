import assert from "node:assert/strict";
import test from "node:test";
import { fetchListedArticlePage } from "../src/server/web-crawler";
import { buildCrawler } from "../src/server/crawler-builder";
import type { CrawlerRecipe } from "../src/server/crawler-recipe";

const origin = "https://example.test";
const short = `${origin}/fa/news/123456`;
const full = `${short}/article-title`;
const listing = { finalUrl: `${origin}/`, body: `<a href="${full}">عنوان کامل خبر آزمایشی</a>` };
const article = (url: string) => ({ finalUrl: url, body: `<link rel="canonical" href="${url}"><h1>عنوان خبر آزمایشی</h1><div class="story-text">${"متن کامل و معتبر خبر برای آزمون استخراج. ".repeat(12)}</div>` });

test("a published full address repairs a forbidden numeric news alias only after canonical verification", async () => {
  const requested: string[] = [];
  const resolved: string[] = [];
  const page = await fetchListedArticlePage(short, listing, new AbortController().signal, {
    fetchPage: async url => { requested.push(url); if (url === short) throw new Error("UPSTREAM_403"); return article(url); },
    onAlias: (from, to) => { assert.equal(from, short); resolved.push(to); },
  });
  assert.equal(page.finalUrl, full);
  assert.deepEqual(requested, [short, full]);
  assert.deepEqual(resolved, [full]);
});

test("ambiguous, different-ID, external and query-changing links cannot replace a failed article", async () => {
  for (const links of [[full, `${short}/other-title`], [`${origin}/fa/news/123457/article-title`], ["https://external.test/fa/news/123456/article-title"], [`${full}?token=value`], [`${short}/nested/title`], [`${short}/a%2fb`]]) {
    const requested: string[] = [];
    await assert.rejects(fetchListedArticlePage(short, { ...listing, body: links.map(url => `<a href="${url}">خبر آزمایشی</a>`).join("") }, new AbortController().signal, {
      fetchPage: async url => { requested.push(url); throw new Error("UPSTREAM_403"); },
    }), /UPSTREAM_403/);
    assert.deepEqual(requested, [short]);
  }
});

test("missing or conflicting canonical and unexpected redirects never count as an alias repair", async () => {
  for (const page of [{ finalUrl: full, body: "<h1>صفحهٔ نامشخص</h1>" }, article(`${origin}/fa/news/999999/other`), { ...article(`${origin}/fa/news/999999/other`), finalUrl: full }]) {
    await assert.rejects(fetchListedArticlePage(short, listing, new AbortController().signal, { fetchPage: async url => { if (url === short) throw new Error("UPSTREAM_403"); return page; } }), /UPSTREAM_403/);
  }
});

test("historical successful addresses can resolve a short link no longer expanded on the listing", async () => {
  const fetchPage = async (url: string) => { if (url === short) throw new Error("UPSTREAM_403"); return article(url); };
  const currentListing = { ...listing, body: `<a href="${short}">خبر قدیمی</a>` };
  const page = await fetchListedArticlePage(short, currentListing, new AbortController().signal, { fetchPage, knownArticleUrls: [full] });
  assert.equal(page.finalUrl, full);
  await assert.rejects(fetchListedArticlePage(short, currentListing, new AbortController().signal, { fetchPage, knownArticleUrls: [`${origin}/fa/news/999999/other`] }), /UPSTREAM_403/);
});

test("builder and historical debug failures validate the full article instead of regenerating selectors for a short-address 403", async () => {
  const urls = [123456, 123457, 123458].map(id => `${origin}/fa/news/${id}`);
  const html = urls.map(url => `<a href="${url}">عنوان خبر کوتاه آزمایشی</a><a href="${url}/article-title">عنوان کامل خبر آزمایشی</a>`).join("");
  const recipe: CrawlerRecipe = { contractVersion: "2", linkSelector: "a[href]", pathPrefixes: ["/fa/news/"], titleSelectors: ["h1"], bodySelectors: [".story-text"], removeSelectors: [], categorySelectors: [] };
  for (const debug of [undefined, { previousVersionId: "old", recipe, failures: [{ url: short, errorCode: "UPSTREAM_403", durationMs: null }] }]) {
    let generations = 0;
    const result = await buildCrawler(`${origin}/`, "web", new AbortController().signal, async () => {}, {
      fetch: async url => { if (url === `${origin}/`) return { finalUrl: url, body: html }; if (urls.includes(url)) throw new Error("UPSTREAM_403"); return article(url); },
      generate: async () => { generations++; return recipe; },
    }, debug);
    assert.equal(result.report.passed, true);
    assert.equal(generations, 1);
    assert.ok(result.report.samples.every(sample => sample.passed && sample.url.endsWith("/article-title")));
  }
});
