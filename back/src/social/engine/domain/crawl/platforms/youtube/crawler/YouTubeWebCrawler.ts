import { BrowserChannelAttempt, browserDeadline, captureBrowserJson } from '../../../helpers/BrowserChannelAttempt';
import { PartialCrawlerExtractionError } from '../../../types/PartialCrawlerExtractionError';
import { partialExtraction, extractionError } from '../../../helpers/CrawlRecovery';
import type { Browser, HTTPResponse, Page } from 'puppeteer-core';
import { log } from '../../../../../helper/showLog';
import { CrawlerOperationError } from '../../../../operations/types/Operations.types';
import type { CrawlerChannel, CrawlerChannelCrawlResult, CrawlerChannelProfile, CrawlerMessage } from '../../../types/Crawler.types';
import { Delay, GenerateWebBrowser } from '../../../helpers/browserHelpers';
import { YOUTUBE_CRAWLER_DEFINITION } from '../YouTubePlatform.definition';
import { at, findAll, normalizeYouTubeChannelUrl, object, parseYouTubeInitialData, parseYouTubeVideoDetail, text, type YouTubePageSnapshot, type YouTubeTab } from './YouTubePageParser';
import { requestYouTubeInternalApi } from './YouTubeInternalApi';

export interface YouTubeCrawlerOptions {
  maxVideos?: number;
  maxShorts?: number;
  maxTabScrolls?: number;
  detailWaitMs?: number;
  channelTimeoutMs?: number;
}

// A string executes in the page without tsx's injected __name helper.
const PAGE_SNAPSHOT = String.raw`(() => {
  const initial = window.ytInitialData || {};
  const player = window.ytInitialPlayerResponse || document.querySelector('#movie_player')?.getPlayerResponse?.() || {};
  const meta = (key) => document.querySelector('meta[itemprop="' + key + '"]')?.content || null;
  const interactions = {};
  for (const node of document.querySelectorAll('[itemprop="interactionStatistic"]')) {
    const type = node.querySelector('[itemprop="interactionType"]')?.content?.split('/').pop();
    if (type) interactions[type] = node.querySelector('[itemprop="userInteractionCount"]')?.content || null;
  }
  const commentHeaders = Array.from(document.querySelectorAll('ytd-comments-header-renderer'));
  const countHeader = commentHeaders.find(node => /\d/.test(node.querySelector('#count')?.textContent || '')) || commentHeaders[0];
  const buttonRoot = document;
  return {
    initial: { metadata: initial.metadata, header: initial.header, contents: initial.contents, engagementPanels: initial.engagementPanels },
    player: { videoDetails: player.videoDetails, microformat: player.microformat, playabilityStatus: {status: player.playabilityStatus?.status, reason: player.playabilityStatus?.reason} },
    videoId: meta('identifier') || new URL(document.querySelector('link[rel="canonical"]')?.href || location.href).searchParams.get('v') || new URL(location.href).searchParams.get('v') || location.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})/)?.[1],
    title: meta('name') || document.querySelector('meta[property="og:title"]')?.content || null,
    description: meta('description'),
    thumbnailUrl: document.querySelector('meta[property="og:image"]')?.content || null,
    publishedAt: meta('datePublished') || meta('uploadDate'),
    duration: meta('duration'), interactions,
    commentHeader: countHeader?.data || null,
    commentsText: countHeader?.querySelector('#count')?.textContent || document.querySelector('ytd-comments #message')?.textContent || null,
    buttonLabels: Array.from(buttonRoot.querySelectorAll('button[aria-label]')).filter(button => { const box = button.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight; }).map(button => button.getAttribute('aria-label')).filter(label => /like|comment/i.test(label || '')),
    bodyText: document.body.innerText.slice(0, 1000)
  };
})()`;

export default class YouTubeWebCrawler {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private busy = false;
  private readonly attempts = new WeakMap<Page, BrowserChannelAttempt>();
  private readonly options: Required<YouTubeCrawlerOptions>;

  constructor(options: YouTubeCrawlerOptions = {}) {
    this.options = { ...YOUTUBE_CRAWLER_DEFINITION, ...options };
  }

  normalizeProfileUrl(address: string): string { return normalizeYouTubeChannelUrl(address); }

