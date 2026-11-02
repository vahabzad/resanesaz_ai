import assert from "node:assert/strict";
import test from "node:test";
import { buildSocialOutput, socialOutputSchema } from "../src/server/editorial-social-output";
import { buildRenditions } from "../src/server/editorial-renditions";
import { defaultSocialOutput } from "../contracts/src/editorial-settings";
import { buildEditorialPrompt } from "../src/server/editorial-rewriter";

const article = { title: "تیتر نمونه", lead: "لید نمونه", body: "پاراگراف نخست\n\nپاراگراف دوم", imageUrl: "https://source.test/image.jpg" };

test("social formats select canonical content, keep legacy defaults and leave web renditions independent", () => {
  assert.deepEqual(buildSocialOutput(article), { text: "تیتر نمونه\n\nلید نمونه", imageUrl: article.imageUrl });
  assert.equal(buildSocialOutput(article, { ...defaultSocialOutput, format: "lead" }).text, article.lead);
  assert.equal(buildSocialOutput(article, { ...defaultSocialOutput, format: "title" }).text, article.title);
  assert.equal(buildSocialOutput(article, { ...defaultSocialOutput, format: "title_body" }).text, `${article.title}\n\n${article.body}`);
  assert.equal(buildSocialOutput({ ...article, lead: "" }, { ...defaultSocialOutput, format: "lead" }).text, "پاراگراف نخست");
  const renditions = buildRenditions(article, undefined, { ...defaultSocialOutput, format: "title", includeImage: false });
  assert.equal(renditions.social.imageUrl, null);
  assert.equal(renditions.webCard.imageUrl, article.imageUrl);
  assert.equal(renditions.webFull.body, article.body);
  const custom = { social: { text: "متن اختصاصی سردبیر", imageUrl: null }, webCard: renditions.webCard };
  assert.deepEqual(buildRenditions(article, custom, defaultSocialOutput).social, custom.social);
});

test("social clipping reserves fixed text, respects the complete length and does not split emoji", () => {
  const settings = socialOutputSchema.parse({ ...defaultSocialOutput, format: "title_body", maxLength: 100, prefix: "🔴 فوری", suffix: "#خبر\nرسانهٔ نمونه" });
  const output = buildSocialOutput({ ...article, title: "🔴".repeat(120) }, settings);
  assert.ok(output.text.length <= 100);
  assert.ok(output.text.startsWith(`${settings.prefix}\n\n`));
  assert.ok(output.text.endsWith(`\n\n${settings.suffix}`));
  assert.ok(output.text.includes("…"));
  assert.equal(Buffer.from(output.text, "utf8").toString("utf8"), output.text);
});

test("social settings reject invalid enums, lengths, HTML and oversized fixed text", () => {
  for (const patch of [{ format: "unknown" }, { maxLength: 99 }, { maxLength: 2001 }, { maxLength: 150.5 }, { prefix: "<script>run()</script>" }, { suffix: "x".repeat(301) }, { maxLength: 100, suffix: "x".repeat(90) }, { includeImage: "yes" }, { mediaId: "foreign" }]) {
    assert.equal(socialOutputSchema.safeParse({ ...defaultSocialOutput, ...patch }).success, false);
  }
});

test("literal social prefixes never enter the model's trusted editorial policy", () => {
  const prompt = buildEditorialPrompt({ sourceKey: "s", title: article.title, content: article.body, sourceName: "source", policy: { platformConfigId: "p", platformRevision: 1, instructions: "preserve facts", sectionName: "news", sectionRevision: 1, faction: null, settings: { factionId: null, viewpointStrength: 0, humor: 0, formality: 70, sourceIds: [], categories: [], socialOutput: { ...defaultSocialOutput, prefix: "literal-prefix-marker" } } } });
  assert.doesNotMatch(prompt, /literal-prefix-marker|socialOutput/);
});
