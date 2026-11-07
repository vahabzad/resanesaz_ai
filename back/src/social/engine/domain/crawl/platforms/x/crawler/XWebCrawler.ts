import { BrowserChannelAttempt, browserDeadline, captureBrowserJson } from '../../../helpers/BrowserChannelAttempt';
import { partialExtraction, extractionError } from '../../../helpers/CrawlRecovery';
import type { Browser, HTTPResponse, Page } from 'puppeteer-core';
import fs from 'fs/promises';
import path from 'path';
import { appConfigs } from '../../../../../configs';
import { log } from '../../../../../helper/showLog';
import { CrawlerOperationError } from '../../../../operations/types/Operations.types';
import type {
  CrawlerChannel,
  CrawlerChannelCrawlResult,
  CrawlerChannelProfile,
  CrawlerMessage,
} from '../../../types/Crawler.types';
import { Delay, GenerateWebBrowser } from '../../../helpers/browserHelpers';
import { X_CRAWLER_DEFINITION } from '../XPlatform.definition';
import { parseXGraphqlResponses } from './XGraphqlParser';
import { getXSessionState } from './XSession.helpers';

const RESERVED_PATHS = new Set([
  'compose',
  'explore',
  'home',
  'i',
  'login',
  'messages',
  'notifications',
  'search',
  'settings',
  'signup',
]);

export interface XCrawlerOptions {
  timelineScrollCount?: number;
  channelTimeoutMs?: number;
}

export default class XWebCrawler {
  constructor(private readonly options: XCrawlerOptions = {}) {}
  private browser: Browser | null = null;
  private page: Page | null = null;
  private ownsBrowser = false;
  private busy = false;

  async crawlChannel(channel: CrawlerChannel): Promise<CrawlerChannelCrawlResult> {
    if (this.busy) throw new Error('X crawler already has an active channel');
    const attempt = new BrowserChannelAttempt('x', channel, this.options.channelTimeoutMs ?? X_CRAWLER_DEFINITION.channelTimeoutMs);
    this.busy = true;
    const payloads: unknown[] = [];
    const errors: unknown[] = [];
    const snapshot = () => parseXGraphqlResponses(payloads, channel.address);
    try {
      return await attempt.execute(async () => {
        const page = await this.open(attempt);
        attempt.check(); attempt.page = page;
        await attempt.run('authentication', () => this.assertAuthenticatedPage(page));
        const capture = captureBrowserJson(page, {
          accepts: response => this.isGraphqlResponse(response),
          isActive: () => !attempt.cancelled,
          onPayload: payload => { payloads.push(payload); },
          onError: (error, url) => {
            const path = new URL(url).pathname;
            errors.push(extractionError(error, 'response-capture', { path }));
            attempt.progress('response-capture', 'failed', { path, error: (error as Error).message }, true);
          },
        });
        attempt.cleanups.add(capture.cancel);
        try {
          await attempt.run('navigation', async () => {
            await page.setCacheEnabled(false);
            attempt.check();
            const response = await page.goto(this.normalizeProfileUrl(channel.address), {
              waitUntil: 'domcontentloaded', timeout: X_CRAWLER_DEFINITION.navigationTimeoutMs,
            });
            attempt.check();
            if (response && [404, 410].includes(response.status())) throw new CrawlerOperationError(
              'X account is unavailable', 'NAVIGATION_FAILED', 'profile-unavailable', 'warning');
            await Delay(X_CRAWLER_DEFINITION.profileLoadWaitMs);
          });
          await attempt.run('authentication', () => this.assertAuthenticatedPage(page));
          await attempt.run('profile-capture', capture.flush);
          const unavailable = await attempt.run('profile-availability', () => page.evaluate(String.raw`(() => {
            const nodes = document.querySelectorAll('[data-testid="emptyState"], [data-testid="UserUnavailable"]');
            return Array.from(nodes).some(node => {
              const box = node.getBoundingClientRect();
              return box.width > 0 && box.height > 0 && /doesn.t exist|account suspended|account is suspended|account withheld|حساب.{0,25}(?:وجود ندارد|تعلیق)/i.test(node.textContent || '');
            });
          })()`));
          if (unavailable && !snapshot().profile) throw new CrawlerOperationError('X account is unavailable', 'NAVIGATION_FAILED', 'profile-unavailable', 'warning');
          const total = this.options.timelineScrollCount ?? X_CRAWLER_DEFINITION.timelineScrollCount;
          for (let index = 0; index < total; index++) {
            await attempt.run('timeline-scroll', async () => {
              await page.evaluate(() => window.scrollBy(0, Math.max(window.innerHeight * 0.9, 800)));
              await Delay(X_CRAWLER_DEFINITION.timelineScrollDelayMs);
            }, { progress: `${index + 1}/${total}` });
          }
          capture.stop();
          await attempt.run('response-drain', capture.flush);
          const result = snapshot();
          if (!result.profile) throw new CrawlerOperationError('X profile response could not be extracted', 'EXTRACTION_FAILED', 'profile-no-data', 'warning');
          await attempt.run('profile-callback', async () => { await channel.onProfileCaptured?.(result.profile!); });
          if (errors.length) throw partialExtraction(errors, result);
          attempt.progress('extraction', 'finished', { items: result.messages.length });
          return result;
        } catch (error) {
          if (attempt.cancelled) throw error;
          const failedStage = error instanceof CrawlerOperationError ? error.stage : attempt.stage;
          capture.stop();
          await attempt.run('response-drain-after-error', capture.flush);
          throw partialExtraction([...errors, extractionError(error, failedStage)], snapshot());
        } finally { capture.cancel(); }
      }, snapshot);
    } catch (error) {
      if (this.page === attempt.page) this.page = null;
      throw error;
    } finally { this.busy = false; }
  }

