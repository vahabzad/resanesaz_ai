import assert from "node:assert/strict";
import test from "node:test";

import { describeArticleFailure, discoverArticleLinks, extractArticle, fetchArticlePage, fetchFullArticle, safeArticleLogUrl } from "../src/server/web-crawler";

test("RSS page enrichment requires the actual full article and preserves its image", async () => {
  const url = "https://example.test/news/123";
  const fullText = "Full article paragraph. ".repeat(20);
  const result = await fetchFullArticle(url, new AbortController().signal, async () => ({ finalUrl: url, body: `<h1>News title</h1><meta property="og:image" content="/photo.jpg"><div class="article-body">${fullText}</div>` }));
  assert.equal(result.content, fullText.trim());
  assert.equal(result.imageUrl, "https://example.test/photo.jpg");
  await assert.rejects(fetchFullArticle(url, new AbortController().signal, async () => ({ finalUrl: url, body: '<h1>Challenge</h1>' })), /ARTICLE_INVALID/);
});

test("article images use URL fields rather than captions and support lazy-loaded body images", () => {
  const body = "Full article text. ".repeat(20);
  const structured = `<script type="application/ld+json">${JSON.stringify({ "@type": "NewsArticle", image: { name: "Image caption", url: "/photo.jpg" } })}</script>`;
  assert.equal(extractArticle(`${structured}<h1>News title</h1><div class="article-body">${body}</div>`, "https://example.test/news/123")?.imageUrl, "https://example.test/photo.jpg");
  assert.equal(extractArticle(`<h1>News title</h1><div class="article-body">${body}<img src="data:image/gif;base64,a" data-src="/lazy.jpg"></div>`, "https://example.test/news/123")?.imageUrl, "https://example.test/lazy.jpg");
  assert.equal(extractArticle('<h1>Image only</h1><div class="article-body"><img src="/image.jpg"></div>', "https://example.test/news/123"), null);
});

test("discovers article-shaped links and excludes taxonomy pages", () => {
  const html = `
    <a href="/fa/news/1405/07/10/123456/story">خبر کامل و معتبر امروز</a>
    <a href="/fa/service/politics">صفحه سرویس سیاسی</a>
    <a href="/fa/news/overview/popular">پربازدیدترین خبرهای امروز</a>
    <a href="/fa/political/14">احزاب و تشکل‌ها</a>
    <a href="/fa/art/145">صفحه اخبار هنری امروز</a>
    <a href="/fa/list/4">تمام خبرهای امروز</a>
  `;
  assert.deepEqual(discoverArticleLinks(html, "https://example.com/fa/"), [
    { url: "https://example.com/fa/news/1405/07/10/123456/story", title: "خبر کامل و معتبر امروز" },
  ]);
});

test("extracts the news body instead of the first related-news card", () => {
  const body = "این متن کامل خبر اصلی است و باید تمام پاراگراف‌های آن دریافت شوند. ".repeat(5);
  const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "NewsArticle", headline: "عنوان خبر اصلی", articleBody: "چکیدهٔ کوتاه خبر" })}</script><header><article><img src="/card.jpg">خبر کوتاه منوی سایت</article></header><h1>عنوان خبر اصلی</h1><div class="body"><p>${body}</p><script>unsafe()</script></div><article>خبر پیشنهادی کوتاه</article>`;
  const article = extractArticle(html, "https://www.yjc.ir/fa/news/9136111");
  assert.equal(article?.content, body.trim());
  assert.doesNotMatch(article?.contentHtml ?? "", /script|unsafe|پیشنهادی/);
  assert.equal(extractArticle('<article><img src="/card.jpg">خبر کوتاه</article><h1>صفحه دسته‌بندی</h1>', "https://example.com/fa/art/145"), null);
});

test("classifies extraction failures and redacts URL credentials and query values", () => {
  assert.equal(describeArticleFailure(new Error("UPSTREAM_403")).code, "UPSTREAM_403");
  assert.equal(describeArticleFailure(new Error("ARTICLE_INVALID")).code, "ARTICLE_INVALID");
  assert.equal(describeArticleFailure(new Error("UPSTREAM_TIMEOUT")).code, "UPSTREAM_TIMEOUT");
  assert.equal(describeArticleFailure(Object.assign(new Error("private diagnostic"), { code: "ECONNRESET" })).code, "ECONNRESET");
  assert.doesNotMatch(describeArticleFailure(new Error("credential=secret")).reason, /secret/);
  assert.equal(safeArticleLogUrl("https://user:secret@example.com/news/123?token=secret#private"), "https://example.com/news/123");
});

test("extracts a photo report caption independently of related article cards", () => {
  const caption = "شرح گزارش تصویری رویداد امروز که باید همراه با تصویر اصلی خبر دریافت شود. ".repeat(2);
  const article = extractArticle(`<h1>گزارش تصویری امروز</h1><div class="news-body-photo">${caption}</div><article><img src="/related.jpg">خبر مرتبط</article>`, "https://example.com/fa/news/123456");
  assert.equal(article?.content, caption.trim());
});

test("retries transient fetch failures once, preserves permanent errors and honors cancellation", async () => {
  let attempts = 0;
  const retried: string[] = [];
  const result = await fetchArticlePage("https://example.com/news/1", new AbortController().signal, (code) => { retried.push(code); }, async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("UPSTREAM_TIMEOUT");
    return { body: "news", finalUrl: "https://example.com/news/1" };
  });
  assert.equal(result.body, "news");
  assert.equal(attempts, 2);
  assert.deepEqual(retried, ["UPSTREAM_TIMEOUT"]);
  attempts = 0;
  await assert.rejects(fetchArticlePage("https://example.com/news/1", new AbortController().signal, undefined, async () => { attempts += 1; throw new Error("UPSTREAM_403"); }), /UPSTREAM_403/);
  assert.equal(attempts, 1);
  attempts = 0;
  await assert.rejects(fetchArticlePage("https://example.com/news/1", new AbortController().signal, undefined, async () => { attempts += 1; throw new Error("UPSTREAM_TIMEOUT"); }), /UPSTREAM_TIMEOUT/);
  assert.equal(attempts, 2);
  attempts = 0;
  const controller = new AbortController(); controller.abort(new Error("USER_CANCELLED"));
  await assert.rejects(fetchArticlePage("https://example.com/news/1", controller.signal, undefined, async () => { attempts += 1; return {body: "", finalUrl: ""}; }), /USER_CANCELLED/);
  assert.equal(attempts, 0);
});

test("extracts structured article data and strips active content", () => {
  const body = "متن کامل خبر برای آزمون استخراج داخلی رسانه ساز ".repeat(6);
  const html = `
    <script type="application/ld+json">${JSON.stringify({
      "@type": "NewsArticle",
      headline: "عنوان خبر آزمایشی",
      articleBody: body,
      datePublished: "2026-10-03T08:30:00Z",
      author: { name: "خبرنگار آزمون" },
      image: "/image.jpg",
    })}</script>
    <article><h1>عنوان خبر آزمایشی</h1><div onclick="alert(1)"><p>${body}</p><script>alert(1)</script></div></article>
  `;
  const article = extractArticle(html, "https://example.com/news/123");
  assert.equal(article?.title, "عنوان خبر آزمایشی");
  assert.equal(article?.author, "خبرنگار آزمون");
  assert.equal(article?.imageUrl, "https://example.com/image.jpg");
  assert.doesNotMatch(article?.contentHtml ?? "", /script|onclick/i);
});