  async crawlChannel(channel: CrawlerChannel): Promise<CrawlerChannelCrawlResult> {
    if (this.busy) throw new Error('YouTube crawler already has an active channel');
    const attempt = new BrowserChannelAttempt('youtube', channel, this.options.channelTimeoutMs);
    this.busy = true;
    try { return await attempt.execute(() => this.crawlAttempt(channel, attempt)); }
    catch (error) {
      if (this.page === attempt.page) this.page = null;
      throw error;
    } finally { this.busy = false; }
  }

  private async crawlAttempt(channel: CrawlerChannel, attempt: BrowserChannelAttempt): Promise<CrawlerChannelCrawlResult> {
    const page = await this.open(attempt);
    attempt.check(); attempt.page = page;
    this.attempts.set(page, attempt);
    const url = normalizeYouTubeChannelUrl(channel.address);
    const byId = new Map<string, CrawlerMessage>();
    const byResult = new Map<string, CrawlerMessage>();
    let profile: CrawlerChannelProfile | null = null;
    const errors: unknown[] = [];
    for (const tab of ['videos', 'shorts'] as const) {
      attempt.check();
      try {
        const result = await attempt.run('listing-' + tab, () => this.collectTab(page, url, tab));
        profile ??= result.profile ?? null;
        for (const message of result.messages) byId.set(message.externalId, message);
      } catch (error) {
        attempt.check();
        if (error instanceof CrawlerOperationError && error.stage === 'channel-unavailable') throw partialExtraction([error], attempt.result);
        errors.push(extractionError(error, 'listing', { tab }));
        if (error instanceof PartialCrawlerExtractionError) {
          profile ??= error.result.profile ?? null;
          for (const message of error.result.messages) byId.set(message.externalId, message);
        }
      }
    }
    attempt.result = { profile, messages: [...byId.values()] };
    if (profile) await attempt.run('profile-callback', async () => { await channel.onProfileCaptured?.(profile!); });
    else errors.push(new CrawlerOperationError('YouTube channel metadata was not found', 'EXTRACTION_FAILED', 'profile'));
    const fallback: { item: CrawlerMessage; apiError: string }[] = [];
    const channelId = text(object(profile?.raw).externalChannelId);
    let failures = 0;
    for (const item of byId.values()) {
      attempt.check();
      const progress = `${byResult.size + 1}/${byId.size}`;
      try {
        const detail = await attempt.run('video-details-api', () => this.collectApiDetail(page, item, channelId), { progress, itemId: item.externalId });
        byResult.set(item.externalId, detail);
        if (!this.hasRequiredDetail(detail)) fallback.push({ item: detail, apiError: 'Internal API returned incomplete details' });
      } catch (error) {
        attempt.check();
        const retained = error instanceof PartialCrawlerExtractionError && error.result.messages[0]
          ? error.result.messages[0]
          : item;
        byResult.set(item.externalId, retained);
        fallback.push({ item: retained, apiError: error instanceof Error ? error.message : String(error) });
      }
      attempt.result = { profile, messages: [...byId.values()].map(item => byResult.get(item.externalId) ?? item) };
      log('youtube API details processed=' + byResult.size + '/' + byId.size + ' videoId=' + item.externalId, 'info');
    }
    // Finish every API attempt before navigating to any watch/Shorts page.
    for (const [index, pending] of fallback.entries()) {
      attempt.check();
      log('youtube page fallback processed=' + (index + 1) + '/' + fallback.length + ' videoId=' + pending.item.externalId + ' reason=' + pending.apiError, 'warning');
      try {
        const detail = await attempt.run('video-details-page', () => this.collectDetail(page, pending.item, channelId), { progress: `${index + 1}/${fallback.length}`, itemId: pending.item.externalId });
        if (!this.hasRequiredDetail(detail)) {
          throw new PartialCrawlerExtractionError(new CrawlerOperationError('YouTube details remain incomplete after page fallback',
            'EXTRACTION_FAILED', 'video-details', 'error', { itemId: pending.item.externalId, apiError: pending.apiError }), { messages: [detail] });
        }
        byResult.set(pending.item.externalId, detail);
      } catch (error) {
        attempt.check();
        errors.push(extractionError(error, 'video-details', { itemId: pending.item.externalId, apiError: pending.apiError }));
        failures++;
        const retained = error instanceof PartialCrawlerExtractionError && error.result.messages[0]
          ? error.result.messages[0] : pending.item;
        byResult.set(pending.item.externalId, { ...retained, raw: { ...retained.raw,
          detailStatus: retained.raw?.detailStatus === 'complete' ? 'complete' : 'partial', detailError: 'EXTRACTION_FAILED' } });
        log('youtube fallback failed videoId=' + pending.item.externalId + ' error=' + (error as Error).message, 'warning');
      }
      attempt.result = { profile, messages: [...byResult.values()] };
    }
    const messages = [...byResult.values()];
    if (profile) profile.raw = { ...profile.raw, detailFailures: failures, detailPartial: messages.filter(item => item.raw?.detailStatus !== 'complete').length };

    messages.sort((a, b) => (b.publishedAt ? Date.parse(String(b.publishedAt)) : 0) - (a.publishedAt ? Date.parse(String(a.publishedAt)) : 0));
    if (errors.length) throw partialExtraction(errors, { profile, messages });
    attempt.progress('extraction', 'finished', { items: messages.length });
    return { profile, messages };
  }


