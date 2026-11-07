/// <reference lib="dom" />
import { PartialCrawlerExtractionError } from '../../../types/PartialCrawlerExtractionError';
import { partialExtraction } from '../../../helpers/CrawlRecovery';

import type { Browser, Page } from 'puppeteer-core';
import { log } from '../../../../../helper/showLog';
import { CrawlerOperationError } from '../../../../operations/types/Operations.types';
import { Delay, GenerateWebBrowser } from '../../../helpers/browserHelpers';
import { pickLatestVisibleItem } from '../../../helpers/latestVisibleMessage';
import type { CrawlerChannel, CrawlerChannelCrawlResult, CrawlerChannelProfile, CrawlerMessage } from '../../../types/Crawler.types';
import { TELEGRAM_CRAWLER_DEFINITION } from '../TelegramPlatform.definition';
import TelegramReactionAssetService, { TelegramReactionAssetService as ReactionAssetStore } from '../reaction-mapping/TelegramReactionAsset.service';
import { resolveTelegramWebChannelAddress } from './TelegramAddress.helpers';
import { telegramDeadline, telegramUnavailableNotice } from './TelegramWait.helpers';
import { normalizeTelegramViews } from './TelegramForwardedViews.helpers';
import { isTelegramMembershipControl, TELEGRAM_JOIN_CONFIRMATION_LABELS, TELEGRAM_JOIN_LABELS } from './TelegramJoin.helpers';

export interface TelegramSessionState {
  authenticated: boolean;
  displayName: string | null;
  phone: string | null;
}

export interface TelegramWebCrawlerOptions {
  initialLookbackHours?: number;
  maxScrolls?: number;
  reactionAssetDirectory?: string;
}

interface TelegramDomMessage {
  messageId: string;
  peerId: string | null;
  timestamp: number;
  text: string | null;
  mediaType: string;
  mediaUrls: string[];
  viewsText: string | null;
  viewsCount: number | null;
  sharesCount: number | null;
  commentsCount: number | null;
  reactionsCount: number;
  reactions: Record<string, number>;
  timeTitle: string | null;
  isForwarded: boolean;
  forwardedFromPeerId: string | null;
  forwardedFromMessageId: string | null;
  forwardedFromName: string | null;
  replyToPeerId: string | null;
  replyToMessageId: string | null;
  replyAuthorName: string | null;
  replyPreview: string | null;
}

export default class TelegramWebCrawler {
  private browser: Browser | null = null;
  private page: Page | null = null;

  private readonly reactionAssets: ReactionAssetStore;
  constructor(private readonly sessionDir = TELEGRAM_CRAWLER_DEFINITION.sessionDir, private readonly options: TelegramWebCrawlerOptions = {}) {
    this.reactionAssets = options.reactionAssetDirectory ? new ReactionAssetStore(options.reactionAssetDirectory) : TelegramReactionAssetService;
  }

