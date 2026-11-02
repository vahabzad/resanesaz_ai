import assert from "node:assert/strict";
import test from "node:test";
import { extractArticleCategories } from "../src/server/web-crawler";
import { parseRssFeed } from "../src/server/rss-adapter";

test("news categories fall back to section metadata without collecting menu or keyword topics", () => {
  const url = "https://example.test/news/123";
  assert.deepEqual(extractArticleCategories(`<script type="application/ld+json">{"@type":"NewsArticle","articleSection":["Politics","Politics"]}</script><meta property="article:section" content="Sports">`, url), ["Politics"]);
  assert.deepEqual(extractArticleCategories(`<script type="application/ld+json">{"@type":"NewsArticle"}</script><meta property="article:section" content="فیلم و صوت "><meta name="keywords" content="Other"><nav><a href="/category/sport">Sport</a></nav>`, url), ["فیلم و صوت"]);
  assert.deepEqual(extractArticleCategories('<meta name="pageSection" content="News,Elections,Government">', url), ["News", "Elections", "Government"]);
  assert.deepEqual(extractArticleCategories('<meta name="keywords" content="Not a section"><nav><a href="/category/sport">Sport</a></nav>', url), []);
});

test("breadcrumb categories exclude homepage, article headline, external links and sidebar suggestions", () => {
  const url = "https://example.test/news/123";
  const html = '<h1>Article title</h1><aside><div class="breadcrumbs"><a href="/sport">Wrong</a></div></aside><div class="breadcrumbs"><a href="/">خانه</a><a href="/category/world">World</a><a href="/category/politics">Politics</a><a href="/news/123?share=1">Article title</a><a href="https://other.test/category">External</a></div>';
  assert.deepEqual(extractArticleCategories(html, url), ["World", "Politics"]);
  const json = { "@type": "BreadcrumbList", itemListElement: [{ item: { "@id": "https://example.test/", name: "Home" } }, { item: { "@id": "https://example.test/world", name: "World" } }, { name: "Article title", item: url }] };
  assert.deepEqual(extractArticleCategories(`<h1>Article title</h1><script type="application/ld+json">${JSON.stringify({ "@graph": [json] })}</script>`, url), ["World"]);
  assert.deepEqual(extractArticleCategories('<span itemprop="articleSection">Science</span>', url), ["Science"]);
});

test("RSS and Atom category elements survive normalization and HTML is treated as text", () => {
  const rss = parseRssFeed('<rss><channel><item><title>News</title><link>https://example.test/news/1</link><category>Politics</category><category><![CDATA[<b>World</b>]]></category><category>Politics</category></item></channel></rss>');
  assert.deepEqual(rss[0].categories, ["Politics", "World"]);
  const atom = parseRssFeed('<feed><entry><title>News</title><link href="https://example.test/news/2"/><category term="politics" label="Politics"/><category term="World"/></entry></feed>');
  assert.deepEqual(atom[0].categories, ["Politics", "World"]);
  assert.deepEqual(parseRssFeed('<rss><channel><item><title>News</title><link>https://example.test/news/3</link></item></channel></rss>')[0].categories, []);
});
