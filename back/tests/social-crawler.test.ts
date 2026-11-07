import assert from "node:assert/strict";
import test from "node:test";
import { connect } from "node:net";
import { socialPlatformKeys } from "@media/contracts/social-platforms";
import { normalizeSocialSource, detectSocialPlatform, allowsSocialHost } from "../src/social/platforms";
import { createSocialCrawler, runSocialCrawler, socialMessageArticle } from "../src/social/crawler";
import { startSocialProxy } from "../src/social/browser-runtime";
import { PartialCrawlerExtractionError } from "../src/social/engine/domain/crawl/types/PartialCrawlerExtractionError";
import { CrawlerOperationError } from "../src/social/engine/domain/operations/types/Operations.types";
import { parseEitaaBatch } from "../src/social/engine/domain/crawl/platforms/eitaa/crawler/EitaaParser";
import AparatCrawler from "../src/social/engine/domain/crawl/platforms/aparat/crawler/AparatCrawler";
import { sourceRequestKey } from "../contracts/src/media-setup";

test("all thirteen browser extractors load without the reference application", async () => {
  for (const platform of socialPlatformKeys) {
    const crawler = await createSocialCrawler(platform);
    assert.equal(typeof crawler.crawlChannel, "function", platform);
    await crawler.close();
  }
});

test("source identity is canonical and cannot become an arbitrary browser target", () => {
  assert.equal(normalizeSocialSource("telegram", "https://telegram.me/example/"), "https://t.me/example");
  assert.equal(normalizeSocialSource("x", "https://twitter.com/example"), "https://x.com/example");
  assert.equal(normalizeSocialSource("youtube", "https://youtube.com/@example/videos"), "https://www.youtube.com/@example");
  assert.equal(normalizeSocialSource("facebook", "https://facebook.com/profile.php?id=123"), "https://www.facebook.com/profile.php?id=123");
  assert.equal(normalizeSocialSource("shad", "https://web.shad.ir/#c=c123456"), "https://web.shad.ir/#c=c123456");
  for (const input of ["http://t.me/example", "https://t.me.evil.test/example", "https://user:pass@t.me/example", "https://t.me:3000/example", "https://t.me/example/123", "https://t.me/example?token=secret", "https://127.0.0.1/example", "https://t.me/+invite"]) assert.throws(() => normalizeSocialSource("telegram", input), /SOCIAL_ADDRESS_INVALID/);
  assert.throws(() => normalizeSocialSource("youtube", "https://youtube.com/watch?v=123"));
  assert.throws(() => normalizeSocialSource("youtube", "https://youtube.com/channel/invalid"));
  assert.equal(detectSocialPlatform("https://www.instagram.com/example"), "instagram");
  assert.equal(detectSocialPlatform("https://unknown.example/example"), null);
  assert.equal(allowsSocialHost("telegram", "kws1.web.telegram.org"), true);
  assert.equal(allowsSocialHost("telegram", "telegram.org.evil.test"), false);
  assert.equal(allowsSocialHost("telegram", "127.0.0.1"), false);
  assert.notEqual(sourceRequestKey("https://web.shad.ir/#c=c123456"), sourceRequestKey("https://web.shad.ir/#c=c654321"));
  assert.equal(normalizeSocialSource("telegram", "https://t.me/@example"), "https://t.me/example");
  assert.equal(detectSocialPlatform("https://m.rubika.ir/example"), "rubino");
});

test("Aparat excludes foreign promoted videos and missing optional metrics do not invalidate news", async () => {
  const row = { uid: "abcd123", username: "example", title: "خبر آزمایشی", description: "شرح خبر", create_date: "2026-11-03T00:00:00Z" };
  const crawler = new AparatCrawler({ maxVideos: 1, maxShorts: 0, requestIntervalMs: 0 }, async url => url.includes("information")
    ? { data: { attributes: { username: "example", id: "123" } } }
    : { videobyuser: [{ ...row, uid: "other", username: "otherchannel" }, row] });
  try {
    const result = await crawler.crawlChannel({ platformKey: "aparat", address: "example" });
    assert.equal(result.extractionIncomplete, false);
    assert.deepEqual(result.messages.map(message => message.externalId), ["abcd123"]);
    assert.equal(result.messages[0].raw?.likesCount, null);
  } finally { await crawler.close(); }
});