  async open(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    if (this.browser?.connected) {
      const page = await this.browser.newPage();
      try { await page.goto(TELEGRAM_CRAWLER_DEFINITION.webUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 }); }
      catch (error) { await telegramDeadline(page.close(), 'page-close', 5_000).catch(() => undefined); throw error; }
      this.page = page;
      return page;
    }
    const { browser, page } = await GenerateWebBrowser(this.sessionDir, TELEGRAM_CRAWLER_DEFINITION.webUrl, undefined, true, { protocolTimeout: 35_000 });
    this.browser = browser;
    this.page = page;
    log('telegram browser opened with persistent session', 'success');
    return page;
  }

  async crawlChannel(channel: CrawlerChannel): Promise<CrawlerChannelCrawlResult> {
    try { return await this.crawlAttempt(channel); }
    catch (error) {
      log(`telegram stage=${error instanceof CrawlerOperationError ? error.stage : 'crawl'} event=failed channelId=${channel.id ?? ''} account=${channel.address} error=${JSON.stringify((error as Error).message)}`, 'warning');
      const page = this.page;
      this.page = null;
      if (page && !page.isClosed()) await telegramDeadline(page.close(), 'failed-channel-close', 5_000).catch(() => undefined);
      throw error;
    }
  }

  private async crawlAttempt(channel: CrawlerChannel): Promise<CrawlerChannelCrawlResult> {
    const page = await this.openChannel(channel);
    let profile: CrawlerChannelProfile | null = null;
    let profileError: unknown;
    try { profile = await this.extractChannelProfile(page, channel); await telegramDeadline(Promise.resolve(channel.onProfileCaptured?.(profile)), 'profile-callback'); }
    catch (error) { profileError = error; }
    try {
      const messages = await this.extractMessages(page, channel);
      if (profileError) throw new PartialCrawlerExtractionError(profileError, { profile, messages });
      return { profile, messages };
    } catch (error) {
      if (error instanceof PartialCrawlerExtractionError) {
        error.result.profile = profile;
        if (profileError) throw partialExtraction([profileError, error], error.result);
      }
      throw error;
    }
  }

  async fetchChannelProfile(channel: CrawlerChannel): Promise<CrawlerChannelProfile> {
    return await this.extractChannelProfile(await this.openChannel(channel), channel);
  }

  async fetchNewMessages(channel: CrawlerChannel): Promise<CrawlerMessage[]> {
    return await this.extractMessages(await this.openChannel(channel), channel);
  }

  async captureReactionAssetsForChannel(
    channel: CrawlerChannel,
    targetRawValues: Iterable<string>,
    maxScrolls = 200
  ): Promise<Record<string, string>> {
    const targets = new Set([...targetRawValues].filter((value) => /^doc:\d+$/.test(value)));
    const assets = await this.reactionAssets.existing(targets);
    if ([...targets].every((rawValue) => assets[rawValue])) return assets;

    const page = await this.openChannel(channel);
    let stableScrolls = 0;
    let previousSignature = '';
    for (let scroll = 0; scroll < maxScrolls; scroll++) {
      Object.assign(assets, await this.reactionAssets.captureVisible(page));
      if ([...targets].every((rawValue) => assets[rawValue])) break;

      const signature = await page.evaluate(() => Array.from(
        document.querySelectorAll('#column-center .bubble[data-mid]')
      ).map((bubble) => bubble.getAttribute('data-mid')).filter(Boolean).join(','));
      stableScrolls = signature === previousSignature ? stableScrolls + 1 : 0;
      previousSignature = signature;
      if (stableScrolls >= TELEGRAM_CRAWLER_DEFINITION.noNewMessageLimit) break;
      await page.hover('#column-center .bubbles');
      await page.mouse.wheel({ deltaY: -1_800 });
      await Delay(TELEGRAM_CRAWLER_DEFINITION.scrollDelayMs);
    }

    return Object.fromEntries(Object.entries(assets).filter(([rawValue]) => targets.has(rawValue)));
  }

  async getSessionState(): Promise<TelegramSessionState> {
    const page = await this.open();
    await Delay(5000);
    return await page.evaluate(({ authenticatedSelectors, loginSelectors }) => {
      const hasAuthenticatedUi = authenticatedSelectors.some((selector) => {
        const element = document.querySelector(selector);
        if (!element) return false;
        const style = window.getComputedStyle(element); const bounds = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && Number.parseFloat(style.opacity || '1') > 0 && bounds.width > 0 && bounds.height > 0;
      });
      const hasLoginUi = loginSelectors.some((selector) => {
        const element = document.querySelector(selector);
        if (!element) return false;
        const style = window.getComputedStyle(element); const bounds = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && Number.parseFloat(style.opacity || '1') > 0 && bounds.width > 0 && bounds.height > 0;
      });
      const profileElement = document.querySelector('.sidebar-header .peer-title');
      const phoneElement = document.querySelector('.profile-content .peer-subtitle');
      return { authenticated: hasAuthenticatedUi && !hasLoginUi, displayName: profileElement?.textContent?.trim() || null, phone: phoneElement?.textContent?.trim() || null };
    }, {
      authenticatedSelectors: [...TELEGRAM_CRAWLER_DEFINITION.selectors.authenticated],
      loginSelectors: [...TELEGRAM_CRAWLER_DEFINITION.selectors.login],
    });
  }

  async waitForAuthentication(timeoutMs = TELEGRAM_CRAWLER_DEFINITION.authenticationTimeoutMs): Promise<TelegramSessionState> {
    const startedAt = Date.now(); let stableChecks = 0; let lastState: TelegramSessionState | null = null;
    while (Date.now() - startedAt < timeoutMs) {
      if (!this.page || this.page.isClosed()) throw new Error('Telegram login window was closed before authentication completed');
      lastState = await this.getSessionState();
      stableChecks = lastState.authenticated ? stableChecks + 1 : 0;
      if (stableChecks >= 3) return lastState;
      await Delay(TELEGRAM_CRAWLER_DEFINITION.authenticationPollIntervalMs);
    }
    throw new Error(`Telegram authentication timed out after ${Math.round(timeoutMs / 60_000)} minutes`);
  }

  async close(): Promise<void> {
    if (!this.browser) return;
    const browser = this.browser; this.browser = null; this.page = null;
    await telegramDeadline(browser.close(), 'browser-close', 5_000);
  }

  private async openChannel(channel: CrawlerChannel): Promise<Page> {
    const { username, url } = resolveTelegramWebChannelAddress(channel.address);
    const page = await this.open();
    await Delay(3_000);
    if (!(await this.getSessionState()).authenticated) {
      throw new CrawlerOperationError('Telegram session is not authenticated', 'AUTH_REQUIRED', 'authentication', 'critical');
    }

    if (!this.browser) throw new Error('Telegram browser is not available');
    const directPage = await this.browser.newPage();
    try {
      log(`telegram opening direct channel address=${url}`, 'info');
      await directPage.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: TELEGRAM_CRAWLER_DEFINITION.navigationTimeoutMs,
      });
      await this.reportProgress(channel, { eventCode: 'CHANNEL_PAGE_OPENED', stage: 'navigation', message: 'Telegram channel page opened', context: { url } });
      await this.joinChannelIfNeeded(directPage, channel);
      log(`telegram stage=message-readiness channelId=${channel.id ?? ''} account=${channel.address}`, 'info');
      await directPage.waitForFunction(`(() => {
        const unavailable = (${telegramUnavailableNotice.toString()})();
        return unavailable || Boolean(document.querySelector('#column-center .bubbles .bubble[data-mid]'));
      })()`, { timeout: TELEGRAM_CRAWLER_DEFINITION.messageLoadTimeoutMs, polling: 500 });
      await this.assertChannelAvailable(directPage, channel);
      await this.reportProgress(channel, { eventCode: 'MESSAGES_VISIBLE', stage: 'extraction', message: 'Telegram messages are visible' });
      await this.goToLatestMessages(directPage);
      await this.reportProgress(channel, { eventCode: 'LATEST_MESSAGES_SELECTED', stage: 'extraction', message: 'Positioned at the latest Telegram messages' });
      await Delay(TELEGRAM_CRAWLER_DEFINITION.afterChannelOpenDelayMs);
      if (!page.isClosed()) await telegramDeadline(page.close(), 'previous-page-close', 5_000).catch(() => undefined);
      this.page = directPage;
      log(`telegram channel opened directly channelId=${channel.id ?? ''} username=@${username}`, 'success');
      return directPage;
    } catch (error) {
      if (!directPage.isClosed()) await telegramDeadline(directPage.close(), 'channel-page-close', 5_000).catch(() => undefined);
      log(`telegram stage=navigation event=failed channelId=${channel.id ?? ''} account=${channel.address} error=${JSON.stringify((error as Error).message)}`, 'warning');
      if (error instanceof CrawlerOperationError) throw error;
      throw new CrawlerOperationError(
        `Telegram direct channel messages did not load: ${(error as Error).message}`,
        'NAVIGATION_FAILED',
        'navigation',
        'error',
        { address: channel.address, username }
      );
    }
  }

  private async assertChannelAvailable(page: Page, channel: CrawlerChannel): Promise<void> {
    const notice = await page.evaluate(telegramUnavailableNotice);
    if (notice) throw new CrawlerOperationError(
      `Telegram channel is unavailable: ${notice}`, 'NAVIGATION_FAILED', 'channel-unavailable', 'warning',
      { address: channel.address, channelId: channel.id },
    );
  }

  private async reportProgress(channel: CrawlerChannel | undefined, progress: Parameters<NonNullable<CrawlerChannel['reportProgress']>>[0]): Promise<void> {
    await telegramDeadline(Promise.resolve(channel?.reportProgress?.(progress)), 'progress-callback');
  }

  private async joinChannelIfNeeded(page: Page, channel: CrawlerChannel): Promise<void> {
    const startedAt = Date.now();
    let messagesReadyChecks = 0;
    const joinLabels = JSON.stringify(TELEGRAM_JOIN_LABELS);
    const joinConfirmationLabels = JSON.stringify(TELEGRAM_JOIN_CONFIRMATION_LABELS);
    const targetSelector = '[data-vav-telegram-join-target="true"]';

    while (Date.now() - startedAt < TELEGRAM_CRAWLER_DEFINITION.joinDetectionTimeoutMs) {
      await this.assertChannelAvailable(page, channel);
      const state = await page.evaluate(`(() => {
        const isMembershipControl = ${isTelegramMembershipControl.toString()};
        document.querySelectorAll(${JSON.stringify(targetSelector)}).forEach(element => element.removeAttribute('data-vav-telegram-join-target'));
        const labels = new Set(${joinLabels}.map((value) => value
          .replace(/[\\u200c\\u200d\\u200e\\u200f]/g, ' ')
          .replace(/\\s+/g, ' ')
          .trim()
          .replace(/[!…]+$/g, '')
          .toLocaleLowerCase('en-US')));
        const isVisible = (element) => {
          const style = window.getComputedStyle(element);
          const bounds = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' &&
            Number.parseFloat(style.opacity || '1') > 0 && bounds.width > 0 && bounds.height > 0;
        };
        const normalize = (value) => (value || '')
          .replace(/[\\u200c\\u200d\\u200e\\u200f]/g, ' ')
          .replace(/\\s+/g, ' ')
          .trim()
          .replace(/[!…]+$/g, '')
          .toLocaleLowerCase('en-US');
        const candidates = Array.from(document.querySelectorAll(
          '#column-center .chat-join, #column-center button, #column-center [role="button"]'
        ));
        const joinButton = candidates.find((element) => {
          if (!isVisible(element) || !isMembershipControl(element)) return false;
          const values = [element.textContent, element.getAttribute('aria-label'), element.getAttribute('title')];
          return element.classList.contains('chat-join') || values.some((value) => labels.has(normalize(value)));
        });
        const messagesReady = Boolean(document.querySelector('#column-center .bubbles .bubble[data-mid]'));
        if (!joinButton) return { found: false, label: null, messagesReady };
        const label = (joinButton.textContent || joinButton.getAttribute('aria-label') || joinButton.getAttribute('title') || '').trim();
        joinButton.setAttribute('data-vav-telegram-join-target', 'true');
        return { found: true, label, messagesReady };
      })()`) as { found: boolean; label: string | null; messagesReady: boolean };

      if (state.found) {
        try {
          await page.evaluate(`(() => {
            const normalize = (value) => (value || '')
              .replace(/[\\u200c\\u200d\\u200e\\u200f]/g, ' ')
              .replace(/\\s+/g, ' ')
              .trim()
              .replace(/[!…]+$/g, '')
              .toLocaleLowerCase('en-US');
            const confirmations = new Set(${joinConfirmationLabels}.map(normalize));
            document.querySelectorAll('#column-center .bubbles .bubble, #column-center .bubbles .service-msg, #column-center .bubbles .service-message')
              .forEach((element) => {
                if (confirmations.has(normalize(element.textContent))) {
                  element.setAttribute('data-vav-telegram-preexisting-join-confirmation', 'true');
                }
              });
          })()`);
          const clicked = await page.evaluate(`(() => {
            const isMembershipControl = ${isTelegramMembershipControl.toString()};
            const button = document.querySelector(${JSON.stringify(targetSelector)});
            if (!button || !isMembershipControl(button)) return false;
            button.click();
            return true;
          })()`);
          if (!clicked) throw new Error('Subscribe control disappeared or is not a membership control');
          log(`telegram join clicked channelId=${channel.id ?? ''} label=${state.label ?? ''}`, 'info');
          await this.reportProgress(channel, { eventCode: 'CHANNEL_JOIN_CLICKED', stage: 'navigation', message: 'Telegram channel join control clicked' });

          await page.waitForFunction(`(() => {
            const isMembershipControl = ${isTelegramMembershipControl.toString()};
            const normalize = (value) => (value || '')
              .replace(/[\\u200c\\u200d\\u200e\\u200f]/g, ' ')
              .replace(/\\s+/g, ' ')
              .trim()
              .replace(/[!…]+$/g, '')
              .toLocaleLowerCase('en-US');
            const labels = new Set(${joinLabels}.map(normalize));
            const confirmations = new Set(${joinConfirmationLabels}.map(normalize));
            const isVisible = (element) => {
              const style = window.getComputedStyle(element);
              const bounds = element.getBoundingClientRect();
              return style.display !== 'none' && style.visibility !== 'hidden' &&
                Number.parseFloat(style.opacity || '1') > 0 && bounds.width > 0 && bounds.height > 0;
            };
            const membershipNoticeAppeared = Array.from(document.querySelectorAll(
              '#column-center .bubbles .bubble, #column-center .bubbles .service-msg, #column-center .bubbles .service-message'
            )).some((element) =>
              !element.hasAttribute('data-vav-telegram-preexisting-join-confirmation') &&
              confirmations.has(normalize(element.textContent))
            );
            const subscribeControlDisappeared = !Array.from(document.querySelectorAll(
              '#column-center .chat-join, #column-center button, #column-center [role="button"]'
            )).some((element) => {
              if (!isVisible(element) || !isMembershipControl(element)) return false;
              const values = [element.textContent, element.getAttribute('aria-label'), element.getAttribute('title')];
              return element.classList.contains('chat-join') || values.some((value) => labels.has(normalize(value)));
            });
            return membershipNoticeAppeared || subscribeControlDisappeared;
          })()`, { timeout: TELEGRAM_CRAWLER_DEFINITION.joinConfirmationTimeoutMs });
          await Delay(TELEGRAM_CRAWLER_DEFINITION.afterJoinDelayMs);
          log(`telegram channel membership confirmed channelId=${channel.id ?? ''}`, 'success');
          await this.reportProgress(channel, { eventCode: 'CHANNEL_JOIN_CONFIRMED', stage: 'navigation', message: 'Telegram channel membership confirmed' });
          return;
        } catch (error) {
          throw new CrawlerOperationError(
            `Telegram channel subscribe failed: ${(error as Error).message}`,
            'NAVIGATION_FAILED',
            'navigation',
            'error',
            { address: channel.address, label: state.label }
          );
        }
      }

      messagesReadyChecks = state.messagesReady ? messagesReadyChecks + 1 : 0;
      if (messagesReadyChecks >= 3) return;
      await Delay(1_000);
    }

    log(`telegram join action not found channelId=${channel.id ?? ''}; continuing with message wait`, 'info');
  }

  private async goToLatestMessages(page: Page): Promise<void> {
    let clicks = 0;
    let stableChecks = 0;
    let latestVisibleMessageId: string | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const state = await page.evaluate(`(() => {
        const isVisible = (element) => {
          const style = window.getComputedStyle(element);
          const bounds = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' &&
            Number.parseFloat(style.opacity || '1') > 0 && bounds.width > 0 && bounds.height > 0;
        };
        const button = Array.from(document.querySelectorAll(
          '#column-center button.bubbles-go-down, #column-center .bubbles-go-down'
        )).find(isVisible);
        const ids = Array.from(document.querySelectorAll('#column-center .bubble[data-mid]'))
          .map((bubble) => bubble.getAttribute('data-mid'))
          .filter(Boolean);
        if (button) button.click();
        return { clicked: Boolean(button), latestVisibleMessageId: ids.at(-1) ?? null };
      })()`) as { clicked: boolean; latestVisibleMessageId: string | null };
      if (state.clicked) {
        clicks++;
        stableChecks = 0;
        latestVisibleMessageId = state.latestVisibleMessageId;
        await Delay(TELEGRAM_CRAWLER_DEFINITION.afterGoToLatestDelayMs);
        continue;
      }
      stableChecks = state.latestVisibleMessageId === latestVisibleMessageId ? stableChecks + 1 : 0;
      latestVisibleMessageId = state.latestVisibleMessageId;
      if (stableChecks >= 2) break;
      await Delay(1_000);
    }
    log(`telegram positioned at latest messages clicks=${clicks} settled=${stableChecks >= 2} latestVisibleMessageId=${latestVisibleMessageId ?? ''}`, 'info');
  }

  private parseUsername(address: string): string {
    return resolveTelegramWebChannelAddress(address).username;
  }

  private async extractChannelProfile(page: Page, channel: CrawlerChannel): Promise<CrawlerChannelProfile> {
    const username = this.parseUsername(channel.address);
    const raw = await page.evaluate(`(() => {
      const header = document.querySelector('#column-center .chat-info');
      const title = header?.querySelector('.peer-title')?.textContent?.trim() || null;
      const subscribersText = header?.querySelector('.bottom .info')?.textContent?.trim() || null;
      const digits = subscribersText ? subscribersText.replace(/[^0-9]/g, '') : '';
      const avatar = header?.querySelector('.avatar-photo');
      return { title, username: ${JSON.stringify(username)}, subscribersText,
        subscribersCount: digits ? Number.parseInt(digits, 10) : null,
        peerId: header?.querySelector('[data-peer-id]')?.getAttribute('data-peer-id') || null,
        avatarUrl: avatar?.getAttribute('src')?.startsWith('http') ? avatar.getAttribute('src') : null };
    })()`) as Record<string, unknown>;
    await this.reportProgress(channel, { eventCode: 'PROFILE_EXTRACTED', stage: 'extraction', message: 'Telegram channel profile extracted', context: { channelTitle: raw.title, subscribersCount: raw.subscribersCount, subscribersText: raw.subscribersText } });
    return { platformKey: 'telegram', address: channel.address, title: typeof raw.title === 'string' ? raw.title : null, avatarUrl: typeof raw.avatarUrl === 'string' ? raw.avatarUrl : null, raw };
  }

  private async extractMessages(page: Page, channel?: CrawlerChannel): Promise<CrawlerMessage[]> {
    // Check once more immediately before extraction so new arrivals cannot leave us behind.
    await this.goToLatestMessages(page);
    const sinceDate = channel?.retryBoundary?.sinceDate ? new Date(channel.retryBoundary.sinceDate) : new Date(Date.now() - (this.options.initialLookbackHours ?? TELEGRAM_CRAWLER_DEFINITION.initialLookbackHours) * 3_600_000);
    await telegramDeadline(Promise.resolve(channel?.rememberBoundary?.({ sinceDate: sinceDate.toISOString() })), 'tracking-boundary');
    const sinceTimestamp = Math.floor(sinceDate.getTime() / 1_000);
    const startedAt = Date.now();
    const collected = new Map<string, TelegramDomMessage>();
    const reactionAssets: Record<string, string> = {};
    let noNewCount = 0;
    let scrollProgress = false;
    let extractionFailure: unknown;
    let reachedCutoff = false;
    let stopReason = 'scroll-limit';
    const maxScrolls = this.options.maxScrolls ?? TELEGRAM_CRAWLER_DEFINITION.maxScrolls;
    try {
      for (let scroll = 0; scroll < maxScrolls; scroll++) {
        if (Date.now() - startedAt >= 600_000) throw new CrawlerOperationError('Telegram history time budget exceeded', 'EXTRACTION_FAILED', 'history-scroll', 'warning');
        log(`telegram stage=messages event=start channelId=${channel?.id ?? ''} account=${channel?.address ?? ''} batch=${scroll + 1}/${maxScrolls}`, 'info');
        // Read messages before optional assets so a stalled asset cannot discard this batch.
        const visible = await telegramDeadline(this.extractVisibleMessages(page), 'message-batch');
        const before = collected.size;
        for (const message of visible) if (message.timestamp >= sinceTimestamp) collected.set(message.messageId, message);
        if (scroll === 0) {
          const latestVisibleAnchor = pickLatestVisibleItem(
            visible,
            (message) => message.timestamp * 1_000,
            (message) => message.messageId,
          );
          if (latestVisibleAnchor) collected.set(latestVisibleAnchor.messageId, latestVisibleAnchor);
        }
        Object.assign(reactionAssets, await telegramDeadline(this.reactionAssets.captureVisible(page), 'reaction-assets'));
        noNewCount = collected.size === before && !scrollProgress ? noNewCount + 1 : 0;
        log(`telegram message batch channel=${channel?.address ?? ''} scrollNumber=${scroll + 1} visibleCount=${visible.length} inWindowCount=${visible.filter((message) => message.timestamp >= sinceTimestamp).length} newCount=${collected.size - before} totalCollected=${collected.size}`, 'info');
        if (scroll === 0 || collected.size !== before || scroll % 10 === 0) {
          await this.reportProgress(channel, { eventCode: 'MESSAGE_BATCH_EXTRACTED', stage: 'extraction', message: 'Telegram visible message batch read', context: { scrollNumber: scroll + 1, visibleCount: visible.length, itemsFetched: collected.size, noNewCount } });
        }
        if (visible.some((message) => message.timestamp < sinceTimestamp)) {
          reachedCutoff = true; stopReason = 'time-cutoff'; break;
        }
        if (noNewCount >= TELEGRAM_CRAWLER_DEFINITION.noNewMessageLimit) {
          stopReason = 'history-stalled'; break;
        }
        log(`telegram history scroll channel=${channel?.address ?? ''} scrollNumber=${scroll + 1} maxScrolls=${maxScrolls} pixels=${TELEGRAM_CRAWLER_DEFINITION.scrollStepPixels} totalCollected=${collected.size}`, 'info');
        scrollProgress = await this.scrollToOlderMessages(page, scroll + 1);
      }
    } catch (error) { extractionFailure = error; }
    if (!reachedCutoff && !extractionFailure && stopReason !== 'scroll-limit') {
      extractionFailure = new CrawlerOperationError('Telegram history stopped before reaching the requested time boundary', 'EXTRACTION_FAILED', 'history-scroll', 'warning', {
        stopReason, sinceDate: sinceDate.toISOString(), itemsFetched: collected.size, maxScrolls, noNewCount,
      });
    }
    if (!reachedCutoff && !extractionFailure && stopReason === 'scroll-limit') {
      await this.reportProgress(channel, { eventCode: 'HISTORY_BATCH_LIMIT_REACHED', stage: 'extraction', level: 'warning', message: 'Telegram bounded history batch completed; older messages remain outside this batch' });
    }
    const normalized = normalizeTelegramViews([...collected.values()].sort((a, b) => a.timestamp - b.timestamp));
    const observedReactionKeys = new Set(normalized.flatMap((message) => Object.keys(message.reactions)));
    try { Object.assign(reactionAssets, await telegramDeadline(this.reactionAssets.existing(observedReactionKeys), 'reaction-assets-existing')); }
    catch (error) { extractionFailure ??= error; }
    const messages = normalized.map((message): CrawlerMessage => ({
      platformKey: 'telegram', externalId: message.messageId, text: message.text,
      publishedAt: new Date(message.timestamp * 1_000),
      raw: {
        ...message,
        reactionAssets: Object.fromEntries(
          Object.keys(message.reactions)
            .filter((rawValue) => reactionAssets[rawValue])
            .map((rawValue) => [rawValue, reactionAssets[rawValue]])
        ),
      } as unknown as Record<string, unknown>,
    }));
    const oldestTimestamp = messages[0]?.publishedAt;
    log(`telegram messages extracted count=${messages.length} since=${sinceDate.toISOString()} oldest=${oldestTimestamp ? new Date(oldestTimestamp).toISOString() : 'none'} stopReason=${stopReason}`, extractionFailure ? 'warning' : 'success');
    if (extractionFailure) throw new PartialCrawlerExtractionError(extractionFailure, { messages });
    return messages;
  }

  private async scrollToOlderMessages(page: Page, scrollNumber = 0): Promise<boolean> {
    const state = await page.evaluate(`(() => {
      const bubbles = document.querySelector('#column-center .bubbles');
      if (!bubbles) return null;
      let container = bubbles.querySelector('.bubbles-scrollable') || bubbles.querySelector('.scrollable-y');
      if (!container) container = bubbles.querySelector('.bubble[data-mid][data-timestamp]')?.parentElement || bubbles;
      while (container && !(container.scrollHeight > container.clientHeight + 1 &&
        /auto|scroll|hidden/.test(getComputedStyle(container).overflowY))) container = container.parentElement;
      if (!container || !bubbles) return null;
      const signature = Array.from(bubbles.querySelectorAll('.bubble[data-mid][data-timestamp]'))
        .map(node => node.getAttribute('data-mid')).join(',');
      const previousTop = container.scrollTop;
      container.scrollBy({ top: -${TELEGRAM_CRAWLER_DEFINITION.scrollStepPixels}, behavior: 'instant' });
      const currentTop = container.scrollTop;
      // At the loaded history boundary scrollBy cannot move, so retrigger the history loader.
      if (currentTop === previousTop) container.dispatchEvent(new Event('scroll'));
      const bounds = container.getBoundingClientRect();
      return { signature, moved: currentTop !== previousTop, previousTop, currentTop,
        x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    })()`) as { signature: string; moved: boolean; previousTop: number; currentTop: number; x: number; y: number } | null;
    if (!state) throw new CrawlerOperationError('Telegram message scroll container could not be located', 'NAVIGATION_FAILED', 'history-scroll');
    await Delay(TELEGRAM_CRAWLER_DEFINITION.scrollDelayMs);
    const batchChanged = `(() => Array.from(document.querySelectorAll('#column-center .bubbles .bubble[data-mid][data-timestamp]'))
      .map(node => node.getAttribute('data-mid')).join(',') !== ${JSON.stringify(state.signature)})()`;
    let loaded = await page.waitForFunction(batchChanged,
      { timeout: 5_000, polling: 250 }).then(() => true, () => false);
    if (!state.moved && !loaded) {
      // Use a real wheel event over message history if the DOM scroll did not make progress.
      await page.mouse.move(state.x, state.y);
      await page.mouse.wheel({ deltaY: -TELEGRAM_CRAWLER_DEFINITION.scrollStepPixels });
      await Delay(TELEGRAM_CRAWLER_DEFINITION.scrollDelayMs);
      loaded = await page.waitForFunction(batchChanged,
        { timeout: 5_000, polling: 250 }).then(() => true, () => false);
    }
    const finalTop = await page.evaluate(`(() => {
      const bubbles = document.querySelector('#column-center .bubbles');
      if (!bubbles) return null;
      let container = bubbles.querySelector('.bubbles-scrollable') || bubbles.querySelector('.scrollable-y') ||
        bubbles.querySelector('.bubble[data-mid][data-timestamp]')?.parentElement || bubbles;
      while (container && !(container.scrollHeight > container.clientHeight + 1 &&
        /auto|scroll|hidden/.test(getComputedStyle(container).overflowY))) container = container.parentElement;
      return container?.scrollTop ?? null;
    })()`) as number | null;
    const moved = state.moved || (finalTop !== null && finalTop < state.previousTop);
    log(`telegram history scroll result scrollNumber=${scrollNumber} beforeTop=${state.previousTop} afterTop=${finalTop} movedPixels=${finalTop === null ? 0 : state.previousTop - finalTop} moved=${moved} batchChanged=${loaded}`, moved || loaded ? 'info' : 'warning');
    return moved || loaded;
  }

  private async extractVisibleMessages(page: Page): Promise<TelegramDomMessage[]> {
    return await page.evaluate(`(() => {
      const parseCount = (value) => {
        if (!value) return null;
        const normalized = value.replace(/[ ,\u066C]/g, '').trim();
        const match = normalized.match(/^([0-9.]+)\s*([KkMm])?$/); if (!match) return null;
        const multiplier = match[2]?.toLowerCase() === 'm' ? 1000000 : match[2]?.toLowerCase() === 'k' ? 1000 : 1;
        return Math.round(Number.parseFloat(match[1]) * multiplier);
      };
      const textWithEmoji = (element) => {
        if (!element) return null;
        const clone = element.cloneNode(true);
        clone.querySelectorAll('reactions-element, reaction-element, .time, .time-inner, .reply, .replies, .replies-footer, .clearfix, button').forEach((node) => node.remove());
        clone.querySelectorAll('img.emoji').forEach((image) => image.replaceWith(document.createTextNode(image.getAttribute('alt') || '')));
        const text = clone.textContent?.replace(/\u200f/g, '').trim(); return text || null;
      };
      return Array.from(document.querySelectorAll('#column-center .bubble[data-mid][data-timestamp]')).map((bubble) => {
        const timeInner = bubble.querySelector('.time-inner'); const timeTitle = timeInner?.getAttribute('title') || null;
        const viewsMatch = timeTitle?.match(/Views:\s*([0-9 ,]+)/i); const sharesMatch = timeTitle?.match(/Shares:\s*([0-9 ,]+)/i);
        const reactions = {}; let reactionsCount = 0;
        bubble.querySelectorAll('reaction-element').forEach((reaction) => {
          const count = parseCount(reaction.querySelector('.reaction-counter')?.textContent?.trim()) || 0;
          const sticker = reaction.querySelector('.reaction-sticker'); const emoji = sticker?.querySelector('img[alt]')?.getAttribute('alt');
          const key = emoji || (sticker?.getAttribute('data-doc-id') ? 'doc:' + sticker.getAttribute('data-doc-id') : 'unknown');
          reactions[key] = (reactions[key] || 0) + count; reactionsCount += count;
        });
        const classes = bubble.classList;
        const mediaType = classes.contains('video') ? 'video' : bubble.querySelector('.media-photo') ? 'image' :
          bubble.querySelector('audio, .audio') ? 'audio' : bubble.querySelector('.document') ? 'document' : 'text';
        const mediaUrls = Array.from(bubble.querySelectorAll('img.media-photo, video, audio')).map((media) => media.currentSrc || media.src || '').filter((src) => /^https?:/.test(src));
        const commentsText = bubble.querySelector('.replies .replies-count, .replies-footer .replies-count')?.textContent?.trim() || null;
        const forwardedTitle = bubble.querySelector('.bubble-name-forwarded .peer-title');
        const savedFrom = forwardedTitle?.getAttribute('data-saved-from') || '';
        const savedFromMatch = savedFrom.match(/^(-?[0-9]+)_([0-9]+)$/);
        const reply = bubble.querySelector('.reply');
        return { messageId: bubble.getAttribute('data-mid') || '', peerId: bubble.getAttribute('data-peer-id'),
          timestamp: Number.parseInt(bubble.getAttribute('data-timestamp') || '0', 10),
          text: textWithEmoji(bubble.querySelector('.message .translatable-message') || bubble.querySelector('.message')),
          mediaType, mediaUrls, viewsText: bubble.querySelector('.post-views')?.textContent?.trim() || null,
          viewsCount: parseCount(viewsMatch?.[1] || bubble.querySelector('.post-views')?.textContent?.trim()),
          sharesCount: parseCount(sharesMatch?.[1]), commentsCount: parseCount(commentsText), reactionsCount, reactions, timeTitle,
          isForwarded: bubble.classList.contains('forwarded'),
          forwardedFromPeerId: forwardedTitle?.getAttribute('data-peer-id') || savedFromMatch?.[1] || null,
          forwardedFromMessageId: savedFromMatch?.[2] || null,
          forwardedFromName: forwardedTitle?.textContent?.trim() || null,
          replyToPeerId: bubble.getAttribute('data-reply-to-peer-id'),
          replyToMessageId: bubble.getAttribute('data-reply-to-mid'),
          replyAuthorName: reply?.querySelector('.reply-title')?.textContent?.trim() || null,
          replyPreview: textWithEmoji(reply?.querySelector('.reply-subtitle')) };
      }).filter((message) => message.messageId && message.timestamp > 0);
    })()`) as TelegramDomMessage[];
  }
}
