import type { Browser, Page, HTTPResponse } from 'puppeteer-core';
import {
  BrowserChannelAttempt,
  browserDeadline,
} from '../../../helpers/BrowserChannelAttempt';
import { Delay } from '../../../helpers/browserHelpers';
import { openTikTokChrome } from './TikTokChrome';
import { CrawlerOperationError } from '../../../../operations/types/Operations.types';
import type { CrawlerChannel, CrawlerChannelCrawlResult } from '../../../types/Crawler.types';
import { TIKTOK_CRAWLER_DEFINITION as defaults } from '../TikTokPlatform.definition';
import { normalizeTikTokProfileUrl } from './TikTokAddress';
import { TikTokPageCollector } from './TikTokPageParser';
export interface TikTokCrawlerOptions {
  timelineScrollCount?: number;
  maxPosts?: number;
  channelTimeoutMs?: number;
  manualVerificationTimeoutMs?: number;
}
export default class TikTokWebCrawler {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private busy = false;
  constructor(private readonly options: TikTokCrawlerOptions = {}) {
    for (const [key, value] of Object.entries(options))
      if (
        value !== undefined &&
        (!Number.isSafeInteger(value) || value < (key === 'timelineScrollCount' ? 0 : 1))
      )
        throw new Error(`Invalid TikTok ${key}`);
  }
  async open(attempt: BrowserChannelAttempt): Promise<Page> {
    if (!this.browser?.connected) {
      // The same signed-in site presents verification again in headless mode.
      const launched = await openTikTokChrome(
        true
      );
      if (attempt.cancelled) {
        await browserDeadline(
          () => launched.browser.close(),
          5000,
          'late-browser-close'
        ).catch(() => {});
        attempt.check();
      }
      this.browser = launched.browser;
      this.page = launched.page;
    } else if (!this.page || this.page.isClosed()) this.page = await this.browser.newPage();
    const page = this.page!;
    attempt.check();
    attempt.page = page;
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(HTMLMediaElement.prototype, 'play', {
        configurable: true,
        value: () => Promise.resolve(),
      });
    });
    return page;
  }
  async assertUsable(page: Page): Promise<void> {
    const blocked = await page.evaluate(() => {
      const body = document.body?.innerText ?? '';
      return (
        /^\/login(?:\/|$)/.test(location.pathname) ||
        /Drag the slider|Verify to continue|Log in to (?:view|see)|Complete the puzzle/i.test(
          body
        ) ||
        Array.from(
          document.querySelectorAll('[id*="captcha-verify"],iframe[src*="captcha"]')
        ).some((node) => {
          const bounds = node.getBoundingClientRect(),
            style = getComputedStyle(node);
          return (
            bounds.width > 10 &&
            bounds.height > 10 &&
            bounds.bottom > 0 &&
            bounds.right > 0 &&
            bounds.top < innerHeight &&
            bounds.left < innerWidth &&
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            Number(style.opacity) > 0
          );
        })
      );
    });
    if (blocked && this.options.manualVerificationTimeoutMs) {
      console.log(
        'TikTok: complete login/verification manually in this visible test browser; keep this window open.'
      );
      try {
        await page.waitForFunction(
          () =>
            !/^\/login(?:\/|$)/.test(location.pathname) &&
            !/Drag the slider|Verify to continue|Log in to (?:view|see)|Complete the puzzle/i.test(
              document.body?.innerText ?? ''
            ),
          { timeout: this.options.manualVerificationTimeoutMs }
        );
        await Delay(2500);
        return;
      } catch {
        /* Fall through to the same stable authentication error after the bounded manual wait. */
      }
    }
    if (blocked)
      throw new CrawlerOperationError(
        'TikTok requires manual login or verification. Run npm run tiktok:login:web, complete the site verification and close every window of this profile.',
        'AUTH_REQUIRED',
        'authentication',
        'critical'
      );
  }
  async crawlChannel(channel: CrawlerChannel): Promise<CrawlerChannelCrawlResult> {
    if (this.busy) throw new Error('TikTok crawler already has an active channel');
    const address = normalizeTikTokProfileUrl(channel.address);
    const collector = new TikTokPageCollector(
      address,
      this.options.maxPosts ?? defaults.maxPosts
    );
    const attempt = new BrowserChannelAttempt(
      'tiktok',
      { ...channel, address },
      this.options.channelTimeoutMs ?? defaults.channelTimeoutMs
    );
    const pending = new Set<Promise<void>>();
    let captured = 0,
      readFailures = 0,
      rateLimited = false;
    this.busy = true;
    try {
      return await attempt.execute(
        async () => {
          const page = await attempt.run('browser-open', () => this.open(attempt));
          const listener = (response: HTTPResponse) => {
            const parsed = new URL(response.url());
            if (
              attempt.cancelled ||
              !['www.tiktok.com', 'tiktok.com'].includes(parsed.hostname) ||
              parsed.pathname !== '/api/post/item_list/' ||
              response.request().method() === 'OPTIONS' ||
              captured >= 150
            )
              return;
            captured++;
            if (pending.size >= 8) {
              readFailures++;
              return;
            }
            const task = browserDeadline(
              async () => {
                if (response.status() === 429) rateLimited = true;
                if (response.status() >= 400) throw new Error('TikTok feed request failed');
                const body = await response.text();
                if (body.length > 15_000_000)
                  throw new Error('TikTok feed exceeded capture limit');
                if (attempt.cancelled) return;
                const payload = JSON.parse(body);
                const scoped = collector.acceptsFeedUrl(response.url());
                collector.ingest(payload, scoped);
                if (scoped && Array.isArray(payload.itemList) && payload.statusCode === 0)
                  readFailures = 0;
              },
              20_000,
              'response-capture'
            )
              .catch(() => {
                if (!attempt.cancelled) readFailures++;
              })
              .finally(() => pending.delete(task));
            pending.add(task);
          };
          page.on('response', listener);
          attempt.cleanups.add(() => page.off('response', listener));
          await attempt.run('navigation', async () => {
            const response = await page.goto(address, {
              waitUntil: 'domcontentloaded',
              timeout: defaults.navigationTimeoutMs,
            });
            if (response && response.status() >= 400)
              throw new CrawlerOperationError(
                'TikTok profile could not be opened',
                'NAVIGATION_FAILED',
                'navigation',
                'warning'
              );
            if (!['www.tiktok.com', 'tiktok.com'].includes(new URL(page.url()).hostname))
              throw new Error('TikTok navigation left the platform');
            await Delay(5000);
          });
          await attempt.run('initial-page-data', async () => {
            const scripts = await page.$$eval(
              '#__UNIVERSAL_DATA_FOR_REHYDRATION__,#SIGI_STATE',
              (elements) =>
                elements
                  .map((node) => node.textContent ?? '')
                  .filter((body) => body.length < 15_000_000)
            );
            for (const script of scripts) {
              attempt.check();
              try {
                collector.ingest(JSON.parse(script));
              } catch {
                /* Unrelated bootstrap data is not profile content. */
              }
            }
            const profile = collector.snapshot().profile;
            if (profile) await channel.onProfileCaptured?.(profile);
          });
          await attempt.run('authentication', () => this.assertUsable(page));
          if (!collector.snapshot().profile)
            throw new CrawlerOperationError(
              'The requested TikTok profile is unavailable',
              'EXTRACTION_FAILED',
              'profile',
              'warning'
            );
          await attempt.run('initial-feed', async () => {
            await Delay(5000);
            await Promise.allSettled([...pending]);
          });
          if (!collector.timelineSeen && readFailures > 0 && !rateLimited) {
            // One ordinary refresh recovers the transient error also seen in manual use.
            // Never retry a verification challenge or a server rate-limit response.
            await attempt.run('feed-refresh', async () => {
              await this.assertUsable(page);
              await page.reload({
                waitUntil: 'domcontentloaded',
                timeout: defaults.navigationTimeoutMs,
              });
              await Delay(7000);
              await this.assertUsable(page);
              const scripts = await page.$$eval(
                '#__UNIVERSAL_DATA_FOR_REHYDRATION__,#SIGI_STATE',
                (elements) =>
                  elements
                    .map((node) => node.textContent ?? '')
                    .filter((body) => body.length < 15_000_000)
              );
              for (const body of scripts) {
                attempt.check();
                try {
                  collector.ingest(JSON.parse(body));
                } catch {}
              }
              await Promise.allSettled([...pending]);
            });
          }
          if (
            !collector.timelineSeen &&
            !rateLimited &&
            this.options.manualVerificationTimeoutMs
          ) {
            await attempt.run('manual-feed-check', async () => {
              console.log(
                'TikTok: in this test window, refresh the profile manually if needed; keep the window open while its posts load.'
              );
              const until = Date.now() + this.options.manualVerificationTimeoutMs!;
              while (!collector.timelineSeen && Date.now() < until) {
                attempt.check();
                await Delay(1000);
              }
              await Promise.allSettled([...pending]);
            });
          }
          const total = this.options.timelineScrollCount ?? defaults.timelineScrollCount;
          for (let index = 0; index < total; index++) {
            if (
              collector.hasNextPage === false ||
              collector.snapshot().messages.length >=
                (this.options.maxPosts ?? defaults.maxPosts)
            )
              break;
            await attempt.run(
              'timeline-scroll',
              async () => {
                await page.evaluate(() =>
                  window.scrollBy(0, Math.max(window.innerHeight * 1.5, 1400))
                );
                await Delay(defaults.scrollDelayMs);
                await Promise.allSettled([...pending]);
              },
              { progress: `${index + 1}/${total}` }
            );
            await attempt.run('authentication', () => this.assertUsable(page));
          }
          await attempt.run('response-drain', () => Promise.allSettled([...pending]));
          const result = collector.snapshot();
          if (
            !collector.timelineSeen ||
            readFailures ||
            (!result.messages.length && Number(result.profile?.raw?.postsCount) > 0)
          )
            throw new CrawlerOperationError(
              'TikTok did not provide a complete readable profile feed; missing posts are not an empty account',
              'EXTRACTION_FAILED',
              'timeline',
              'warning',
              { failures: readFailures }
            );
          if (
            result.messages.some(
              (message) =>
                !message.publishedAt ||
                message.raw?.viewsCount == null ||
                message.raw?.likesCount == null ||
                message.raw?.commentsCount == null ||
                message.raw?.sharesCount == null
            )
          )
            throw new CrawlerOperationError(
              'Some TikTok posts have incomplete public details',
              'EXTRACTION_FAILED',
              'post-details',
              'warning'
            );
          return result;
        },
        () => collector.snapshot()
      );
    } finally {
      this.busy = false;
    }
  }
  async close(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    this.page = null;
    if (browser?.connected)
      await browserDeadline(() => browser.close(), 10000, 'browser-close');
  }
}
