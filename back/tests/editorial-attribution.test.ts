import assert from "node:assert/strict";
import test from "node:test";
import { editorialSourceIdentity } from "../src/server/editorial-source-identity";
import { buildEditorialPrompt } from "../src/server/editorial-rewriter";
import { sectionSettingsSchema } from "../src/server/editorial-settings";

const settings = { factionId: null, viewpointStrength: 0, humor: 0, formality: 70, sourceIds: [], categories: [] };
const input = { sourceKey: "post-1", title: "تیتر", content: "متن خبر", sourceName: "ble.ir", sourceIdentity: editorialSourceIdentity("ble.ir", "https://ble.ir/GizmizTel"), policy: { platformConfigId: "p", platformRevision: 1, sectionName: "عمومی", sectionRevision: 1, instructions: "Preserve the actual speaker and facts.", settings, faction: null } };

test("social attribution identifies the account rather than its hosting platform", () => {
  assert.equal(input.sourceIdentity.displayName, "کانال @GizmizTel در بله");
  assert.equal(editorialSourceIdentity("گیزمیز", "https://ble.ir/GizmizTel/123").displayName, "کانال گیزمیز در بله");
  assert.equal(editorialSourceIdentity("بله", "https://ble.ir/GizmizTel").displayName, "کانال @GizmizTel در بله");
  assert.equal(editorialSourceIdentity("bale.ai", "https://ble.ir/GizmizTel").displayName, "کانال @GizmizTel در بله");
  assert.equal(editorialSourceIdentity("ble.ir/GizmizTel", "https://ble.ir/GizmizTel").displayName, "کانال @GizmizTel در بله");
  assert.equal(editorialSourceIdentity("اینستاگرام", "https://instagram.com/news.page").displayName, "صفحه @news.page در اینستاگرام");
  assert.equal(editorialSourceIdentity("t.me", "https://t.me/news_channel/41").displayName, "کانال @news_channel در تلگرام");
  assert.equal(editorialSourceIdentity("Reuters", "https://reuters.com/world/").displayName, "Reuters");
  assert.equal(editorialSourceIdentity("یوتیوب", "https://youtube.com/watch?v=video").name, ""); // A video ID is never presented as a channel.
  assert.equal(editorialSourceIdentity("یوتیوب", "https://youtube.com/channel/UC123").displayName, "کانال با شناسهٔ UC123 در یوتیوب");
  assert.equal(editorialSourceIdentity("کانال گیزمیز در بله", "https://ble.ir/GizmizTel").displayName, "کانال گیزمیز در بله");
});

test("the explicit credit policy overrides generic style boilerplate and keeps quotation speakers", () => {
  const named = buildEditorialPrompt(input);
  assert.match(named, /SOURCE_ATTRIBUTION_POLICY=named/); assert.match(named, /کانال @GizmizTel در بله/);
  assert.doesNotMatch(named, /Attribute to sourceName in the body/);
  const omitted = buildEditorialPrompt({ ...input, policy: { ...input.policy, settings: { ...settings, sourceAttribution: { website: "named", social: "omit" } } } });
  assert.match(omitted, /SOURCE_ATTRIBUTION_POLICY=omit/); assert.doesNotMatch(omitted, /SOURCE_ATTRIBUTION_POLICY=named/);
  assert.match(omitted, /Preserve named speakers, actual quotations/); assert.match(omitted, /not the speaker of a quotation/);
  const website = buildEditorialPrompt({ ...input, sourceIdentity: editorialSourceIdentity("Reuters", "https://reuters.com"), policy: { ...input.policy, settings: { ...settings, sourceAttribution: { website: "named", social: "omit" } } } });
  assert.match(website, /SOURCE_ATTRIBUTION_POLICY=named/);
  const settingsParsed = sectionSettingsSchema.parse({ ...settings, sourceAttribution: { website: "omit", social: "named" } });
  assert.deepEqual(settingsParsed.sourceAttribution, { website: "omit", social: "named" });
  assert.equal(sectionSettingsSchema.safeParse({ ...settings, sourceAttribution: { website: "unknown", social: "named" } }).success, false);
  assert.equal(sectionSettingsSchema.safeParse({ ...settings, sourceAttribution: { website: "named", social: "omit", extra: true } }).success, false);
});