  async fetchChannelProfile(channel: CrawlerChannel): Promise<CrawlerChannelProfile> {
    const result = await this.crawlChannel(channel);
    if (!result.profile) {
      throw new CrawlerOperationError(
        'X profile was not found',
        'EXTRACTION_FAILED',
        'extraction',
        'error',
      );
    }
    return result.profile;
  }

  async fetchNewMessages(channel: CrawlerChannel): Promise<CrawlerMessage[]> {
    return (await this.crawlChannel(channel)).messages;
  }

  async open(attempt?: BrowserChannelAttempt): Promise<Page> {
    if (this.browser?.connected && this.page && !this.page.isClosed()) {
      return this.page;
    }

    if (this.browser?.connected) {
      const page = await this.browser.newPage();
      if (attempt?.cancelled) { await browserDeadline(() => page.close(), 5_000, 'late-page-close').catch(() => undefined); attempt.check(); }
      this.page = page;
      return page;
    }
    const launched = await GenerateWebBrowser(
      X_CRAWLER_DEFINITION.sessionDir,
      X_CRAWLER_DEFINITION.webUrl, undefined, true, { protocolTimeout: 35_000 },
    );
    if (attempt?.cancelled) { await browserDeadline(() => launched.browser.close(), 5_000, 'late-browser-close').catch(() => undefined); attempt.check(); }
    this.browser = launched.browser;
    this.page = launched.page;
    this.ownsBrowser = true;
    log(
      `x browser opened url=${X_CRAWLER_DEFINITION.webUrl} session=${X_CRAWLER_DEFINITION.sessionDir}`,
      'success',
    );
    return launched.page;
  }

  async assertAuthenticated(): Promise<void> {
    const page = await this.open();
    await this.assertAuthenticatedPage(page);
  }

  private async assertAuthenticatedPage(page: Page): Promise<void> {
    const session = await getXSessionState(page);
    if (!session.authenticated) {
      throw new CrawlerOperationError(
        'X session is not authenticated. Run npm run x:login:web first.',
        'AUTH_REQUIRED',
        'authentication',
        'critical',
      );
    }
  }

  normalizeProfileUrl(address: string): string {
    const trimmed = address.trim();
    let username = trimmed.replace(/^@/, '');

    if (/^https?:\/\//i.test(trimmed)) {
      let parsed: URL;
      try {
        parsed = new URL(trimmed);
      } catch {
        throw new Error('X account address must be a username or an x.com profile URL');
      }

      const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
      if (hostname !== 'x.com' && hostname !== 'twitter.com') {
        throw new Error('X profile URL must use x.com or twitter.com');
      }
      username = parsed.pathname.split('/').filter(Boolean)[0] ?? '';
    }

    if (
      !/^[A-Za-z0-9_]{1,15}$/.test(username) ||
      RESERVED_PATHS.has(username.toLowerCase())
    ) {
      throw new Error('X account address must contain a valid public username');
    }

    return `https://x.com/${username}`;
  }

  async close(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    this.page = null;
    if (browser?.connected && this.ownsBrowser) {
      await browserDeadline(() => browser.close(), 5_000, 'browser-close');
      log('x browser closed', 'info');
    } else if (browser?.connected) {
      browser.disconnect();
      log('x crawler disconnected from existing browser', 'info');
    }
    this.ownsBrowser = false;
  }


  private isGraphqlResponse(response: HTTPResponse): boolean {
    const request = response.request();
    if (!['xhr', 'fetch'].includes(request.resourceType())) return false;
    try {
      const url = new URL(response.url());
      return (
        (url.hostname === 'x.com' || url.hostname.endsWith('.x.com')) &&
        /\/(?:i\/api\/)?graphql\//i.test(url.pathname) &&
        (response.headers()['content-type'] ?? '').includes('json')
      );
    } catch {
      return false;
    }
  }
}
