/// <reference lib="dom" />
import { attemptExtraction, partialExtraction, extractionError } from '../../../helpers/CrawlRecovery';
import { PartialCrawlerExtractionError } from '../../../types/PartialCrawlerExtractionError';

import type { Browser, HTTPResponse, Page } from 'puppeteer-core';
import fs from 'fs/promises';
import path from 'path';
import { appConfigs } from '../../../../../configs';
import { log } from '../../../../../helper/showLog';
import { CrawlerOperationError } from '../../../../operations/types/Operations.types';
import { Delay, GenerateWebBrowser, type NetworkLogEntry } from '../../../helpers/browserHelpers';
import { asNumber, asRecord, asString } from '../../../helpers/dataHelpers';
import type {
  CrawlerChannel,
  CrawlerChannelCrawlResult,
  CrawlerChannelProfile,
  CrawlerMessage,
  CrawlerStory,
} from '../../../types/Crawler.types';
import {
  getInstagramCollectionState,
  mergeInstagramMessage,
  parseInstagramCrawlResult,
  parseInstagramReelDetail,
  parseInstagramStories,
} from './InstagramNetworkParser';
import { INSTAGRAM_CRAWLER_DEFINITION } from '../InstagramPlatform.definition';
import { fetchInstagramReadApi, instagramDeadline } from './InstagramApiRequests';
import { instagramProgressMessage, type InstagramLogContext, type InstagramLogFields } from './InstagramProgress';

export interface InstagramCrawlerOptions {
  includeStories?: boolean;
  channelTimeoutMs?: number;
  maxTabScrolls?: number;
  maxReelDetailFetches?: number;
  storyScreenshotDirectory?: string;
  findStoredStoryIds?(channelId: string, externalIds: string[]): Promise<Set<string>>;
  findDetailResolvedExternalPostIds?(channelId: string, externalIds: string[]): Promise<Set<string>>;
}

interface InstagramAttempt {
  cancelled: boolean;
  stage: string;
  logs: NetworkLogEntry[];
  errors: unknown[];
  recovered: CrawlerChannelCrawlResult;
  page?: Page;
  capture?: { cancel?: () => void; stop: () => Promise<void> };
}

export default class InstagramWebCrawler {
  constructor(private readonly options: InstagramCrawlerOptions = {}) {
    if (options.channelTimeoutMs != null && (!Number.isFinite(options.channelTimeoutMs) || options.channelTimeoutMs <= 0)) throw new Error('Invalid Instagram channel timeout');
  }

  private browser: Browser | null = null;
  private page: Page | null = null;
  private ownsBrowser = false;
  private busy = false;
  private resourceGeneration = 0;
  private readonly progressContexts = new WeakMap<Page, InstagramLogContext>();

  private progress(page: Page, stage: string, event: string, fields: InstagramLogFields = {}, level: 'info' | 'warning' | 'success' = 'info') {
    const context = this.progressContexts.get(page) ?? {};
    if (typeof fields.progress === 'string') context.progress = fields.progress;
    if (typeof fields.itemId === 'string') context.itemId = fields.itemId;
    log(instagramProgressMessage(context, stage, event, fields), level);
  }

  async crawlChannel(channel: CrawlerChannel): Promise<CrawlerChannelCrawlResult> {
    if (this.busy) throw new Error('Instagram crawler already has an active channel');
    this.busy = true;
    const attempt: InstagramAttempt = { cancelled: false, stage: 'browser-open', logs: [], errors: [], recovered: { messages: [] } };
    const timeoutMs = this.options.channelTimeoutMs ?? INSTAGRAM_CRAWLER_DEFINITION.channelTimeoutMs;
    log(instagramProgressMessage({ channelId: channel.id, account: channel.address }, 'browser-open', 'started', { timeoutMs }), 'info');
    try {
      return await instagramDeadline(() => this.crawlAttempt(channel, attempt), timeoutMs, 'channel-deadline');
    } catch (error) {
      if (!(error instanceof CrawlerOperationError) || error.stage !== 'channel-deadline') throw error;
      attempt.cancelled = true;
      this.resourceGeneration++;
      attempt.capture?.cancel?.();
      const captured = parseInstagramCrawlResult(attempt.logs, channel.address);
      const messages = new Map(captured.messages.map(message => [message.externalId, message]));
      for (const message of attempt.recovered.messages) messages.set(message.externalId, message);
      const profile = attempt.recovered.profile ?? captured.profile;
      const stories = new Map(parseInstagramStories(attempt.logs, asString(profile?.raw?.instagramUserId)).map(story => [story.externalId, story]));
      for (const story of attempt.recovered.stories ?? []) stories.set(story.externalId, story);
      const result = { ...captured, ...attempt.recovered, profile,
        messages: [...messages.values()].map(message => ({ ...message, raw: { ...message.raw } })),
        stories: [...stories.values()].map(story => ({ ...story, raw: { ...story.raw } })) };
      const page = attempt.page;
      if (this.page === page) this.page = null;
      if (page && !page.isClosed()) await instagramDeadline(() => page.close({ runBeforeUnload: false }), 5_000, 'stalled-page-close').catch(() => undefined);
      const failure = new CrawlerOperationError(`Instagram channel time budget exceeded at ${attempt.stage}; continuing to next channel`,
        'EXTRACTION_FAILED', attempt.stage, 'warning', { timeoutMs, channelId: channel.id });
      log(instagramProgressMessage(this.progressContexts.get(page!) ?? { channelId: channel.id, account: channel.address }, attempt.stage, 'timeout', { timeoutMs, error: failure.message }), 'warning');
      throw partialExtraction([failure, ...attempt.errors], result);
    } finally { this.busy = false; }
  }

