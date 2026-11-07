import type { Browser, HTTPRequest, HTTPResponse, Page } from 'puppeteer-core';
import { GenerateWebBrowser } from '../../../helpers/browserHelpers';
import { asRecord } from '../../../helpers/dataHelpers';
import { APARAT_CRAWLER_DEFINITION } from '../AparatPlatform.definition';

export interface AparatBrowserReply {
  status: number;
  headers: Record<string, string>;
  payload: unknown;
  source: 'capture' | 'page-api';
}

const headersToKeep = ['retry-after', 'x-rr-ratelimit-remaining', 'x-rr-ratelimit-reset'];
const apiHosts = new Set(['www.aparat.com', 'shorts.aparat.com']);

/** Only public read endpoints needed for the active channel can enter the response cache. */
export function isAparatReadApi(url: string): boolean {
  try {
    const value = new URL(url);
    return value.protocol === 'https:' && !value.username && !value.password && !value.port &&
      ((value.hostname === 'www.aparat.com' && /^\/(?:api\/fa\/v1\/(?:user\/user\/information\/username\/[A-Za-z0-9_.-]+|user\/video\/list\/username\/[A-Za-z0-9_.-]+(?:\/perpage\/\d+\/nextid\/\d+\/isnextpage\/true)?|video\/video\/show\/videohash\/[A-Za-z0-9]+)|etc\/api\/videobyuser\/username\/[A-Za-z0-9_.-]+\/perpage\/\d+\/curoffset\/\d+)\/?$/i.test(value.pathname)) ||
        (value.hostname === 'shorts.aparat.com' && /^\/api\/v1\/(?:profile\/\d+\/posts|posts\/\d+)\/?$/.test(value.pathname)));
  } catch { return false; }
}

function cacheKey(input: string): string {
  const url = new URL(input);
  const params = new URLSearchParams();
  for (const key of ['from', 'count']) if (url.searchParams.has(key)) params.set(key, url.searchParams.get(key)!);
  params.sort();
  return `${url.origin}${url.pathname.replace(/\/$/, '')}${params.size ? `?${params}` : ''}`;
}

export function normalizeAparatVideoList(payload: unknown, username: string): Record<string, unknown> {
  const root = asRecord(payload);
  if (Array.isArray(root.videobyuser)) return root;
  if (!Array.isArray(root.data)) throw new Error('Invalid Aparat browser video list');
  const items: unknown[] = [];
  let next: string | null = null;
  for (const entry of root.data) {
    const widget = asRecord(entry);
    if (widget.output_type !== 'video') continue;
    const rows = asRecord(widget.video).data;
    if (Array.isArray(rows)) items.push(...rows);
    const link = asRecord(widget.link).next;
    if (typeof link === 'string') {
      const target = new URL(link, 'https://www.aparat.com');
      if (!isAparatReadApi(target.href) || !target.pathname.startsWith(`/api/fa/v1/user/video/list/username/${username}/`)) {
        throw new Error('Invalid Aparat channel pagination link');
      }
      next = target.href;
    }
  }
  return { videobyuser: items, ui: { pagingForward: next }, sourceApi: 'browser-video-list' };
}

export default class AparatBrowserSession {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private username: string | null = null;
  private shortsReady = false;
  private generation = 0;
  private readonly replies = new Map<string, AparatBrowserReply>();
  private readonly pending = new Set<Promise<void>>();
  private listener: ((response: HTTPResponse) => void) | null = null;
  private readonly requestGenerations = new WeakMap<HTTPRequest, number>();
  private opening: Promise<Page> | null = null;
  private lifecycle = 0;

  async open(): Promise<Page> {
    if (this.browser?.connected && this.page && !this.page.isClosed()) return this.page;
    if (this.opening) return this.opening;
    this.opening = this.launch();
    try { return await this.opening; } finally { this.opening = null; }
  }

