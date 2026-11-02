import assert from "node:assert/strict";
import test from "node:test";
import { sitemapArticleUrls } from "../src/server/crawler-sitemap";
import { fetchListedArticlePage } from "../src/server/web-crawler";

test("publisher-advertised news maps supply a missing address without expanding the crawl discovery set", async () => {
  const base = "https://example.test";
  const short = `${base}/fa/news/123456`;
  const full = `${short}/published-title`;
  const requested: string[] = [];
  const urls = await sitemapArticleUrls(`${base}/`, new AbortController().signal, {
    robots: async url => { requested.push(url); return { finalUrl: url, body: `Sitemap: https://foreign.test/private.xml\nSitemap: ${base}/news.xml` }; },
    xml: async url => { requested.push(url); return { finalUrl: url, body: url.endsWith("news.xml") ? `<sitemapindex><sitemap><loc>${base}/today.xml</loc></sitemap></sitemapindex>` : `<urlset><url><loc>${full}</loc></url><url><loc>https://foreign.test/fa/news/123456/title</loc></url></urlset>` }; },
  });
  assert.deepEqual(urls, [full]);
  assert.equal(requested.length, 3);
  const page = await fetchListedArticlePage(short, { finalUrl: `${base}/`, body: "" }, new AbortController().signal, {
    lookupPublishedUrls: async () => urls,
    fetchPage: async url => { if (url === short) throw new Error("UPSTREAM_403"); return { finalUrl: url, body: `<link rel="canonical" href="${url}">` }; },
  });
  assert.equal(page.finalUrl, full);
});

test("sitemap traversal stays bounded and rejects credential, query, external and cyclic targets", async () => {
  let requests = 0;
  const urls = await sitemapArticleUrls("https://example.test/", new AbortController().signal, {
    robots: async url => ({ finalUrl: url, body: "Sitemap: https://user:password@example.test/secret.xml\nSitemap: https://example.test/map.xml?token=private\nSitemap: https://example.test/news.xml" }),
    xml: async url => { requests++; return { finalUrl: url, body: `<sitemapindex><sitemap><loc>${url}</loc></sitemap><sitemap><loc>${url.replace('.xml', '-child.xml')}</loc></sitemap></sitemapindex>` }; },
  });
  assert.deepEqual(urls, []);
  assert.ok(requests <= 5);
});
