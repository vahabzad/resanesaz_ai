import assert from "node:assert/strict";
import test from "node:test";
import { SocialLoginManager, SocialLoginError, allowedSocialLoginRequest, interactiveLoginEnabled } from "../src/social/login-manager";
import { SocialCrawlerError } from "../src/social/platforms";

test("host login is idempotent, closes safely, and never reports authentication from a window lifecycle", async () => {
  let launches = 0;
  const manager = new SocialLoginManager(async (platform, signal, ready) => {
    assert.equal(platform, "bale"); launches++; ready();
    await new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }));
  }, () => true, () => false);
  assert.equal(manager.workspace().sessions.length, 13);
  assert.equal(manager.start("bale").status, "opening");
  await Promise.resolve();
  assert.equal(manager.start("bale").status, "open");
  assert.equal(launches, 1);
  assert.equal((await manager.close("bale")).status, "closed");
  assert.equal((await manager.close("bale")).status, "closed");
  assert.doesNotMatch(JSON.stringify(manager.workspace()), /authenticated|cookie|token|phone|profileDir|userDataDir/);
});

test("disabled and occupied profiles cannot start a login and browser errors expose only known codes", async () => {
  let launched = false;
  const runner = async () => { launched = true; };
  assert.throws(() => new SocialLoginManager(runner, () => false).start("bale"), error => error instanceof SocialLoginError && error.code === "SOCIAL_LOGIN_UNAVAILABLE");
  assert.throws(() => new SocialLoginManager(runner, () => true, () => true).start("bale"), /SOCIAL_PROFILE_BUSY/);
  assert.equal(launched, false);
  const manager = new SocialLoginManager(async () => { throw new Error("cookie=private-token local/private-profile"); }, () => true, () => false);
  manager.start("bale");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(manager.workspace().sessions.find(row => row.platform === "bale")?.errorCode, "SOCIAL_BROWSER_FAILED");
  assert.doesNotMatch(JSON.stringify(manager.workspace()), /private/);
  const missing = new SocialLoginManager(async () => { throw new SocialCrawlerError("SOCIAL_BROWSER_NOT_INSTALLED"); }, () => true, () => false);
  missing.start("telegram");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(missing.workspace().sessions.find(row => row.platform === "telegram")?.errorCode, "SOCIAL_BROWSER_NOT_INSTALLED");
});

test("browser launch requires a trusted-origin JSON action and production opts in explicitly", () => {
  const request = (origin?: string, type = "application/json", site = "same-origin") => new Request("https://panel.example.test/api/v1/platform/social-browser-sessions/bale/open", { method: "POST", headers: { ...(origin ? { origin } : {}), "content-type": type, "sec-fetch-site": site }, body: "{}" });
  assert.equal(allowedSocialLoginRequest(request("https://panel.example.test")), true);
  assert.equal(allowedSocialLoginRequest(request("https://evil.test")), false);
  assert.equal(allowedSocialLoginRequest(request()), false);
  assert.equal(allowedSocialLoginRequest(request("https://panel.example.test", "text/plain")), false);
  assert.equal(allowedSocialLoginRequest(request("https://panel.example.test", "application/json", "cross-site")), false);
  const previousMode = process.env.NODE_ENV, previousSetting = process.env.SOCIAL_BROWSER_INTERACTIVE_LOGIN;
  try {
    process.env.NODE_ENV = "production"; delete process.env.SOCIAL_BROWSER_INTERACTIVE_LOGIN;
    assert.equal(interactiveLoginEnabled(), false);
    process.env.SOCIAL_BROWSER_INTERACTIVE_LOGIN = "true"; assert.equal(interactiveLoginEnabled(), true);
  } finally {
    if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode;
    if (previousSetting === undefined) delete process.env.SOCIAL_BROWSER_INTERACTIVE_LOGIN; else process.env.SOCIAL_BROWSER_INTERACTIVE_LOGIN = previousSetting;
  }
});