  private async launch(): Promise<Page> {
    const lifecycle = this.lifecycle;
    const session = await GenerateWebBrowser('aparat', 'https://www.aparat.com', undefined, false);
    if (lifecycle !== this.lifecycle) { await session.browser.close(); throw new Error('Aparat browser opening canceled'); }
    this.browser = session.browser; this.page = session.page;
    await this.page.setRequestInterception(true);
    this.page.on('request', request => {
      this.requestGenerations.set(request, this.generation);
      let block = request.resourceType() === 'media';
      try {
        const url = new URL(request.url());
        block ||= /\.(?:m3u8|mp4)(?:$|\?)/i.test(url.pathname) || url.pathname.includes('/visitpost/');
        block ||= apiHosts.has(url.hostname) && url.pathname.includes('/api/') && !['GET', 'OPTIONS'].includes(request.method());
      } catch { /* The browser handles non-HTTP resource URLs. */ }
      void (block ? request.abort() : request.continue()).catch(() => {});
    });
    this.listener = response => {
      if (!isAparatReadApi(response.url()) || response.request().method() !== 'GET') return;
      const generation = this.requestGenerations.get(response.request()) ?? this.generation;
      const task = (async () => {
        try {
          let payload: unknown = null;
          try { payload = await response.json(); } catch { if (response.status() < 400) return; }
          if (generation !== this.generation || !this.username) return;
          const headers = response.headers();
          this.replies.set(cacheKey(response.url()), { status: response.status(), payload,
            headers: Object.fromEntries(headersToKeep.flatMap(key => headers[key] ? [[key, headers[key]]] : [])), source: 'capture' });
        } catch { /* Non-JSON responses are handled by the explicit page API fallback. */ }
      })();
      this.pending.add(task); void task.finally(() => this.pending.delete(task));
    };
    this.page.on('response', this.listener);
    return this.page;
  }

  async startChannel(username: string): Promise<void> {
    this.generation++; this.replies.clear(); this.username = username; this.shortsReady = false;
    const page = await this.open();
    await this.navigate(page, `https://www.aparat.com/${encodeURIComponent(username)}`, response =>
      response.url().includes(`/user/user/information/username/${username}`));
  }

  private async navigate(page: Page, url: string, ready: (response: HTTPResponse) => boolean) {
    const captured = page.waitForResponse(ready, { timeout: 8000 }).catch(() => null);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await captured; await Promise.all([...this.pending]);
    const location = new URL(page.url());
    if (location.protocol !== 'https:' || !['www.aparat.com', 'aparat.com', 'shorts.aparat.com'].includes(location.hostname)) {
      throw new Error('Aparat channel navigation left the platform');
    }
  }

  async request(input: string, signal: AbortSignal): Promise<AparatBrowserReply> {
    if (!isAparatReadApi(input) || !this.username) throw new Error('Invalid Aparat page API request');
    if (signal.aborted) throw new Error('Aparat browser request stopped');
    const page = this.page;
    if (!page || page.isClosed()) throw new Error('Aparat browser page is closed');
    let url = input;
    const legacy = /\/etc\/api\/videobyuser\/username\/([^/]+)\/perpage\/\d+\/curoffset\/0$/i.exec(new URL(url).pathname);
    if (legacy) url = `https://www.aparat.com/api/fa/v1/user/video/list/username/${encodeURIComponent(this.username)}`;
    const target = new URL(url);
    if (target.hostname === 'shorts.aparat.com' && !this.shortsReady) {
      await this.navigate(page, `https://www.aparat.com/shorts/user/shorts?user=${encodeURIComponent(this.username)}`, response =>
        response.url().startsWith('https://shorts.aparat.com/api/v1/profile/') && response.url().includes('/posts'));
      this.shortsReady = true;
    }
    const captured = this.replies.get(cacheKey(url));
    let reply = captured;
    if (!reply) {
      // Fetch runs in the existing site page. Cookies and any browser session stay there.
      reply = await page.evaluate(`(async () => {
        if (!['https://www.aparat.com', 'https://aparat.com', 'https://shorts.aparat.com'].includes(location.origin)) throw new Error('Invalid Aparat page origin');
        const response = await fetch(${JSON.stringify(url)}, {
          method: 'GET', credentials: 'include', headers: ${JSON.stringify(target.hostname === 'www.aparat.com' ? { Accept: 'application/json', Jsontype: 'simple' } : { Accept: 'application/json' })},
          signal: AbortSignal.timeout(${APARAT_CRAWLER_DEFINITION.requestTimeoutMs})
        });
        const headers = {};
        for (const key of ${JSON.stringify(headersToKeep)}) { const value = response.headers.get(key); if (value) headers[key] = value; }
        let payload = null;
        try { payload = await response.json(); } catch {}
        return {status:response.status, headers, payload, source:'page-api'};
      })()`) as AparatBrowserReply;
    }
    if (signal.aborted) throw new Error('Aparat browser request stopped');
    if (reply.status >= 200 && reply.status < 300 && target.pathname.includes('/user/video/list/username/')) {
      return { ...reply, payload: normalizeAparatVideoList(reply.payload, this.username) };
    }
    return reply;
  }

  clearCaptured() { this.generation++; this.replies.clear(); }
  async close() {
    this.lifecycle++;
    this.clearCaptured(); this.username = null; this.shortsReady = false;
    const browser = this.browser, page = this.page;
    this.browser = null; this.page = null;
    if (page && this.listener) page.off('response', this.listener);
    this.listener = null;
    if (browser?.connected) await browser.close();
    await Promise.all([...this.pending]);
  }
}