  private async collectTab(page: Page, channelUrl: string, tab: YouTubeTab): Promise<CrawlerChannelCrawlResult> {
    try {
      if (page.url().split('?')[0] !== channelUrl) await this.navigate(page, channelUrl);
      const snapshot = await this.snapshot(page);
      const home = parseYouTubeInitialData([snapshot.initial], channelUrl, tab);
      this.remember(page, { profile: home.profile, messages: [] });
      const maxItems = tab === 'shorts' ? this.options.maxShorts : this.options.maxVideos;
      if (maxItems === 0) return { profile: home.profile, messages: [] };
      const tabs = findAll(snapshot.initial, 'tabRenderer');
      const selected = tabs.find(item => text(at(item, 'endpoint', 'commandMetadata', 'webCommandMetadata', 'url'))?.split('?')[0].endsWith('/' + tab));
      if (!selected && tabs.length && home.profile) return { profile: home.profile, messages: [] };
      const endpoint = object(at(selected, 'endpoint', 'browseEndpoint'));
      if (!endpoint.browseId) throw new Error('YouTube channel browse endpoint missing for ' + tab);
      let reply = await this.internalApi(page, 'browse', endpoint);
      const payloads = [reply.payload];
      let result = parseYouTubeInitialData(payloads, channelUrl, tab);
      this.remember(page, { ...result, profile: result.profile ?? home.profile });
      for (let scroll = 0; scroll < this.options.maxTabScrolls && result.messages.length < maxItems; scroll++) {
        const continuation = text(findAll(reply.payload, 'continuationCommand')[0]?.token)
          ?? text(findAll(reply.payload, 'nextContinuationData')[0]?.continuation);
        if (!continuation) break;
        reply = await this.internalApi(page, 'browse', { continuation });
        payloads.push(reply.payload);
        const updated = parseYouTubeInitialData(payloads, channelUrl, tab);
        if (updated.messages.length === result.messages.length) break;
        result = updated;
        this.remember(page, { ...result, profile: result.profile ?? home.profile });
        this.attempts.get(page)?.progress('listing-' + tab, 'batch', { batch: scroll + 1, items: result.messages.length });
      }
      if (!result.profile && !home.profile) throw new Error('YouTube channel metadata missing');
      log('youtube API list tab=' + tab + ' items=' + result.messages.length, 'info');
      return { profile: result.profile ?? home.profile, messages: result.messages.slice(0, maxItems) };
    } catch (error) {
      this.attempts.get(page)?.check();
      if (error instanceof CrawlerOperationError && error.stage === 'channel-unavailable') throw error;
      log('youtube API list fallback tab=' + tab + ' error=' + (error as Error).message, 'warning');
      return this.collectPageTab(page, channelUrl, tab);
    }
  }

