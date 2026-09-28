import assert from "node:assert/strict";
import test from "node:test";
import { isPrivateOrReservedIp } from "../lib/security/network";
import { parseRssFeed } from "../lib/server/rss-adapter";

test("blocks private, loopback, link-local and documentation IP ranges", () => {
  for (const address of ["127.0.0.1", "10.10.2.3", "172.16.0.1", "192.168.1.2", "169.254.169.254", "::1", "fd00::1", "2001:db8::1"]) {
    assert.equal(isPrivateOrReservedIp(address), true, address);
  }
  assert.equal(isPrivateOrReservedIp("8.8.8.8"), false);
  assert.equal(isPrivateOrReservedIp("2606:4700:4700::1111"), false);
});

test("normalizes RSS items and drops entries without a safe-shaped web URL", () => {
  const items = parseRssFeed(`<?xml version="1.0"?><rss><channel>
    <item><guid>news-1</guid><title>خبر اول</title><link>https://news.example/item/1</link><description><![CDATA[<p>خلاصه خبر</p>]]></description><pubDate>Sun, 28 Sep 2026 08:00:00 GMT</pubDate></item>
    <item><title>بدون پیوند</title></item>
    <item><title>پروتکل نامعتبر</title><link>file:///etc/passwd</link></item>
  </channel></rss>`);

  assert.equal(items.length, 1);
  assert.equal(items[0].externalId, "news-1");
  assert.equal(items[0].canonicalUrl, "https://news.example/item/1");
  assert.equal(items[0].summary, "خلاصه خبر");
  assert.equal(items[0].publishedAt?.toISOString(), "2026-09-28T08:00:00.000Z");
});