  private async crawlAttempt(channel: CrawlerChannel, attempt: InstagramAttempt): Promise<CrawlerChannelCrawlResult> {
    const assertActive = () => { if (attempt.cancelled) throw new Error('Instagram channel attempt cancelled'); };
    const stage = async <T>(name: string, task: () => Promise<T>): Promise<T> => {
      assertActive(); attempt.stage = name;
      const startedAt = Date.now();
      this.progressContexts.set(page, { channelId: channel.id, account: channel.address });
      this.progress(page, name, 'started');
      try {
        const value = await task();
        assertActive();
        this.progress(page, name, 'finished', { elapsedMs: Date.now() - startedAt });
        return value;
      } catch (error) {
        this.progress(page, name, 'failed', { elapsedMs: Date.now() - startedAt, error: (error as Error).message }, 'warning');
        throw error;
      }
    };
    const page = await this.open();
    assertActive(); attempt.page = page;
    this.progressContexts.set(page, { channelId: channel.id, account: channel.address });
    const { logs, errors } = attempt;
    const capture = this.attachApiCapture(page, logs, errors);
    attempt.capture = capture;
    let recovered: CrawlerChannelCrawlResult = { messages: [] };

    try {
      const profileUrl = this.normalizeProfileUrl(channel.address);
      try {
        const response = await stage('profile-navigation', () => page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 }));
        if (response && [404, 410].includes(response.status())) throw new CrawlerOperationError('Instagram profile is unavailable', 'EXTRACTION_FAILED', 'profile-unavailable', 'warning', { httpStatus: response.status() });
      } catch (error) {
        if (error instanceof CrawlerOperationError) throw error;
        throw new CrawlerOperationError(
          `Instagram profile navigation failed: ${(error as Error).message}`,
          'NAVIGATION_FAILED',
          'navigation',
          'error'
        );
      }

      await Delay(6_000);
      assertActive();
      if (await this.isLoginPage(page)) {
        throw new CrawlerOperationError(
          'Instagram session is not authenticated',
          'AUTH_REQUIRED',
          'authentication',
          'critical'
        );
      }

      await stage('profile-capture', capture.flush);
      if (!parseInstagramCrawlResult(logs, channel.address).profile && await stage('profile-availability', () => this.isUnavailablePage(page))) {
        throw new CrawlerOperationError('Instagram profile is unavailable; continuing to next channel', 'EXTRACTION_FAILED', 'profile-unavailable', 'warning');
      }