  private async collectPageTab(page: Page, channelUrl: string, tab: YouTubeTab): Promise<CrawlerChannelCrawlResult> {
    const capture = this.captureResponses(page, 'browse');
    let result: CrawlerChannelCrawlResult = { messages: [] };
    try {
      await this.navigate(page, channelUrl + '/' + tab);
      let snapshot = await this.snapshot(page);
      const tabs = findAll(snapshot.initial, 'tabRenderer');
      const present = tabs.some(item => {
        const tabUrl = text(at(item, 'endpoint', 'commandMetadata', 'webCommandMetadata', 'url'));
        return tabUrl?.split('?')[0].endsWith('/' + tab);
      });
      result = parseYouTubeInitialData([snapshot.initial], channelUrl, tab);
      this.remember(page, result);
      if (!result.profile) throw new CrawlerOperationError('YouTube channel metadata missing for ' + tab, 'EXTRACTION_FAILED', 'extraction');
      if (!present && tabs.length) return { profile: result.profile, messages: [] };
      let previousCount = -1;
      for (let scroll = 0; scroll <= this.options.maxTabScrolls; scroll++) {
        this.attempts.get(page)?.check();
        await capture.flush();
        snapshot = await this.snapshot(page);
        result = parseYouTubeInitialData([snapshot.initial, ...capture.payloads], channelUrl, tab);
        this.remember(page, result);
        this.attempts.get(page)?.progress('listing-page-' + tab, 'batch', { batch: scroll + 1, items: result.messages.length });
        const maxItems = tab === 'shorts' ? this.options.maxShorts : this.options.maxVideos;
        if (result.messages.length >= maxItems || result.messages.length === previousCount || scroll === this.options.maxTabScrolls) break;
        previousCount = result.messages.length;
        await page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
        await Delay(YOUTUBE_CRAWLER_DEFINITION.timelineScrollDelayMs);
      }
      log('youtube list tab=' + tab + ' items=' + result.messages.length, 'info');
      const maxItems = tab === 'shorts' ? this.options.maxShorts : this.options.maxVideos;
      if (capture.errors.length) throw partialExtraction(capture.errors, result);
      return { profile: result.profile, messages: result.messages.slice(0, maxItems) };
    } catch (error) {
      this.attempts.get(page)?.check();
      if (error instanceof CrawlerOperationError && error.stage === 'channel-unavailable') throw error;
      throw partialExtraction([error], { ...result, ...this.attempts.get(page)?.result, messages: this.attempts.get(page)?.result.messages ?? result.messages });
    }
    finally { capture.stop(); await capture.flush(); capture.cancel(); }
  }

  private async collectDetail(page: Page, message: CrawlerMessage, channelId: string | null): Promise<CrawlerMessage> {
    const isShort = message.raw?.isShort === true;
    const capture = this.captureResponses(page, 'next');
    try {
      await this.navigate(page, isShort
        ? 'https://www.youtube.com/shorts/' + message.externalId
        : 'https://www.youtube.com/watch?v=' + message.externalId);
      if (isShort) {
        await page.waitForFunction(String.raw`Boolean(document.querySelector('button[aria-label^="View "][aria-label$=" comments"]'))`, { timeout: this.options.detailWaitMs }).catch(() => {});
      } else {
        await page.evaluate("document.querySelector('ytd-comments')?.scrollIntoView({block:'start'})");
        for (const button of await page.$$('button[aria-label="Comments"]')) {
          const box = await button.boundingBox();
          if (box && box.width > 0 && box.height > 0) { await button.click().catch(() => {}); break; }
        }
        await page.waitForFunction(String.raw`Array.from(document.querySelectorAll('ytd-comments-header-renderer #count')).some(node => /\d/.test(node.textContent || ''))`, { timeout: this.options.detailWaitMs }).catch(() => {});
      }
      await capture.flush();
      const snapshot = await this.snapshot(page);
      const commentHeaders = capture.payloads.flatMap(payload => findAll(payload, 'commentsHeaderRenderer'));
      if (commentHeaders.length) snapshot.commentHeader = commentHeaders.find(item => /\d/.test(text(item.countText) ?? '')) ?? snapshot.commentHeader;
      const detail = parseYouTubeVideoDetail(snapshot, message, channelId);
      if (capture.errors.length) throw partialExtraction(capture.errors, { messages: [detail] });
      return detail;
    } finally { capture.stop(); await capture.flush(); capture.cancel(); }
  }

  private hasRequiredDetail(message: CrawlerMessage): boolean {
    const raw = object(message.raw);
    return raw.viewsCountExact === true && typeof raw.viewsCount === 'number'
      && (typeof raw.commentsCount === 'number' || raw.commentsStatus === 'disabled')
      && Boolean(message.publishedAt && message.text && raw.authorId && raw.thumbnailUrl)
      && typeof raw.durationSeconds === 'number';
  }