test("native Eitaa extraction verifies peer identity, albums and counters", () => {
  const native = { id: 10, peerId: -12, date: 1791372497, text: "خبر آزمایشی", views: 5, forwards: 0, comments: null, reactions: null, mediaType: "photo", edited: false, pinned: false, groupedId: "123" };
  const batch = { peerId: -12, title: "کانال", username: "example", description: null, followersCount: 10, verified: false, end: true, messages: [native, { ...native, id: 11, text: "" }] };
  const result = parseEitaaBatch("example", batch);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].externalId, "10");
  assert.equal(result.messages[0].raw?.viewsCount, 5);
  assert.equal(result.messages[0].raw?.sharesCount, 0);
  assert.equal(result.messages[0].raw?.commentsCount, null);
  assert.equal(parseEitaaBatch("example", { ...batch, messages: [{ ...native, peerId: -99 }] }).messages.length, 0);
  assert.throws(() => parseEitaaBatch("other", batch), /identity mismatch/);
});

test("news projection retains text and dates and excludes credentials and unsafe links", () => {
  const article = socialMessageArticle("youtube", "https://www.youtube.com/@example", { platformKey: "youtube", externalId: "abcdefghijk", text: "عنوان", publishedAt: "2026-11-03T00:00:00Z", raw: { description: "توضیحات کامل ویدیو", url: "https://www.youtube.com/watch?v=abcdefghijk&token=hidden", thumbnailUrl: "https://cdn.example/image.jpg", auth: "never-persist", cookie: "never-persist" } });
  assert.ok(article);
  assert.match(article.content!, /توضیحات کامل/);
  assert.equal(article.url, "https://www.youtube.com/watch?v=abcdefghijk");
  assert.equal(article.publishedAt, "2026-11-03T00:00:00.000Z");
  assert.doesNotMatch(JSON.stringify(article), /never-persist|hidden/);
  assert.equal(socialMessageArticle("telegram", "https://t.me/example", { platformKey: "telegram", externalId: "10", text: null }), null);
  assert.equal(socialMessageArticle("telegram", "https://t.me/example", { platformKey: "x", externalId: "10", text: "wrong source" }), null);
  const unsafe = socialMessageArticle("telegram", "https://t.me/example", { platformKey: "telegram", externalId: "10", text: "خبر", raw: { permalink: "https://evil.test/steal", imageUrl: "javascript:alert(1)" } });
  assert.equal(unsafe?.url, "https://t.me/example");
  assert.equal(unsafe?.imageUrl, null);
});

test("partial extraction is reported and raw progress never reaches run logs", async () => {
  const events: Record<string, unknown>[] = [];
  let closed = false;
  const result = await runSocialCrawler("telegram", "https://t.me/example", new AbortController().signal, event => { events.push(event); }, async () => ({
    async crawlChannel(channel) {
      assert.equal(channel.address, "example");
      await channel.reportProgress?.({ eventCode: "TELEGRAM_READY", stage: "extract", message: "cookie=private", context: { token: "private" } });
      throw new PartialCrawlerExtractionError(new CrawlerOperationError("sensitive browser url", "EXTRACTION_FAILED"), { messages: [{ platformKey: "telegram", externalId: "10", text: "خبر واقعی fixture" }] });
    },
    async close() { closed = true; },
  }));
  assert.equal(result.articles.length, 1);
  assert.equal(result.failed, 1);
  assert.equal(closed, true);
  assert.doesNotMatch(JSON.stringify(events), /private|cookie|token/);
});

test("cancellation closes the extractor and does not accept late results", async () => {
  const controller = new AbortController();
  let closed = false;
  const promise = runSocialCrawler("telegram", "https://t.me/example", controller.signal, undefined, async () => ({
    async crawlChannel() { controller.abort(); return await new Promise<never>(() => {}); },
    async close() { closed = true; },
  }));
  await assert.rejects(promise, /USER_CANCELLED/);
  assert.equal(closed, true);
});

test("browser proxy refuses private, non-platform and non-TLS tunnels", async () => {
  const proxy = await startSocialProxy("telegram", new AbortController().signal);
  try {
    for (const target of ["127.0.0.1:443", "evil.test:443", "telegram.org:80", "user@telegram.org:443"]) {
      const port = Number(new URL(proxy.url).port);
      const bytes = await new Promise<string>((resolve, reject) => {
        const socket = connect(port, "127.0.0.1", () => socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`));
        let response = "";
        socket.on("data", data => { response += data; });
        socket.once("close", () => resolve(response)); socket.once("error", reject);
        socket.setTimeout(3000, () => { socket.destroy(); reject(new Error("proxy did not reject")); });
      });
      assert.doesNotMatch(bytes, /200 Connection Established/);
    }
  } finally { proxy.close(); }
});
