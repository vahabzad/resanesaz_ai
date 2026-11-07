import { socialPlatformKeys, type SocialPlatform } from "@media/contracts/social-platforms";
import type { SocialLoginState, SocialSessionsWorkspace } from "@media/contracts/social-sessions";
import { browserHome, SocialCrawlerError } from "./platforms";
import { isSocialBrowserBusy, launchSocialBrowser, withBrowserRuntime } from "./browser-runtime";

export class SocialLoginError extends Error {
  constructor(readonly code: "SOCIAL_LOGIN_UNAVAILABLE" | "SOCIAL_PROFILE_BUSY") { super(code); }
}
export function interactiveLoginEnabled() {
  if (process.env.SOCIAL_BROWSER_INTERACTIVE_LOGIN !== undefined) return process.env.SOCIAL_BROWSER_INTERACTIVE_LOGIN === "true";
  return process.env.NODE_ENV !== "production" && (process.platform === "win32" || !!process.env.DISPLAY || !!process.env.WAYLAND_DISPLAY);
}
type LoginRunner = (platform: SocialPlatform, signal: AbortSignal, ready: () => void) => Promise<void>;
async function loginRunner(platform: SocialPlatform, signal: AbortSignal, ready: () => void) {
  await withBrowserRuntime(platform, signal, async () => {
    const { browser } = await launchSocialBrowser(platform, browserHome[platform], false);
    ready();
    await new Promise<void>(resolve => {
      if (!browser.connected) resolve();
      else browser.once("disconnected", resolve);
    });
  }, true);
}
const empty = (platform: SocialPlatform): SocialLoginState => ({ platform, status: "idle", startedAt: null, finishedAt: null, errorCode: null });
type Entry = { state: SocialLoginState; controller: AbortController; task: Promise<void> };

export class SocialLoginManager {
  private entries = new Map<SocialPlatform, Entry>();
  constructor(private readonly runner: LoginRunner = loginRunner, private readonly enabled = interactiveLoginEnabled, private readonly busy = isSocialBrowserBusy) {}
  workspace(): SocialSessionsWorkspace {
    return { interactiveLoginEnabled: this.enabled(), sessions: socialPlatformKeys.map(platform => ({ ...(this.entries.get(platform)?.state ?? empty(platform)) })) };
  }
  start(platform: SocialPlatform) {
    if (!this.enabled()) throw new SocialLoginError("SOCIAL_LOGIN_UNAVAILABLE");
    const current = this.entries.get(platform);
    if (current && ["opening", "open", "closing"].includes(current.state.status)) return { ...current.state };
    if (this.busy(platform)) throw new SocialLoginError("SOCIAL_PROFILE_BUSY");
    const controller = new AbortController();
    const entry: Entry = { state: { ...empty(platform), status: "opening", startedAt: new Date().toISOString() }, controller, task: Promise.resolve() };
    this.entries.set(platform, entry);
    const timeout = AbortSignal.timeout(20 * 60_000);
    const signal = AbortSignal.any([controller.signal, timeout]);
    entry.task = Promise.resolve().then(() => this.runner(platform, signal, () => {
      if (!signal.aborted) entry.state.status = "open";
    })).then(() => {
      entry.state.status = timeout.aborted && !controller.signal.aborted ? "failed" : "closed";
      entry.state.errorCode = timeout.aborted && !controller.signal.aborted ? "SOCIAL_LOGIN_TIMEOUT" : null;
    }).catch(error => {
      entry.state.status = controller.signal.aborted ? "closed" : "failed";
      const known = error instanceof SocialCrawlerError ? error.code : "SOCIAL_BROWSER_FAILED";
      entry.state.errorCode = controller.signal.aborted ? null : timeout.aborted ? "SOCIAL_LOGIN_TIMEOUT" : ["SOCIAL_BROWSER_NOT_INSTALLED", "SOCIAL_PROFILE_BUSY"].includes(known) ? known : "SOCIAL_BROWSER_FAILED";
    }).finally(() => { entry.state.finishedAt = new Date().toISOString(); });
    return { ...entry.state };
  }
  async close(platform: SocialPlatform) {
    const entry = this.entries.get(platform);
    if (!entry || !["opening", "open", "closing"].includes(entry.state.status)) return { ...(entry?.state ?? empty(platform)) };
    entry.state.status = "closing";
    entry.controller.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([entry.task, new Promise(resolve => { timer = setTimeout(resolve, 6000); })]); }
    finally { if (timer) clearTimeout(timer); }
    return { ...entry.state };
  }
}
export const socialLoginManager = new SocialLoginManager();

// Browser launch is a host action: require an explicit same/trusted-origin JSON request.
export function allowedSocialLoginRequest(request: Request) {
  if (!(request.headers.get("content-type")?.toLowerCase().split(";")[0].trim() === "application/json")) return false;
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") return false;
  const configured = [new URL(request.url).origin, process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000", ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(",")];
  return configured.some(value => { try { return new URL(value.trim()).origin === origin; } catch { return false; } });
}
