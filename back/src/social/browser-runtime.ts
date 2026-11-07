import { AsyncLocalStorage } from "node:async_hooks";
import { access, mkdir, chmod } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:http";
import { connect, type Socket } from "node:net";
import puppeteer, { type Browser } from "puppeteer-core";
import type { SocialPlatform } from "@media/contracts/social-platforms";
import { resolvePublicHttpsUrl } from "../server/url-safety";
import { allowsSocialHost, SocialCrawlerError } from "./platforms";

type Runtime = { platform: SocialPlatform; signal: AbortSignal; browsers: Set<Browser>; proxy: string; interactive: boolean };
const runtime = new AsyncLocalStorage<Runtime>();
const activePlatforms = new Set<SocialPlatform>();
export function isSocialBrowserBusy(platform: SocialPlatform) { return activePlatforms.has(platform); }
export function profileRoot() { return path.resolve(process.env.SOCIAL_BROWSER_PROFILE_DIR || ".data/social-browser"); }
export function resolveManualLoginProfileDirectory(platform: string) {
  if (!/^[a-z][a-z0-9-]*$/.test(platform)) throw new SocialCrawlerError("SOCIAL_PLATFORM_INVALID");
  return path.join(profileRoot(), platform);
}
export async function browserExecutable() {
  const candidates = [process.env.SOCIAL_BROWSER_EXECUTABLE, process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"), process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Microsoft/Edge/Application/msedge.exe"), "/usr/bin/google-chrome", "/usr/bin/chromium"].filter((v): v is string => !!v);
  for (const candidate of candidates) { try { await access(candidate); return candidate; } catch { /* next installed browser */ } }
  throw new SocialCrawlerError("SOCIAL_BROWSER_NOT_INSTALLED");
}

// CONNECT tunnels resolve once and connect to the validated IP, so Chromium DNS
// and a publisher's DNS changes cannot redirect the worker to a private service.
export async function startSocialProxy(platform: SocialPlatform, signal: AbortSignal) {
  const sockets = new Set<Socket>();
  let tunnels = 0, bytes = 0;
  const server = createServer((_req, res) => { res.writeHead(403); res.end(); });
  const close = () => { for (const socket of sockets) socket.destroy(); server.close(); };
  server.on("connection", socket => { sockets.add(socket); socket.on("error", () => {}); socket.once("close", () => sockets.delete(socket)); });
  server.on("connect", (req, client, head) => {
    void (async () => {
      if (signal.aborted || ++tunnels > 1200 || bytes > 128 * 1024 * 1024) throw new SocialCrawlerError("SOCIAL_NETWORK_BUDGET");
      const match = /^([a-z0-9.-]+):443$/i.exec(req.url ?? "");
      if (!match || !allowsSocialHost(platform, match[1].toLowerCase())) throw new SocialCrawlerError("SOCIAL_NETWORK_BLOCKED");
      const { addresses } = await resolvePublicHttpsUrl(`https://${match[1]}/`);
      if (signal.aborted || client.destroyed) return;
      const upstream = connect({ host: addresses[0].address, port: 443, family: addresses[0].family });
      sockets.add(upstream);
      upstream.setTimeout(30_000, () => upstream.destroy());
      upstream.on("error", () => client.destroy());
      client.on("error", () => upstream.destroy());
      client.once("close", () => upstream.destroy());
      upstream.once("close", () => { sockets.delete(upstream); client.destroy(); });
      upstream.on("data", data => { bytes += data.length; if (bytes > 128 * 1024 * 1024) close(); });
      client.on("data", data => { bytes += data.length; if (bytes > 128 * 1024 * 1024) close(); });
      upstream.once("connect", () => {
        if (signal.aborted) { upstream.destroy(); return; }
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        client.pipe(upstream); upstream.pipe(client);
      });
    })().catch(() => client.destroy());
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new SocialCrawlerError("SOCIAL_BROWSER_FAILED");
  signal.addEventListener("abort", close, { once: true });
  if (signal.aborted) close();
  return { url: `http://127.0.0.1:${address.port}`, close: () => { signal.removeEventListener("abort", close); close(); } };
}

export async function withBrowserRuntime<T>(platform: SocialPlatform, signal: AbortSignal, operation: () => Promise<T>, interactive = false) {
  signal.throwIfAborted();
  if (activePlatforms.has(platform)) throw new SocialCrawlerError("SOCIAL_PROFILE_BUSY");
  activePlatforms.add(platform);
  let proxy: Awaited<ReturnType<typeof startSocialProxy>>;
  try { proxy = await startSocialProxy(platform, signal); } catch (error) { activePlatforms.delete(platform); throw error; }
  const context: Runtime = { platform, signal, browsers: new Set(), proxy: proxy.url, interactive };
  const stop = () => { for (const browser of context.browsers) { void browser.close().catch(() => browser.process()?.kill()); } };
  signal.addEventListener("abort", stop, { once: true });
  try { return await runtime.run(context, operation); }
  finally {
    signal.removeEventListener("abort", stop);
    await Promise.allSettled([...context.browsers].map(async browser => {
      const kill = setTimeout(() => browser.process()?.kill(), 3000);
      try { await browser.close(); } finally { clearTimeout(kill); }
    }));
    proxy.close();
    activePlatforms.delete(platform);
  }
}

export async function launchSocialBrowser(_session: string, url: string, _headless = true, navigate = true, options: { protocolTimeout?: number } = {}) {
  const context = runtime.getStore();
  if (!context) throw new SocialCrawlerError("SOCIAL_RUNTIME_REQUIRED");
  context.signal.throwIfAborted();
  const directory = resolveManualLoginProfileDirectory(context.platform);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700).catch(() => {});
  const browser = await puppeteer.launch({
    executablePath: await browserExecutable(), userDataDir: directory, headless: !context.interactive,
    // Manual login must follow the real Chrome window, including Windows DPI.
    // A fixed emulated viewport can put login controls below the visible window.
    defaultViewport: context.interactive ? null : { width: 1440, height: 1000 },
    protocolTimeout: Math.min(options.protocolTimeout ?? 35_000, 35_000),
    args: [`--proxy-server=${context.proxy}`, "--proxy-bypass-list=<-loopback>", "--disable-quic", "--disable-extensions", "--disable-background-networking", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp", ...(context.interactive ? ["--start-maximized"] : [])],
  }).catch(error => { throw new SocialCrawlerError(/already running|SingletonLock|profile.*in use/i.test(String(error)) ? "SOCIAL_PROFILE_BUSY" : "SOCIAL_BROWSER_FAILED"); });
  context.browsers.add(browser);
  if (context.signal.aborted) { await browser.close(); context.signal.throwIfAborted(); }
  const page = (await browser.pages())[0] ?? await browser.newPage();
  await page.setBypassServiceWorker(true);
  page.setDefaultNavigationTimeout(45_000);
  if (navigate) await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  return { browser, page };
}
