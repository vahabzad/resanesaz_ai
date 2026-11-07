import type { Browser, HTTPResponse, Page } from 'puppeteer-core';
import { BrowserChannelAttempt, browserDeadline } from '../../../helpers/BrowserChannelAttempt';
import { Delay, GenerateWebBrowser } from '../../../helpers/browserHelpers';
import { CrawlerOperationError } from '../../../../operations/types/Operations.types';
import type { CrawlerChannel, CrawlerChannelCrawlResult } from '../../../types/Crawler.types';
import { FACEBOOK_CRAWLER_DEFINITION as defaults } from '../FacebookPlatform.definition';
import { normalizeFacebookProfileUrl } from './FacebookAddress';
import {
  FacebookPageCollector,
  parseFacebookResponseText,
  parseFacebookCountLabel,
} from './FacebookPageParser';

export interface FacebookCrawlerOptions {
  timelineScrollCount?: number;
  maxPosts?: number;
  channelTimeoutMs?: number;
}

export default class FacebookWebCrawler {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private busy = false;
  constructor(private readonly options: FacebookCrawlerOptions = {}) {
    for (const [key, value] of Object.entries(options)) {
      if (
        value !== undefined &&
        (!Number.isSafeInteger(value) || value < (key === 'timelineScrollCount' ? 0 : 1))
      )
        throw new Error(`Invalid Facebook option: ${key}`);
    }
  }

