/* eslint-disable @typescript-eslint/no-require-imports -- The standalone test build emits CommonJS. */
const assert = require("node:assert/strict");
const test = require("node:test");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { NewsSite } = require("../.data/component-test-build/front/components/sites/news-site.js");

test("public renderer escapes hostile text and connects Web Card to the same Web Full story URL", () => {
  const article = { storyId: "story", versionId: "version-7", revision: 7, language: "fa", sectionIds: ["section"], sectionNames: ["جهان"], sourceNames: ["منبع"], publishedAt: "2026-10-14T00:00:00Z", webCard: { title: "عنوان کارت", summary: "خلاصهٔ کارت", imageUrl: null }, webFull: { title: "عنوان کامل", lead: "لید کامل", body: '<script>alert("xss")</script> متن کامل فقط در صفحهٔ خبر', imageUrl: null } };
  const data = { site: { name: "Site", slug: "demo", spec: { title: "رسانهٔ آزمون", tagline: "آزمون", language: "fa", accent: "#b62434", layout: "lead", footer: "حقوق", blocks: [{ id: "latest", title: "آخرین خبرها", sectionIds: [], limit: 8 }] } }, preview: false, articles: [article], blocks: [{ id: "latest", articles: [article] }], pagination: { page: 1, total: 1, pageCount: 1 }, selectedSection: null, sectionOptions: [] };
  const card = renderToStaticMarkup(React.createElement(NewsSite, { data, basePath: "/s/demo" }));
  assert.match(card, /href="\/s\/demo\/news\/story"/); assert.ok(card.includes("عنوان کارت")); assert.ok(!card.includes("متن کامل فقط در صفحهٔ خبر")); assert.match(card, /view=all/);
  const full = renderToStaticMarkup(React.createElement(NewsSite, { data, basePath: "/s/demo", storyId: "story" }));
  assert.ok(full.includes("عنوان کامل")); assert.ok(full.includes("&lt;script&gt;")); assert.ok(!full.includes("<script>"));
});
