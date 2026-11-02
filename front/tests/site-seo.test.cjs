/* eslint-disable @typescript-eslint/no-require-imports -- Standalone tests consume the CommonJS build. */
const test = require("node:test");
const assert = require("node:assert/strict");
const { articleMetadata, publicSiteUrl } = require("../.data/component-test-build/front/lib/site-seo.js");

test("article metadata separates indexable originals from copies and uses only the configured origin", () => {
  const previous = process.env.PUBLIC_SITE_URL;
  try {
    process.env.PUBLIC_SITE_URL = "https://news.example.test";
    const article = { storyId: "story", publishedAt: "2026-10-01T00:00:00Z", seo: { canonicalPath: "/s/main/news/story", noindex: false, modifiedAt: "2026-10-02T00:00:00Z" }, webFull: { title: "عنوان", lead: "لید", imageUrl: null } };
    const data = { preview: false, site: { slug: "main", spec: { title: "سایت" } }, articles: [article] };
    let metadata = articleMetadata(data); assert.equal(metadata.robots.index, true); assert.equal(metadata.alternates.canonical, "https://news.example.test/s/main/news/story"); assert.equal(metadata.openGraph.publishedTime, article.publishedAt); assert.equal(metadata.openGraph.modifiedTime, article.seo.modifiedAt);
    article.seo.noindex = true; assert.equal(articleMetadata(data).robots.index, false);
    data.preview = true; article.seo.noindex = false; assert.equal(articleMetadata(data).robots.index, false);
    delete process.env.PUBLIC_SITE_URL; metadata = articleMetadata(data); assert.equal(metadata.alternates, undefined);
    process.env.PUBLIC_SITE_URL = "https://credential:secret@example.test"; assert.equal(publicSiteUrl("/s/main"), undefined);
    process.env.PUBLIC_SITE_URL = "javascript:alert(1)"; assert.equal(publicSiteUrl("/s/main"), undefined);
  } finally { if (previous === undefined) delete process.env.PUBLIC_SITE_URL; else process.env.PUBLIC_SITE_URL = previous; }
});