  private async collectApiDetail(page: Page, message: CrawlerMessage, channelId: string | null): Promise<CrawlerMessage> {
    let retained = message;
    try {
      const player = await this.internalApi(page, 'player', { videoId: message.externalId, contentCheckOk: true, racyCheckOk: true });
      // Validate identity before retaining any metadata from this response.
      retained = parseYouTubeVideoDetail({ player: player.payload, videoId: message.externalId }, message, channelId);
      this.remember(page, { messages: [retained] });
      const next = await this.internalApi(page, 'next', { videoId: message.externalId });
      const snapshot: YouTubePageSnapshot = { player: player.payload, initial: next.payload, videoId: message.externalId };
      retained = parseYouTubeVideoDetail(snapshot, retained, channelId);
      this.remember(page, { messages: [retained] });
      if (retained.raw?.commentsCount == null) {
        const section = findAll(next.payload, 'itemSectionRenderer').find(item => /comment/i.test(String(item.targetId ?? item.sectionIdentifier ?? '')));
        const continuation = text(findAll(section, 'continuationCommand')[0]?.token)
          ?? text(findAll(section, 'nextContinuationData')[0]?.continuation);
        if (continuation) {
          const comments = await this.internalApi(page, 'next', { continuation });
          snapshot.commentHeader = findAll(comments.payload, 'commentsHeaderRenderer')[0];
          retained = parseYouTubeVideoDetail(snapshot, retained, channelId);
          this.remember(page, { messages: [retained] });
        }
      }
      return retained;
    } catch (error) {
      throw new PartialCrawlerExtractionError(extractionError(error, 'video-details-api', { itemId: message.externalId }), { messages: [retained] });
    }
  }