      const reelViewCounts = new Map<string, number>();
      await stage('posts', () => attemptExtraction(errors, 'posts', () => this.collectTab(page, logs, 'posts')));
      await stage('posts-capture', capture.flush);
      const initial = parseInstagramCrawlResult(logs, channel.address);
      attempt.recovered = initial;
      if (!initial.profile && !initial.messages.length) throw new CrawlerOperationError(
        'Instagram profile returned no usable data; continuing to next channel', 'EXTRACTION_FAILED', 'profile-no-data', 'warning');
      const reelsTabOpened = await stage('reels-navigation', () => attemptExtraction(errors, 'reels-navigation', () => this.openReelsTab(page, profileUrl)));
      if (reelsTabOpened) {
        await stage('reels-capture', capture.flush);
        if (getInstagramCollectionState(logs, 'reels').count === 0) {
          this.progress(page, 'reels-reload', 'retry', { attempt: '1/1', reason: 'no-api-items' }, 'warning');
          await stage('reels-reload', () => attemptExtraction(errors, 'reels-navigation', () => page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })));
          await Delay(5_000);
          await stage('reels-reload-capture', capture.flush);
        }
        if (getInstagramCollectionState(logs, 'reels').count > 0) {
          await stage('reels', () => attemptExtraction(errors, 'reels', () => this.collectTab(page, logs, 'reels')));
          await stage('reel-metrics', () => attemptExtraction(errors, 'reel-metrics', () => this.collectReelViewCounts(page, reelViewCounts)));
          await Delay(2_000);
          await stage('reel-metrics-capture', capture.flush);
        } else {
          this.progress(page, 'reels', 'skipped', { reason: 'no-api-items-after-reload' }, 'warning');
          if ((asNumber(initial.profile?.raw?.reelsCount) ?? 0) > 0) errors.push(new CrawlerOperationError(
            'Instagram profile has reels but no reel API items were received', 'EXTRACTION_FAILED', 'reels-empty', 'warning'));
        }
      } else {
        log(
          `instagram reels tab unavailable; continuing without reels channelId=${channel.id ?? ''} address=${channel.address}`,
          'warning'
        );
      }

      const result = parseInstagramCrawlResult(logs, channel.address);
      recovered = result;
      attempt.recovered = result;
      this.mergeReelViewCounts(result.messages, reelViewCounts);
      if (!result.profile) {
        throw new CrawlerOperationError(
          'Instagram profile response could not be extracted',
          'EXTRACTION_FAILED',
          'extraction',
          'error',
          { address: channel.address }
        );
      }

      await stage('profile-persistence', async () => channel.onProfileCaptured?.(result.profile!));
      await stage('reel-details', () => attemptExtraction(errors, 'reel-details', () => this.enrichMissingReelDetails(page, channel, profileUrl, result.messages, errors, () => !attempt.cancelled)));
      result.stories = this.options.includeStories === false ? [] : await stage('stories', () => attemptExtraction(errors, 'stories', () => this.collectStories(
        page,
        channel,
        profileUrl,
        result.profile!,
        logs,
        capture.flush,
        errors,
        () => !attempt.cancelled,
      ))) ?? [];
      await stage('capture-stop', capture.stop);
      if (errors.length) throw partialExtraction(errors, result);

      log(
        `instagram crawl extracted channelId=${channel.id ?? ''} items=${result.messages.length}`,
        'success'
      );
      return result;
    } catch (error) {
      if (attempt.cancelled) throw error;
      await capture.flush().catch(() => undefined);
      const captured = parseInstagramCrawlResult(logs, channel.address);
      const messages = new Map(captured.messages.map(message => [message.externalId, message]));
      for (const message of recovered.messages) messages.set(message.externalId, message);
      throw partialExtraction([...errors, error], { ...captured, ...recovered, profile: recovered.profile ?? captured.profile, messages: [...messages.values()] });
    } finally {
      await capture.stop();
    }
  }

  async fetchChannelProfile(channel: CrawlerChannel): Promise<CrawlerChannelProfile> {
    const result = await this.crawlChannel(channel);
    if (!result.profile) {
      throw new CrawlerOperationError('Instagram profile was not found', 'EXTRACTION_FAILED', 'extraction', 'error');
    }
    return result.profile;
  }

  async fetchNewMessages(channel: CrawlerChannel): Promise<CrawlerMessage[]> {
    return (await this.crawlChannel(channel)).messages;
  }

  async open(): Promise<Page> {
    const generation = this.resourceGeneration;
    if (this.browser?.connected && this.page && !this.page.isClosed()) {
      return this.page;
    }

    if (this.browser?.connected) {
      const page = await this.browser.newPage();
      if (generation !== this.resourceGeneration) { await page.close(); throw new Error('Instagram browser opening cancelled'); }
      this.page = page;
      return page;
    }

    const launched = await GenerateWebBrowser(
      INSTAGRAM_CRAWLER_DEFINITION.sessionDir,
      INSTAGRAM_CRAWLER_DEFINITION.webUrl,
      undefined,
      true,
      { protocolTimeout: INSTAGRAM_CRAWLER_DEFINITION.protocolTimeoutMs },
    );
    if (generation !== this.resourceGeneration) { await launched.browser.close(); throw new Error('Instagram browser opening cancelled'); }
    this.browser = launched.browser;
    this.page = launched.page;
    this.ownsBrowser = true;
    log(
      `instagram browser opened url=${INSTAGRAM_CRAWLER_DEFINITION.webUrl} session=${INSTAGRAM_CRAWLER_DEFINITION.sessionDir}`,
      'success'
    );
    return launched.page;
  }

  async close(): Promise<void> {
    this.resourceGeneration++;
    const browser = this.browser;
    this.browser = null;
    this.page = null;

    if (browser?.connected && this.ownsBrowser) {
      await browser.close();
      log('instagram browser closed', 'info');
    } else if (browser?.connected) {
      browser.disconnect();
      log('instagram crawler disconnected from existing browser', 'info');
    }
    this.ownsBrowser = false;
  }


  private async collectTab(
    page: Page,
    logs: NetworkLogEntry[],
    tab: 'posts' | 'reels'
  ): Promise<void> {
    let stableIterations = 0;
    let previousCount = getInstagramCollectionState(logs, tab).count;
    const maxScrolls = this.options.maxTabScrolls ?? INSTAGRAM_CRAWLER_DEFINITION.maxTabScrolls;

    for (let index = 0; index < maxScrolls; index++) {
      const before = getInstagramCollectionState(logs, tab);
      if (before.hasNextPage === false) {
        this.progress(page, tab, 'finished', { items: before.count, reason: 'no-next-page' });
        break;
      }
      const startedAt = Date.now();
      this.progress(page, tab, 'scroll-started', { scroll: `${index + 1}/${maxScrolls}`, items: before.count });

      if (await this.isLoginPage(page)) {
        throw new CrawlerOperationError(
          'Instagram session became unauthenticated during crawl',
          'AUTH_REQUIRED',
          'authentication',
          'critical'
        );
      }
      await this.scrollToBottom(page);
      await Delay(INSTAGRAM_CRAWLER_DEFINITION.scrollDelayMs);
      const after = getInstagramCollectionState(logs, tab);

      if (after.count > previousCount) {
        previousCount = after.count;
        stableIterations = 0;
      } else {
        stableIterations++;
      }
      this.progress(page, tab, 'scroll-finished', { scroll: `${index + 1}/${maxScrolls}`, items: after.count,
        added: Math.max(0, after.count - before.count), noNewIterations: stableIterations, elapsedMs: Date.now() - startedAt });

      if (
        after.hasNextPage === false ||
        stableIterations >= INSTAGRAM_CRAWLER_DEFINITION.noNewItemsLimit
      ) break;
    }
  }

  private async scrollToBottom(page: Page): Promise<void> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await page.mainFrame().evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        return;
      } catch (error) {
        lastError = error as Error;
        if (page.isClosed() || !/detached Frame|Execution context was destroyed/i.test(lastError.message)) {
          throw error;
        }
        await Delay(1_000);
      }
    }
    throw lastError ?? new Error('Instagram page could not be scrolled');
  }

  private async collectReelViewCounts(
    page: Page,
    target: Map<string, number>
  ): Promise<void> {
    let stableIterations = 0;
    const maxScrolls = this.options.maxTabScrolls ?? INSTAGRAM_CRAWLER_DEFINITION.maxTabScrolls;

    for (let index = 0; index < maxScrolls; index++) {
      const before = target.size;
      this.progress(page, 'reel-metrics', 'scan-started', { scroll: `${index + 1}/${maxScrolls}`, items: before });
      const cards = await page.evaluate(() => Array.from(
        document.querySelectorAll<HTMLAnchorElement>('a[href*="/reel/"]')
      ).map((link) => ({
        href: link.getAttribute('href') ?? '',
        labels: link.innerText.split(/\r?\n/).reverse(),
      })));

      for (const card of cards) {
        const shortcode = card.href.match(/\/reel\/([^/?#]+)/i)?.[1];
        if (!shortcode) continue;
        const count = card.labels
          .map((label) => this.parseCompactCount(label))
          .find((value): value is number => value !== null);
        if (count !== undefined) target.set(shortcode, count);
      }

      if (target.size > before) {
        stableIterations = 0;
      } else {
        stableIterations++;
      }
      this.progress(page, 'reel-metrics', 'scan-finished', { scroll: `${index + 1}/${maxScrolls}`, cards: cards.length,
        items: target.size, added: target.size - before, noNewIterations: stableIterations });
      if (stableIterations >= INSTAGRAM_CRAWLER_DEFINITION.noNewItemsLimit) break;

      await this.scrollToBottom(page);
      await Delay(INSTAGRAM_CRAWLER_DEFINITION.scrollDelayMs);
    }

    if (target.size) {
      this.progress(page, 'reel-metrics', 'finished', { items: target.size });
    }
  }

  private mergeReelViewCounts(
    messages: CrawlerMessage[],
    reelViewCounts: Map<string, number>
  ): void {
    for (const message of messages) {
      const raw = asRecord(message.raw);
      const shortcode = asString(raw.shortcode);
      if (!shortcode) continue;
      const visibleViews = reelViewCounts.get(shortcode);
      if (visibleViews === undefined) continue;

      message.raw = {
        ...raw,
        playsCount: asNumber(raw.playsCount) ?? visibleViews,
        fromReelsTab: true,
      };
    }
  }

  private parseCompactCount(value: string): number | null {
    const normalizedDigits = value
      .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
      .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
      .trim();
    const match = normalizedDigits.match(
      /^([\d.,٫٬]+)\s*(K|M|B|هزار|میلیون|میلیارد)?$/i
    );
    if (!match) return null;

    const suffix = (match[2] ?? '').toLowerCase();
    const hasMultiplier = Boolean(suffix);
    let numericText = match[1].replace(/٬/g, ',').replace(/٫/g, '.');
    if (hasMultiplier && numericText.includes(',') && !numericText.includes('.')) {
      numericText = numericText.replace(',', '.');
    } else {
      numericText = numericText.replace(/,/g, '');
    }
    const numericValue = Number(numericText);
    if (!Number.isFinite(numericValue) || numericValue < 0) return null;

    const multiplier = suffix === 'k' || suffix === 'هزار'
      ? 1_000
      : suffix === 'm' || suffix === 'میلیون'
        ? 1_000_000
        : suffix === 'b' || suffix === 'میلیارد'
          ? 1_000_000_000
          : 1;
    return Math.round(numericValue * multiplier);
  }

  private async openReelsTab(page: Page, profileUrl: string): Promise<boolean> {
    await page.evaluate(() => window.scrollTo(0, 0));
    await Delay(1_000);
    const profilePath = new URL(profileUrl).pathname.replace(/\/$/, '');
    const reelsPath = `${profilePath}/reels/`;
    const clicked = await page.evaluate((expectedPath) => {
      const link = Array.from(document.querySelectorAll('a'))
        .find((item) => new URL(item.href, window.location.origin).pathname === expectedPath) as HTMLElement | undefined;
      link?.click();
      return Boolean(link);
    }, reelsPath);

    if (!clicked) {
      return false;
    }

    await page.waitForFunction(
      (expectedPath) => window.location.pathname === expectedPath,
      { timeout: 30_000 },
      reelsPath
    );
    await Delay(5_000);
    return true;
  }

  private async enrichMissingReelDetails(
    page: Page,
    channel: CrawlerChannel,
    profileUrl: string,
    messages: CrawlerMessage[],
    errors: unknown[] = [],
    isActive: () => boolean = () => true,
  ): Promise<void> {
    const candidates = messages.filter((message) => {
      const raw = asRecord(message.raw);
      return raw.mediaType === 'reel' && raw.fromReelsTab === true &&
        raw.fromPostsTab !== true &&
        (!message.text || !message.publishedAt) && Boolean(asString(raw.shortcode));
    });
    if (!candidates.length) { this.progress(page, 'reel-details', 'skipped', { reason: 'no-missing-details' }); return; }

    let resolvedIds = new Set<string>();
    if (channel.id) {
      this.progress(page, 'reel-details', 'lookup-started', { candidates: candidates.length });
      const lookup = this.options.findDetailResolvedExternalPostIds ?? (async () => new Set<string>());
      resolvedIds = await lookup(channel.id, candidates.map(message => message.externalId));
      this.progress(page, 'reel-details', 'lookup-finished', { candidates: candidates.length, resolved: resolvedIds.size });
    }
    const unresolved = candidates.filter((message) => !resolvedIds.has(message.externalId));
    if (!isActive()) return;
    const detailLimit = this.options.maxReelDetailFetches ?? INSTAGRAM_CRAWLER_DEFINITION.maxReelDetailFetches;
    const pending = unresolved.slice(0, detailLimit);
    if (!pending.length) {
      this.progress(page, 'reel-details', 'skipped', { unresolved: unresolved.length, alreadyResolved: resolvedIds.size, limit: detailLimit });
      return;
    }

    const reelsUrl = `${profileUrl.replace(/\/$/, '')}/reels/`;
    this.progress(page, 'reel-details', 'queue-ready', { total: pending.length, unresolved: unresolved.length, alreadyResolved: resolvedIds.size });
    await this.scrollReelsToTop(page, reelsUrl);

    for (let index = 0; index < pending.length; index++) {
      if (!isActive()) return;
      const candidate = pending[index];
      const startedAt = Date.now();
      this.progress(page, 'reel-details', 'item-started', { progress: `${index + 1}/${pending.length}`, itemId: candidate.externalId });
      try {
        const detail = await this.fetchReelDetail(page, candidate, reelsUrl);
        if (!isActive()) return;
        const messageIndex = messages.findIndex((message) => message.externalId === candidate.externalId);
        if (messageIndex < 0) continue;

        const checkedAt = new Date().toISOString();
        if (!detail) {
          messages[messageIndex] = this.withDetailStatus(candidate, 'unavailable', checkedAt);
          this.progress(page, 'reel-details', 'unavailable', { elapsedMs: Date.now() - startedAt }, 'warning');
          continue;
        }

        const enriched = mergeInstagramMessage(candidate, detail);
        messages[messageIndex] = this.withDetailStatus(enriched, 'fetched', checkedAt);
        this.progress(page, 'reel-details', 'item-finished', { elapsedMs: Date.now() - startedAt });
      } catch (error) {
        errors.push(extractionError(error, 'reel-details', { itemId: candidate.externalId }));
        const messageIndex = messages.findIndex(message => message.externalId === candidate.externalId);
        if (messageIndex >= 0) messages[messageIndex] = this.withDetailStatus(candidate, 'failed', new Date().toISOString());
        this.progress(page, 'reel-details', 'item-failed', { elapsedMs: Date.now() - startedAt, error: (error as Error).message }, 'warning');
      }

      await Delay(INSTAGRAM_CRAWLER_DEFINITION.reelDetailDelayMs);
    }
  }

  private async collectStories(
    page: Page,
    channel: CrawlerChannel,
    profileUrl: string,
    profile: CrawlerChannelProfile,
    logs: NetworkLogEntry[],
    flushCapture: () => Promise<void>,
    errors: unknown[] = [],
    isActive: () => boolean = () => true,
  ): Promise<CrawlerStory[]> {
    const profileRaw = asRecord(profile.raw);
    const latestReelMedia = Number(profileRaw.latestReelMedia ?? 0);
    const username = asString(profileRaw.username);
    const instagramUserId = asString(profileRaw.instagramUserId);
    if (!username || !Number.isFinite(latestReelMedia) || latestReelMedia <= 0) {
      this.progress(page, 'stories', 'skipped', { reason: !username ? 'missing-username' : 'no-active-stories' });
      return [];
    }

    const storyLogsStart = logs.length;
    const storiesUrl = `https://www.instagram.com/stories/${encodeURIComponent(username)}/`;
    try {
      await page.goto(storiesUrl, {
        waitUntil: 'domcontentloaded',
        timeout: INSTAGRAM_CRAWLER_DEFINITION.storyNavigationTimeoutMs,
      });
      await this.clickViewStoryButton(page);
      await Delay(INSTAGRAM_CRAWLER_DEFINITION.storyLoadDelayMs);
      await flushCapture();

      if (instagramUserId) {
        const directPayload = await this.fetchStoryPayload(page, instagramUserId, errors);
        if (directPayload) {
          logs.push({
            type: 'response',
            method: 'GET',
            url: 'https://www.instagram.com/api/v1/feed/reels_media/',
            status: 200,
            responseBody: directPayload,
            capturedAt: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      errors.push(extractionError(error, 'stories'));
      this.progress(page, 'stories', 'failed', { error: (error as Error).message }, 'warning');
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => undefined);
      await flushCapture().catch(() => undefined);
      return parseInstagramStories(logs.slice(storyLogsStart), instagramUserId);
    }

    let stories = parseInstagramStories(
      logs.slice(storyLogsStart),
      instagramUserId
    );
    if (this.options.findStoredStoryIds && channel.id && stories.length) {
      const found = stories.length;
      this.progress(page, 'stories', 'lookup-started', { found });
      const stored = await this.options.findStoredStoryIds(channel.id, stories.map(story => story.externalId));
      stories = stories.filter(story => !stored.has(story.externalId));
      this.progress(page, 'stories', 'lookup-finished', { found, alreadyStored: found - stories.length, remaining: stories.length });
    }
    if (!stories.length) {
      this.progress(page, 'stories', 'skipped', { reason: 'no-new-items' });
      return [];
    }

    const uploadRoot = path.isAbsolute(appConfigs.UPLOAD_PATH)
      ? appConfigs.UPLOAD_PATH
      : path.resolve(process.cwd(), appConfigs.UPLOAD_PATH);
    const channelDirectory = this.safeFilePart(channel.id ?? username);
    const screenshotDirectory = this.options.storyScreenshotDirectory ?? path.join(uploadRoot, 'instagram-stories', channelDirectory);
    try { await fs.mkdir(screenshotDirectory, { recursive: true }); }
    catch (error) {
      errors.push(extractionError(error, 'story-screenshot-directory'));
      return stories;
    }

    this.progress(page, 'stories', 'queue-ready', { total: stories.length });
    for (const [index, story] of stories.entries()) {
      if (!isActive()) return stories;
      const startedAt = Date.now();
      this.progress(page, 'story-screenshot', 'item-started', { progress: `${index + 1}/${stories.length}`, itemId: story.externalId });
      const fileName = `${this.options.storyScreenshotDirectory ? channelDirectory + '-' : ''}${this.safeFilePart(story.externalId)}.png`;
      const screenshotFilePath = path.join(screenshotDirectory, fileName);
      const screenshotPublicPath = this.options.storyScreenshotDirectory
        ? `assets/${fileName}`
        : `/uploads/instagram-stories/${channelDirectory}/${fileName}`;
      try {
        await fs.access(screenshotFilePath);
        story.screenshotPath = screenshotPublicPath;
        this.progress(page, 'story-screenshot', 'reused', { elapsedMs: Date.now() - startedAt });
        continue;
      } catch {
        // The story is new, or its previous screenshot is missing.
      }

      try {
        const storyUrl = `https://www.instagram.com/stories/${encodeURIComponent(username)}/${encodeURIComponent(story.externalId)}/`;
        await page.goto(storyUrl, {
          waitUntil: 'domcontentloaded',
          timeout: INSTAGRAM_CRAWLER_DEFINITION.storyNavigationTimeoutMs,
        });
        await this.clickViewStoryButton(page);
        await Delay(INSTAGRAM_CRAWLER_DEFINITION.storyLoadDelayMs);
        await page.screenshot({ path: screenshotFilePath, type: 'png' });
        story.screenshotPath = screenshotPublicPath;
        this.progress(page, 'story-screenshot', 'item-finished', { elapsedMs: Date.now() - startedAt });
      } catch (error) {
        errors.push(extractionError(error, 'story-screenshot', { itemId: story.externalId }));
        this.progress(page, 'story-screenshot', 'item-failed', { elapsedMs: Date.now() - startedAt, error: (error as Error).message }, 'warning');
      }
    }

    this.progress(page, 'stories', 'finished', { items: stories.length }, 'success');
    return stories;
  }

  private safeFilePart(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  private async fetchStoryPayload(page: Page, instagramUserId: string, errors: unknown[] = []): Promise<unknown | null> {
    try {
      this.progress(page, 'story-api', 'started');
      const reply = await fetchInstagramReadApi(page,
        `/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(instagramUserId)}`,
        INSTAGRAM_CRAWLER_DEFINITION.apiRequestTimeoutMs);
      this.progress(page, 'story-api', 'response-received', { httpStatus: reply.status });
      if (reply.status === 404 || reply.status === 410) return null;
      if (reply.status < 200 || reply.status >= 300) throw new Error(`HTTP ${reply.status}`);
      return reply.payload;
    } catch (error) {
      this.progress(page, 'story-api', 'failed', { error: (error as Error).message }, 'warning');
      errors.push(extractionError(error, 'story-api'));
      return null;
    }
  }

  private async clickViewStoryButton(page: Page): Promise<boolean> {
    for (let attempt = 0; attempt < 16; attempt++) {
      const clicked = await page.evaluate(() => {
        const labels = [
          'view story',
          'watch story',
          'مشاهده استوری',
          'مشاهده داستان',
          'دیدن استوری',
        ];
        const candidates = Array.from(
          document.querySelectorAll<HTMLElement>('button, [role="button"]')
        );
        const target = candidates.find((element) => {
          const text = (element.innerText || element.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
          return labels.some((label) => text === label || text.includes(label));
        });
        if (!target) return false;
        target.click();
        return true;
      });

      if (clicked) {
        await Delay(1_000);
        return true;
      }
      await Delay(500);
    }

    return false;
  }

  private async scrollReelsToTop(page: Page, reelsUrl: string): Promise<void> {
    await this.ensureReelsPage(page, reelsUrl);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(() => window.scrollY <= 10, { timeout: 10_000 });
    await Delay(1_500);
  }

  private async fetchReelDetail(
    page: Page,
    message: CrawlerMessage,
    reelsUrl: string
  ): Promise<CrawlerMessage | null> {
    const raw = asRecord(message.raw);
    const shortcode = asString(raw.shortcode);
    if (!shortcode) return null;

    await this.ensureReelsPage(page, reelsUrl);
    const directDetail = await this.fetchReelDetailPayload(page, message.externalId);
    if (directDetail) {
      const parsed = parseInstagramReelDetail(directDetail, message.externalId);
      if (parsed) return parsed;
    }

    const reelLink = await page.$(`a[href*="/reel/${shortcode}/"]`);
    if (!reelLink) {
      throw new Error(`reel card is not present in the current tab DOM shortcode=${shortcode}`);
    }

    const detailResponse = page.waitForResponse(
      (response) => response.url().includes(`/api/v1/media/${message.externalId}/info/`),
      { timeout: INSTAGRAM_CRAWLER_DEFINITION.reelDetailTimeoutMs }
    ).then(response => ({ response }), error => ({ error }));
    let clicked = false;

    try {
      this.progress(page, 'reel-modal', 'started', { itemId: message.externalId });
      await reelLink.evaluate((link) => link.scrollIntoView({ block: 'center', inline: 'center' }));
      await reelLink.click();
      clicked = true;

      const outcome = await detailResponse;
      if ("error" in outcome) throw outcome.error;
      const response = outcome.response;
      if (response.status() === 404 || response.status() === 410) return null;
      if (response.status() >= 400) {
        throw new Error(`detail request returned HTTP ${response.status()}`);
      }

      const body = await instagramDeadline(() => response.json(), INSTAGRAM_CRAWLER_DEFINITION.responseBodyTimeoutMs, "reel-detail-body");
      return parseInstagramReelDetail(body, message.externalId);
    } finally {
      await reelLink.dispose();
      if (clicked) {
        await this.closeReelModal(page, reelsUrl);
      }
    }
  }

  private async fetchReelDetailPayload(page: Page, externalId: string): Promise<unknown | null> {
    try {
      this.progress(page, 'reel-api', 'started', { itemId: externalId });
      const reply = await fetchInstagramReadApi(page,
        `/api/v1/media/${encodeURIComponent(externalId)}/info/`,
        INSTAGRAM_CRAWLER_DEFINITION.apiRequestTimeoutMs);
      this.progress(page, 'reel-api', 'response-received', { httpStatus: reply.status });
      if (reply.status === 404 || reply.status === 410) return null;
      if (reply.status < 200 || reply.status >= 300) throw new Error(`HTTP ${reply.status}`);
      return reply.payload;
    } catch (error) {
      this.progress(page, 'reel-api', 'fallback-to-modal', { itemId: externalId, error: (error as Error).message }, 'warning');
      return null;
    }
  }

  private async closeReelModal(page: Page, reelsUrl: string): Promise<void> {
    const reelsPath = new URL(reelsUrl).pathname;
    const closeButtonClicked = await page.evaluate(() => {
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
      const roots: ParentNode[] = dialogs.length ? dialogs : [document];
      const closeLabels = new Set(['close', 'بستن']);

      for (const root of roots) {
        const labelledButton = Array.from(
          root.querySelectorAll<HTMLElement>('button[aria-label], [role="button"][aria-label]')
        ).find((element) => closeLabels.has((element.getAttribute('aria-label') || '').trim().toLowerCase()));
        if (labelledButton) {
          labelledButton.click();
          return true;
        }

        const closeIcon = Array.from(root.querySelectorAll<SVGElement>('svg[aria-label]')).find((icon) =>
          closeLabels.has((icon.getAttribute('aria-label') || '').trim().toLowerCase())
        );
        const iconButton = closeIcon?.closest<HTMLElement>('button, [role="button"]');
        if (iconButton) {
          iconButton.click();
          return true;
        }
      }

      return false;
    });

    if (!closeButtonClicked) {
      log('instagram reel modal close button was not found; using Escape', 'warning');
      await page.keyboard.press('Escape');
    }

    try {
      await page.waitForFunction(
        (expectedPath) => window.location.pathname === expectedPath && !document.querySelector('[role="dialog"]'),
        { timeout: 10_000 },
        reelsPath
      );
    } catch {
      throw new Error('instagram reel modal did not close cleanly');
    }

    await Delay(500);
  }

  private async ensureReelsPage(page: Page, reelsUrl: string): Promise<void> {
    const reelsPath = new URL(reelsUrl).pathname;
    if (new URL(page.url()).pathname === reelsPath) return;

    try {
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    } catch {
      // Falling back to a direct navigation below restores a deterministic tab state.
    }

    if (new URL(page.url()).pathname !== reelsPath) {
      await page.goto(reelsUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    }
    await Delay(2_000);
  }

  private withDetailStatus(
    message: CrawlerMessage,
    detailStatus: 'fetched' | 'unavailable' | 'failed',
    detailCheckedAt: string
  ): CrawlerMessage {
    return {
      ...message,
      raw: {
        ...asRecord(message.raw),
        detailStatus,
        detailCheckedAt,
      },
    };
  }

  private attachApiCapture(page: Page, logs: NetworkLogEntry[], errors: unknown[] = []) {
    const pending = new Set<Promise<void>>();
    let stopped = false;
    let cancelled = false;
    const onResponse = (response: HTTPResponse) => {
      const url = response.url();
      if (stopped) return;
      const method = response.request().method();
      if (!['GET', 'POST'].includes(method)) return;
      const isInstagramApi = /^https:\/\/[^/]*instagram\.com\//i.test(url);
      const isGraphql = /\/api\/graphql|\/graphql\/query/i.test(url);
      const isStoryApi = /\/api\/v1\/(?:feed\/)?(?:reels_media|feed\/reels_tray|feed\/user\/[^/]+\/story)/i.test(url);
      if (!isInstagramApi || (!isGraphql && !isStoryApi)) {
        return;
      }
      const status = response.status();
      if (status >= 400) {
        errors.push(new CrawlerOperationError(`Instagram API returned HTTP ${status}`, 'EXTRACTION_FAILED', 'response-capture', 'warning', { httpStatus: status }));
        return;
      }
      if (status < 200 || status >= 300 || [204, 205].includes(status)) return;

      const task = this.captureApiResponse(response, logs, () => !cancelled)
        .catch((error) => {
          if (cancelled) return;
          errors.push(extractionError(error, 'response-capture', { url }));
          this.progress(page, 'response-capture', 'failed', { apiPath: new URL(url).pathname, error: (error as Error).message }, 'warning');
        })
        .finally(() => pending.delete(task));
      pending.add(task);
    };
    page.on('response', onResponse);

    return {
      cancel: () => { cancelled = true; stopped = true; page.off('response', onResponse); },
      flush: async () => {
        await Promise.allSettled([...pending]);
      },
      stop: async () => {
        if (!stopped) {
          stopped = true;
          page.off('response', onResponse);
        }
        await Promise.allSettled([...pending]);
      },
    };
  }

  private async captureApiResponse(response: HTTPResponse, logs: NetworkLogEntry[], isActive: () => boolean = () => true): Promise<void> {
    const request = response.request();
    const body = await instagramDeadline(() => response.json(), INSTAGRAM_CRAWLER_DEFINITION.responseBodyTimeoutMs, "response-capture-body");
    if (!isActive()) return;
    logs.push({
      type: 'response',
      method: request.method(),
      url: response.url(),
      resourceType: request.resourceType(),
      status: response.status(),
      requestPostData: null,
      requestPayload: null,
      responseBody: body,
      capturedAt: new Date().toISOString(),
    });
  }

  private async isUnavailablePage(page: Page): Promise<boolean> {
    if (typeof page.evaluate !== 'function') return false;
    return (await page.evaluate(`(() => {
      const text = (document.querySelector('main')?.innerText || document.body?.innerText || '').slice(0, 5000).toLowerCase();
      return ["sorry, this page isn't available", "this page isn't available", "this profile isn't available", "متأسفیم، این صفحه در دسترس نیست"].some(message => text.includes(message));
    })()`)) === true;
  }

  private async isLoginPage(page: Page): Promise<boolean> {
    if (page.url().includes('/accounts/login')) return true;
    return await page.evaluate(() => Boolean(
      document.querySelector('input[name="username"]') &&
      document.querySelector('input[name="password"]')
    ));
  }

  private normalizeProfileUrl(address: string): string {
    const trimmed = address.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
    }
    const username = trimmed.replace(/^@/, '').replace(/^\/+|\/+$/g, '');
    return `https://www.instagram.com/${username}/`;
  }
}
