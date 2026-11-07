import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import puppeteer, { type Browser, type LaunchOptions } from "puppeteer-core";
import { launchSocialBrowser, withBrowserRuntime } from "../src/social/browser-runtime";

test("manual login follows the physical window and reuses Chrome's first tab; crawler viewport stays stable", async t => {
  const previousExecutable = process.env.SOCIAL_BROWSER_EXECUTABLE;
  const previousProfile = process.env.SOCIAL_BROWSER_PROFILE_DIR;
  process.env.SOCIAL_BROWSER_EXECUTABLE = process.execPath;
  process.env.SOCIAL_BROWSER_PROFILE_DIR = path.resolve(`.data/test-social-window-${process.pid}`);
  const launches: LaunchOptions[] = [];
  let navigations = 0;
  const page = {
    async setBypassServiceWorker() {},
    setDefaultNavigationTimeout() {},
    async setViewport() { assert.fail("manual login must never emulate a viewport after opening"); },
    async goto(url: string) { assert.equal(url, "https://web.bale.ai/"); navigations++; },
  };
  const browser = { async pages() { return [page]; }, async newPage() { assert.fail("do not leave an extra about:blank tab"); }, async close() {}, process() { return undefined; } };
  t.mock.method(puppeteer, "launch", async (options: LaunchOptions) => { launches.push(options); return browser as unknown as Browser; });
  try {
    await withBrowserRuntime("bale", new AbortController().signal, async () => { await launchSocialBrowser("bale", "https://web.bale.ai/"); }, true);
    assert.equal(launches[0].headless, false);
    assert.equal(launches[0].defaultViewport, null);
    assert.ok(launches[0].args?.includes("--start-maximized"));
    await withBrowserRuntime("bale", new AbortController().signal, async () => { await launchSocialBrowser("bale", "https://web.bale.ai/"); });
    assert.equal(launches[1].headless, true);
    assert.deepEqual(launches[1].defaultViewport, { width: 1440, height: 1000 });
    assert.equal(navigations, 2);
    assert.equal(launches[0].userDataDir, launches[1].userDataDir, "login and crawl must use the same platform profile");
    assert.ok(launches.every(options => options.args?.some(arg => arg.startsWith("--proxy-server="))), "window fix must preserve the guarded network path");
  } finally {
    if (previousExecutable === undefined) delete process.env.SOCIAL_BROWSER_EXECUTABLE; else process.env.SOCIAL_BROWSER_EXECUTABLE = previousExecutable;
    if (previousProfile === undefined) delete process.env.SOCIAL_BROWSER_PROFILE_DIR; else process.env.SOCIAL_BROWSER_PROFILE_DIR = previousProfile;
  }
});