  private async navigate(page: Page, url: string): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      this.attempts.get(page)?.check();
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: YOUTUBE_CRAWLER_DEFINITION.navigationTimeoutMs });
        this.attempts.get(page)?.check();
        if (response && [404, 410].includes(response.status())) throw new CrawlerOperationError('YouTube channel or video is unavailable', 'NAVIGATION_FAILED', 'channel-unavailable', 'warning');
        if (response && response.status() >= 400) throw new Error('YouTube HTTP ' + response.status());
        await page.waitForFunction('Boolean(window.ytInitialData || window.ytInitialPlayerResponse)', { timeout: 15000 });
        await Delay(YOUTUBE_CRAWLER_DEFINITION.profileLoadWaitMs);
        this.assertPublicPage(page.url());
        this.attempts.get(page)?.check();
        const unavailable = await page.evaluate(String.raw`(() => Array.from(document.querySelectorAll('ytd-alert-with-button-renderer, yt-alert-renderer, yt-error-content-renderer')).some(node => { const box = node.getBoundingClientRect(); return box.width > 0 && box.height > 0 && /(?:channel|account).{0,50}(?:doesn.t exist|not available|removed|terminated)|(?:کانال|حساب).{0,35}(?:وجود ندارد|حذف شده)/i.test(node.textContent || ''); }))()`);
        if (unavailable) throw new CrawlerOperationError('YouTube channel is unavailable', 'NAVIGATION_FAILED', 'channel-unavailable', 'warning');
        return;
      } catch (error) {
        this.attempts.get(page)?.check();
        if (error instanceof CrawlerOperationError && error.stage === 'channel-unavailable') throw error;
        this.assertPublicPage(page.url());
        if (error instanceof Error && error.name === 'TimeoutError' && new URL(page.url()).pathname === new URL(url).pathname && new URL(page.url()).searchParams.get('v') === new URL(url).searchParams.get('v')) {
          const ready = await page.evaluate('Boolean(window.ytInitialData || window.ytInitialPlayerResponse)').catch(() => false);
          if (ready) return;
        }
        if (attempt === 1) throw new CrawlerOperationError('YouTube navigation failed: ' + (error as Error).message, 'NAVIGATION_FAILED', 'navigation');
        await Delay(1500);
      }
    }
  }

  private assertPublicPage(url: string): void {
    if (/^https:\/\/(?:accounts\.google|consent\.(?:youtube|google))\.com\//.test(url) || /\/sorry\//.test(url)) {
      throw new CrawlerOperationError('YouTube requires consent or sign-in. Open the YouTube session manually.', 'AUTH_REQUIRED', 'authentication');
    }
  }

  private snapshot(page: Page): Promise<YouTubePageSnapshot> {
    this.attempts.get(page)?.check();
    return browserDeadline(() => page.evaluate(PAGE_SNAPSHOT) as Promise<YouTubePageSnapshot>, 35_000, 'page-snapshot');
  }

  private remember(page: Page, result: CrawlerChannelCrawlResult): void {
    const attempt = this.attempts.get(page);
    if (!attempt) return;
    attempt.check();
    const messages = new Map(attempt.result.messages.map(item => [item.externalId, item]));
    for (const item of result.messages) messages.set(item.externalId, item);
    let videos = 0, shorts = 0;
    const bounded = [...messages.values()].filter(item => item.raw?.isShort === true ? ++shorts <= this.options.maxShorts : ++videos <= this.options.maxVideos);
    attempt.result = { profile: result.profile ?? attempt.result.profile, messages: bounded };
  }

  private async internalApi(page: Page, endpoint: 'browse' | 'player' | 'next', input: Record<string, unknown>) {
    const attempt = this.attempts.get(page);
    const task = () => requestYouTubeInternalApi(page, endpoint, input);
    return attempt ? attempt.run('api-' + endpoint, task, { itemId: input.videoId, continuation: Boolean(input.continuation) }) : task();
  }

  private captureResponses(page: Page, kind: 'browse' | 'next') {
    const payloads: unknown[] = [];
    const errors: unknown[] = [];
    const attempt = this.attempts.get(page);
    const capture = captureBrowserJson(page, {
      maxResponses: 40,
      isActive: () => !attempt?.cancelled,
      accepts: response => {
        const url = new URL(response.url());
        return url.hostname === 'www.youtube.com' && url.pathname.startsWith('/youtubei/v1/') &&
          (kind === 'browse' ? url.pathname.endsWith('/browse') : /\/(next|get_panel)$/.test(url.pathname));
      },
      onPayload: payload => { payloads.push(payload); },
      onError: (error, url) => {
        const path = new URL(url).pathname;
        errors.push(extractionError(error, 'response-capture', { path }));
        attempt?.progress('response-capture', 'failed', { path, error: (error as Error).message }, true);
      },
    });
    attempt?.cleanups.add(capture.cancel);
    return { payloads, errors, ...capture };
  }

  async fetchChannelProfile(channel: CrawlerChannel): Promise<CrawlerChannelProfile> {
    const result = await this.collectTab(await this.open(), normalizeYouTubeChannelUrl(channel.address), 'videos');
    if (!result.profile) throw new Error('YouTube channel metadata missing');
    return result.profile;
  }
  async fetchNewMessages(channel: CrawlerChannel): Promise<CrawlerMessage[]> { return (await this.crawlChannel(channel)).messages; }

  async open(attempt?: BrowserChannelAttempt): Promise<Page> {
    if (this.browser?.connected && this.page && !this.page.isClosed()) {
      if (!attempt) this.attempts.delete(this.page);
      return this.page;
    }
    const launched = this.browser?.connected
      ? { browser: this.browser, page: await this.browser.newPage() }
      : await GenerateWebBrowser(YOUTUBE_CRAWLER_DEFINITION.sessionDir, YOUTUBE_CRAWLER_DEFINITION.webUrl, undefined, false, { protocolTimeout: 35_000 });
    if (attempt?.cancelled) {
      await browserDeadline(() => launched.page.close(), 5_000, 'late-page-close').catch(() => undefined);
      if (launched.browser !== this.browser) await browserDeadline(() => launched.browser.close(), 5_000, 'late-browser-close').catch(() => undefined);
      attempt.check();
    }
    this.browser = launched.browser;
    this.page = launched.page;
    const page = launched.page;
    if (attempt) { attempt.page = this.page; this.attempts.set(this.page, attempt); }
    // Do not force an application language here. YouTube can expose translated metadata
    // according to this header; leaving it untouched lets the page return its default
    // title/description language (the creator's original metadata when available).
    await page.setRequestInterception(true);
    attempt?.check();
    page.on('request', request => {
      if (request.resourceType() === 'media' || new URL(request.url()).hostname.endsWith('.googlevideo.com')) void request.abort().catch(() => {});
      else void request.continue().catch(() => {});
    });
    await page.evaluateOnNewDocument("document.addEventListener('play', event => event.target?.pause?.(), true)");
    attempt?.check();
    return page;
  }

  async close(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    this.page = null;
    if (browser?.connected) await browserDeadline(() => browser.close(), 5_000, 'browser-close');
  }
}