  async open(attempt: BrowserChannelAttempt): Promise<Page> {
    if (!this.browser?.connected) {
      const launched = await GenerateWebBrowser(
        defaults.sessionDir,
        defaults.webUrl,
        undefined,
        false,
        { protocolTimeout: 35_000 }
      );
      if (attempt.cancelled) {
        await browserDeadline(() => launched.browser.close(), 5000, 'late-browser-close').catch(
          () => {}
        );
        attempt.check();
      }
      this.browser = launched.browser;
      this.page = launched.page;
    } else if (!this.page || this.page.isClosed()) this.page = await this.browser.newPage();
    const page = this.page!;
    if (attempt.cancelled) {
      await page.close();
      attempt.check();
    }
    attempt.page = page;
    // Keep playback paused; crawling does not need to download video streams.
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(HTMLMediaElement.prototype, 'play', {
        configurable: true,
        value: () => Promise.resolve(),
      });
    });
    return page;
  }

  async assertAuthenticatedPage(page: Page): Promise<void> {
    const authenticated = await page.evaluate(() => {
      if (
        /^\/(?:login|checkpoint|two_step_verification|recover|auth_platform)(?:\/|\.|$)/i.test(
          location.pathname
        )
      )
        return false;
      return (
        /(?:^|;\s*)c_user=\d+/.test(document.cookie) &&
        !document.querySelector('input[name="pass"]')
      );
    });
    if (!authenticated)
      throw new CrawlerOperationError(
        'Facebook login is required. Run npm run facebook:login:web, finish verification and close all profile windows.',
        'AUTH_REQUIRED',
        'authentication',
        'critical'
      );
  }

  async crawlChannel(channel: CrawlerChannel): Promise<CrawlerChannelCrawlResult> {
    if (this.busy) throw new Error('Facebook crawler already has an active channel');
    const address = normalizeFacebookProfileUrl(channel.address);
    const collector = new FacebookPageCollector(
      address,
      this.options.maxPosts ?? defaults.maxPosts
    );
    const attempt = new BrowserChannelAttempt(
      'facebook',
      { ...channel, address },
      this.options.channelTimeoutMs ?? defaults.channelTimeoutMs
    );
    const pending = new Set<Promise<void>>();
    let captureErrors = 0;
    let captured = 0;
    this.busy = true;
    try {
      return await attempt.execute(
        async () => {
          const page = await attempt.run('browser-open', () => this.open(attempt));
          const listener = (response: HTTPResponse) => {
            const url = new URL(response.url());
            if (
              attempt.cancelled ||
              url.hostname !== 'www.facebook.com' ||
              url.pathname !== '/api/graphql/' ||
              response.request().method() !== 'POST' ||
              captured >= 150
            )
              return;
            captured++;
            if (pending.size >= 25) {
              captureErrors++;
              return;
            }
            const task = browserDeadline(
              async () => {
                if (response.status() >= 400) throw new Error('Facebook page response failed');
                const body = await response.text();
                if (body.length > 15_000_000)
                  throw new Error('Facebook page response exceeded the capture limit');
                if (attempt.cancelled) return;
                for (const payload of parseFacebookResponseText(body)) collector.ingest(payload);
              },
              20_000,
              'response-capture'
            )
              .catch(() => {
                if (!attempt.cancelled) captureErrors++;
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
                'Facebook page could not be opened',
                'NAVIGATION_FAILED',
                'navigation',
                'warning'
              );
            const location = new URL(page.url());
            if (!['www.facebook.com', 'facebook.com'].includes(location.hostname))
              throw new Error('Facebook navigation left the platform');
            await Delay(4000);
          });
          await attempt.run('authentication', () => this.assertAuthenticatedPage(page));
          await attempt.run('initial-page-data', async () => {
            // Initial Relay payloads are embedded JSON, not additional API requests.
            const scripts = await page.$$eval('script[type="application/json"]', (elements) =>
              elements
                .map((element) => element.textContent ?? '')
                .filter((body) => body.length < 15_000_000)
            );
            for (const body of scripts) {
              attempt.check();
              try {
                for (const payload of parseFacebookResponseText(body)) collector.ingest(payload);
              } catch {
                /* Non-Relay bootstrap scripts contain no page data. */
              }
            }
            await Promise.allSettled([...pending]);
          });
          const profile = collector.snapshot().profile;
          if (!profile)
            throw new CrawlerOperationError(
              'The requested Facebook page profile is unavailable',
              'EXTRACTION_FAILED',
              'profile',
              'warning'
            );
          await attempt.run('profile-details', async () => {
            const details = await page.evaluate(() => {
              const main = document.querySelector('[role="main"]');
              const links = Array.from(
                main?.querySelectorAll('a[href]') ?? []
              ) as HTMLAnchorElement[];
              const followersDisplay =
                links.find((link) => /\/followers\/?(?:\?|$)/.test(link.href))?.innerText ?? null;
              const followingDisplay =
                links.find((link) => /\/following\/?(?:\?|$)/.test(link.href))?.innerText ?? null;
              return { followersDisplay, followingDisplay };
            });
            collector.mergeProfileDetails({
              ...details,
              followersCount: parseFacebookCountLabel(details.followersDisplay),
              followingCount: parseFacebookCountLabel(details.followingDisplay),
            });
            await channel.onProfileCaptured?.(collector.snapshot().profile!);
          });
          const total = this.options.timelineScrollCount ?? defaults.timelineScrollCount;
          for (let index = 0; index < total; index++) {
            if (
              collector.hasNextPage === false ||
              collector.snapshot().messages.length >= (this.options.maxPosts ?? defaults.maxPosts)
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
            await attempt.run('authentication', () => this.assertAuthenticatedPage(page));
          }
          page.off('response', listener);
          await attempt.run('response-drain', async () => {
            await Promise.allSettled([...pending]);
          });
          if (!collector.timelineSeen)
            throw new CrawlerOperationError(
              'Facebook timeline response was not received; an empty feed cannot be confirmed',
              'EXTRACTION_FAILED',
              'timeline',
              'warning'
            );
          const result = collector.snapshot();
          if (captureErrors)
            throw new CrawlerOperationError(
              'Some Facebook page responses could not be read',
              'EXTRACTION_FAILED',
              'response-capture',
              'warning',
              { failures: captureErrors }
            );
          const incomplete = result.messages.some(
            (message) =>
              !message.publishedAt ||
              message.raw?.reactionsCount === null ||
              message.raw?.commentsCount === null ||
              message.raw?.sharesCount === null
          );
          if (incomplete)
            throw new CrawlerOperationError(
              'Some Facebook posts have incomplete public metadata or counters',
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
    if (browser?.connected) await browserDeadline(() => browser.close(), 10_000, 'browser-close');
  }
}
