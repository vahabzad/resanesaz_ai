import assert from "node:assert/strict";
import test from "node:test";
import { resolveSocialSource, SocialSourceAddressError } from "../contracts/src/social-source";
import type { SocialPlatform } from "../contracts/src/social-platforms";
import { runSocialCrawler } from "../src/social/crawler";

test("every social source accepts its own identifier and produces a stable crawler URL", () => {
  const cases: Array<[SocialPlatform, string, string]> = [
    ["instagram", "@sample_news", "https://www.instagram.com/sample_news"], ["telegram", "@sample_news", "https://t.me/sample_news"],
    ["bale", "sample_news", "https://ble.ir/sample_news"], ["eitaa", "@sample_news", "https://eitaa.com/sample_news"],
    ["rubika", "@sample_news", "https://rubika.ir/sample_news"], ["rubino", "@sample_news", "https://rubino.ir/sample_news"],
    ["shad", "c123456", "https://web.shad.ir/#c=c123456"], ["soroush", "sample_news", "https://splus.ir/sample_news"],
    ["x", "@sample_news", "https://x.com/sample_news"], ["youtube", "@sample_news", "https://www.youtube.com/@sample_news"],
    ["aparat", "sample_news", "https://www.aparat.com/sample_news"], ["facebook", "page.name", "https://www.facebook.com/page.name"],
    ["tiktok", "@sample_news", "https://www.tiktok.com/@sample_news"],
  ];
  for (const [platform, value, url] of cases) {
    assert.deepEqual(resolveSocialSource(platform, ` ${value} `), { platform, url });
    assert.deepEqual(resolveSocialSource(platform, url), { platform, url });
    assert.deepEqual(resolveSocialSource(undefined, url), { platform, url });
  }
  assert.equal(resolveSocialSource("eitaa", "https://www.eitaa.com/sample_news").url, "https://eitaa.com/sample_news");
  assert.equal(resolveSocialSource("soroush", "https://www.splus.ir/sample_news").url, "https://splus.ir/sample_news");
  assert.equal(resolveSocialSource("tiktok", "https://m.tiktok.com/@sample_news").url, "https://www.tiktok.com/@sample_news");
  assert.equal(resolveSocialSource("youtube", "https://youtube.com/@اخبار/videos").url, "https://www.youtube.com/@%D8%A7%D8%AE%D8%A8%D8%A7%D8%B1");
  assert.equal(resolveSocialSource("rubino", "https://rubika.ir/sample_news").platform, "rubino");
});

test("wrong networks can be identified without accepting invalid post, invite or private URLs", () => {
  assert.throws(() => resolveSocialSource("instagram", "https://t.me/sample_news"), error => error instanceof SocialSourceAddressError && error.code === "SOCIAL_PLATFORM_MISMATCH" && error.detectedPlatform === "telegram");
  assert.throws(() => resolveSocialSource(undefined, "@sample_news"), /ابتدا شبکه/);
  for (const value of ["https://", "https://instagram.com.evil.test/sample_news", "https://user:secret@instagram.com/sample_news", "http://instagram.com/sample_news", "https://instagram.com/p/123", "https://instagram.com/sample_news?token=secret", "javascript:alert(1)", "sample/news", "../sample", "@a b", "https://127.0.0.1/news"]) assert.throws(() => resolveSocialSource("instagram", value), SocialSourceAddressError);
  assert.throws(() => resolveSocialSource("eitaa", "@a"));
  assert.throws(() => resolveSocialSource("soroush", "@1channel"));
  assert.throws(() => resolveSocialSource("x", "username_is_far_too_long"));
  assert.throws(() => resolveSocialSource("bale", "@page.name"));
  assert.throws(() => resolveSocialSource("shad", "channel_name"));
  assert.throws(() => resolveSocialSource("tiktok", "@page."));
  assert.throws(() => resolveSocialSource("facebook", "https://facebook.com/groups"));
});

test("Rubika public handles reach the browser extractor with the required @ prefix", async () => {
  const result = await runSocialCrawler("rubika", "https://rubika.ir/sample_news", new AbortController().signal, undefined, async () => ({
    async crawlChannel(channel) {
      assert.equal(channel.address, "@sample_news");
      return { profile: { platformKey: "rubika", address: channel.address }, messages: [] };
    },
    async close() {},
  }));
  assert.equal(result.failed, 0);
});
