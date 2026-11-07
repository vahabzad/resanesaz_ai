/// <reference lib="dom" />
import { partialExtraction, extractionError } from '../../../helpers/CrawlRecovery';

import type { Browser, CDPSession, Page } from 'puppeteer-core';
import { ErrorResult } from '../../../../../helper/error.tool';
import { log } from '../../../../../helper/showLog';
import { CrawlerOperationError } from '../../../../operations/types/Operations.types';
import { PartialCrawlerExtractionError } from '../../../types/PartialCrawlerExtractionError';
import { Delay, GenerateWebBrowser, scrollMessagesUpSmooth } from '../../../helpers/browserHelpers';
import { pickLatestVisibleItem } from '../../../helpers/latestVisibleMessage';
import type {
    CrawlerChannel,
    CrawlerChannelCrawlResult,
    CrawlerChannelProfile,
    CrawlerMessage,
} from '../../../types/Crawler.types';
import { BALE_CRAWLER_DEFINITION, BALE_PLATFORM_DEFINITION } from '../BalePlatform.definition';
import { BALE_JOIN_LABELS } from './BaleJoin.helpers';
import { extractExactBaleMemberCount, parseBaleDisplayedMemberCount } from './BaleMemberCount.helpers';
import type { BalePost } from './BalePost.types';
import { getBaleSessionState } from './BaleSession.helpers';
import { keepBalePageActive } from './BaleBrowser.helpers';
import { browserDeadline } from '../../../helpers/BrowserChannelAttempt';

interface BaleCrawlResult {
    foundStopMessage: boolean;
    posts: BalePost[];
}

interface BaleMemberCountCapture {
    client: CDPSession;
    frames: Buffer[];
    socketUrls: Map<string, string>;
    totalBytes: number;
}

export default class BaleWebCrawler {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private readonly memberCountCaptures = new WeakMap<Page, BaleMemberCountCapture>();

    constructor(private readonly sessionDir = BALE_CRAWLER_DEFINITION.sessionDir) { }

    async crawlChannel(channel: CrawlerChannel): Promise<CrawlerChannelCrawlResult> {
        let profile: CrawlerChannelProfile | null = null;
        const errors: unknown[] = [];
        const page = await this.openChannel(channel, true, async page => {
            try {
                profile = await this.extractChannelProfile(page, channel);
                await channel.onProfileCaptured?.(profile);
            } catch (error) { errors.push(extractionError(error, 'profile')); }
        });
        try {
            const messages = await this.extractNewMessages(page, channel);
            if (errors.length) throw partialExtraction(errors, { profile, messages });
            return { profile, messages };
        } catch (error) {
            if (error instanceof PartialCrawlerExtractionError) {
                error.result.profile = profile;
                if (errors.length) throw partialExtraction([...errors, error], error.result);
            }
            throw error;
        }
    }

    async fetchChannelProfile(channel: CrawlerChannel): Promise<CrawlerChannelProfile> {
        return await this.extractChannelProfile(await this.openChannel(channel, true), channel);
    }

    async fetchNewMessages(channel: CrawlerChannel): Promise<CrawlerMessage[]> {
        return await this.extractNewMessages(await this.openChannel(channel), channel);
    }

    async readChannelMessages(channel: CrawlerChannel): Promise<BaleCrawlResult> {
        const page = await this.openChannel(channel);
        const stopMsgId = this.getStopMsgId(channel);
        return await this.crawlUntilMsgId(page, stopMsgId, stopMsgId ? null : this.buildInitialSinceDate());
    }

    async close(): Promise<void> {
        if (!this.browser) return;
        await this.browser.close();
        this.browser = null;
        this.page = null;
    }

    private async getFreshPage(): Promise<Page> {
        if (!this.browser) {
            const opened = await GenerateWebBrowser(
                this.sessionDir,
                BALE_CRAWLER_DEFINITION.webUrl,
                undefined,
                false,
            );
            this.browser = opened.browser;
            this.page = opened.page;
            log('bale browser opened', 'success');
            return opened.page;
        }

        if (this.page && !this.page.isClosed()) await this.page.close();
        this.page = await this.browser.newPage();
        return this.page;
    }

    private async openChannel(channel: CrawlerChannel, captureMemberCount = false, onProfileReady?: (page: Page) => Promise<void>): Promise<Page> {
        const url = this.toChannelUrl(channel.address);
        const page = await this.getFreshPage();
        try {
            await browserDeadline(() => keepBalePageActive(page), 5_000, 'bale-page-activity');
            if (captureMemberCount) await this.startMemberCountCapture(page);
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
            } catch (error) {
                if ((error as Error).name !== 'TimeoutError' || !page.url().startsWith(BALE_CRAWLER_DEFINITION.webUrl)) {
                    throw new CrawlerOperationError(
                        `Bale channel navigation failed: ${(error as Error).message}`,
                        'NAVIGATION_FAILED',
                        'navigation',
                        'error',
                        { address: channel.address },
                    );
                }
                log(`bale navigation timed out after reaching ${url}; checking rendered channel state`, 'warning');
            }

            await Delay(BALE_CRAWLER_DEFINITION.afterChannelOpenDelayMs);
            await this.ensureChannelReady(page, channel, onProfileReady ? () => onProfileReady(page) : undefined);
            await browserDeadline(() => this.clickJumpToLatestIfPresent(page), 15_000, 'bale-jump-to-latest');
            log(`bale channel opened channelId=${channel.id ?? ''} address=${channel.address}`, 'success');
            return page;
        } catch (error) {
            await this.stopMemberCountCapture(page);
            await browserDeadline(() => page.close({ runBeforeUnload: false }), 5_000, 'bale-failed-page-close').catch(() => undefined);
            throw error;
        }
    }

    private async startMemberCountCapture(page: Page): Promise<void> {
        try {
            const client = await page.createCDPSession();
            const capture: BaleMemberCountCapture = {
                client,
                frames: [],
                socketUrls: new Map(),
                totalBytes: 0,
            };
            this.memberCountCaptures.set(page, capture);
            await client.send('Network.enable');
            client.on('Network.webSocketCreated', ({ requestId, url }) => {
                capture.socketUrls.set(requestId, url);
            });
            client.on('Network.webSocketFrameReceived', ({ requestId, response }) => {
                if (response.opcode !== 2 ||
                    !capture.socketUrls.get(requestId)?.startsWith(BALE_CRAWLER_DEFINITION.memberCountSocketUrlPrefix) ||
                    capture.frames.length >= BALE_CRAWLER_DEFINITION.memberCountCaptureMaxFrames) {
                    return;
                }
                const frame = Buffer.from(response.payloadData, 'base64');
                if (capture.totalBytes + frame.length > BALE_CRAWLER_DEFINITION.memberCountCaptureMaxBytes) return;
                capture.frames.push(frame);
                capture.totalBytes += frame.length;
            });
        } catch (error) {
            log(`bale member-count WebSocket capture unavailable: ${(error as Error).message}`, 'warning');
        }
    }

    private async stopMemberCountCapture(page: Page): Promise<BaleMemberCountCapture | null> {
        const capture = this.memberCountCaptures.get(page) ?? null;
        if (!capture) return null;
        this.memberCountCaptures.delete(page);
        try {
            await capture.client.detach();
        } catch {
            // The page may already be closed after a failed navigation.
        }
        return capture;
    }

    private async clickJumpToLatestIfPresent(page: Page): Promise<void> {
        const selector = BALE_CRAWLER_DEFINITION.jumpToLatestSelector;
        const button = await page.$(selector);
        if (!button) return;

        const before = await this.readVisibleMessageState(page);
        await button.click();
        await Delay(BALE_CRAWLER_DEFINITION.afterJumpToLatestDelayMs);
        const after = await this.readVisibleMessageState(page);
        const buttonStillVisible = Boolean(await page.$(selector));
        const moved = before.scrollTop !== after.scrollTop || before.latestMessageId !== after.latestMessageId;

        if (moved || !buttonStillVisible) {
            log('bale jump-to-latest button clicked and latest messages reached', 'success');
            return;
        }

        log('bale jump-to-latest button click had no observable effect', 'warning');
    }

    private async readVisibleMessageState(page: Page): Promise<{
        scrollTop: number | null;
        latestMessageId: string | null;
    }> {
        return await page.evaluate((containerSelector, messageSelector) => {
            const container = document.querySelector(containerSelector);
            const messages = Array.from(document.querySelectorAll(messageSelector));
            return {
                scrollTop: container instanceof HTMLElement ? container.scrollTop : null,
                latestMessageId: messages.at(-1)?.getAttribute('data-date') ?? null,
            };
        }, BALE_CRAWLER_DEFINITION.messagesContainerSelector, BALE_CRAWLER_DEFINITION.messageSelector);
    }

    private toChannelUrl(address: string): string {
        const trimmed = address.trim();
        const username = trimmed
            .replace(/^https?:\/\/(?:web\.)?bale\.ai\/@?/i, '')
            .replace(/^https?:\/\/ble\.ir\/@?/i, '')
            .replace(/^@/, '')
            .replace(/\/$/, '');
        if (!/^[A-Za-z0-9_]{3,64}$/.test(username)) {
            throw ErrorResult.badRequest('Bale channel address must be a username');
        }
        return `${BALE_CRAWLER_DEFINITION.webUrl}/@${username}`;
    }

    private async ensureChannelReady(page: Page, channel: CrawlerChannel, onProfileReady?: () => Promise<void>): Promise<void> {
        const session = await getBaleSessionState(page);
        if (!session.authenticated && (session.hasLoginInput || session.isLoginRoute)) {
            throw new CrawlerOperationError('Bale session is not authenticated', 'AUTH_REQUIRED', 'authentication', 'critical');
        }

        await this.joinChannelIfNeeded(page, channel);
        // Persist the header observation before message readiness or scrolling can fail.
        await onProfileReady?.();

        const hasMessages = await page.$(BALE_CRAWLER_DEFINITION.messagesContainerSelector);
        if (!hasMessages) {
            throw new CrawlerOperationError(
                'Bale channel content container not found',
                'SELECTOR_MISSING',
                'navigation',
                'error',
                { selector: BALE_CRAWLER_DEFINITION.messagesContainerSelector },
            );
        }
    }

    private async joinChannelIfNeeded(page: Page, channel: CrawlerChannel): Promise<void> {
        const joinLabels = [...BALE_JOIN_LABELS];
        let joinLabel: string | null = null;

        try {
            const targetSelector = '[data-vav-bale-join-target="true"]';
            const state = await page.evaluate(`(() => {
                const normalize = (value) => (value || '')
                    .replace(/[يى]/g, 'ی')
                    .replace(/ك/g, 'ک')
                    .replace(/[\\u200c\\u200d\\u200e\\u200f]/g, ' ')
                    .replace(/\\s+/g, ' ')
                    .trim()
                    .replace(/[!…]+$/g, '')
                    .toLocaleLowerCase('en-US');
                const labels = new Set(${JSON.stringify(joinLabels)}.map(normalize));
                const candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
                const joinButton = candidates.find((element) => {
                    if (element.closest('[aria-label="message-item"]')) return false;
                    const style = window.getComputedStyle(element);
                    const bounds = element.getBoundingClientRect();
                    if (style.display === 'none' || style.visibility === 'hidden' ||
                        Number.parseFloat(style.opacity || '1') <= 0 || bounds.width <= 0 || bounds.height <= 0) {
                        return false;
                    }
                    return [element.textContent, element.getAttribute('aria-label'), element.getAttribute('title')]
                        .some((value) => labels.has(normalize(value)));
                });
                if (!joinButton) return { found: false, label: null };
                joinButton.setAttribute('data-vav-bale-join-target', 'true');
                const label = [joinButton.textContent, joinButton.getAttribute('aria-label'), joinButton.getAttribute('title')]
                    .find((value) => labels.has(normalize(value)));
                return { found: true, label: label ? label.trim() : null };
            })()`) as { found: boolean; label: string | null };

            if (!state.found) return;
            joinLabel = state.label;

            const joinButton = await page.$(targetSelector);
            if (!joinButton) {
                throw new Error('Bale join control disappeared before it could be clicked');
            }

            await joinButton.click();
            await joinButton.dispose();
            log(`bale join clicked channelId=${channel.id ?? ''} address=${channel.address} label=${joinLabel ?? ''}`, 'info');

            await page.waitForFunction(`(() => {
                const normalize = (value) => (value || '')
                    .replace(/[يى]/g, 'ی')
                    .replace(/ك/g, 'ک')
                    .replace(/[\\u200c\\u200d\\u200e\\u200f]/g, ' ')
                    .replace(/\\s+/g, ' ')
                    .trim()
                    .replace(/[!…]+$/g, '')
                    .toLocaleLowerCase('en-US');
                const normalizedLabels = new Set(${JSON.stringify(joinLabels)}.map(normalize));
                return !Array.from(document.querySelectorAll('button, [role="button"]')).some((element) => {
                    if (element.closest('[aria-label="message-item"]')) return false;
                    const style = window.getComputedStyle(element);
                    const bounds = element.getBoundingClientRect();
                    if (style.display === 'none' || style.visibility === 'hidden' ||
                        Number.parseFloat(style.opacity || '1') <= 0 || bounds.width <= 0 || bounds.height <= 0) {
                        return false;
                    }
                    return [element.textContent, element.getAttribute('aria-label'), element.getAttribute('title')]
                        .some((value) => normalizedLabels.has(normalize(value)));
                });
            })()`, { timeout: BALE_CRAWLER_DEFINITION.joinConfirmationTimeoutMs });
            await Delay(BALE_CRAWLER_DEFINITION.afterJoinDelayMs);
            log(`bale channel membership confirmed channelId=${channel.id ?? ''} address=${channel.address}`, 'success');
        } catch (error) {
            throw new CrawlerOperationError(
                `Bale channel join failed: ${(error as Error).message}`,
                'NAVIGATION_FAILED',
                'navigation',
                'error',
                { address: channel.address, label: joinLabel },
            );
        }
    }

    private async extractChannelProfile(page: Page, channel: CrawlerChannel): Promise<CrawlerChannelProfile> {
        const raw = await page.evaluate(`(() => {
      const header = document.querySelector('[aria-label="ChatAppBar"]');
      const texts = Array.from(header?.querySelectorAll('p') ?? [])
        .map((element) => element.textContent?.replace(/\\s+/g, ' ').trim())
        .filter(Boolean);
      const avatar = header?.querySelector('[aria-label="avatar"] img');
      return {
        title: texts[0] ?? null,
        membersText: texts.find((text) => /عضو|member/i.test(text)) ?? null,
        avatarUrl: avatar?.getAttribute('src')?.startsWith('http') ? avatar.getAttribute('src') : null,
      };
    })()` ) as { title: string | null; membersText: string | null; avatarUrl: string | null };

        const capture = await this.stopMemberCountCapture(page);
        const displayedMembers = parseBaleDisplayedMemberCount(raw.membersText);
        const exactMembersCount = capture ? extractExactBaleMemberCount(
            capture.frames,
            raw.membersText,
            [raw.title, channel.address.replace(/^@/, '')],
        ) : null;
        const membersCount = exactMembersCount ?? displayedMembers?.parsedCount ?? null;
        const membersCountSource = exactMembersCount !== null && displayedMembers?.abbreviated
            ? 'websocket'
            : 'header';
        if (displayedMembers?.abbreviated && exactMembersCount === null) {
            log(`bale exact member count unavailable; using rounded header channelId=${channel.id ?? ''} address=${channel.address}`, 'warning');
        } else if (membersCount !== null) {
            log(`bale member count captured channelId=${channel.id ?? ''} count=${membersCount} source=${membersCountSource}`, 'success');
        }

        return {
            platformKey: BALE_PLATFORM_DEFINITION.key,
            address: channel.address,
            title: raw.title,
            avatarUrl: raw.avatarUrl,
            raw: {
                ...raw,
                membersCount,
                membersCountSource,
                membersCountExact: membersCountSource === 'websocket' || !displayedMembers?.abbreviated,
            },
        };
    }

    private async extractNewMessages(page: Page, channel: CrawlerChannel): Promise<CrawlerMessage[]> {
        const stopMsgId = this.getStopMsgId(channel);
        const sinceDate = stopMsgId ? null : channel.retryBoundary?.sinceDate ? new Date(channel.retryBoundary.sinceDate) : this.buildInitialSinceDate();
        await channel.rememberBoundary?.({ stopMsgId, sinceDate: sinceDate?.toISOString() });
        const result = await this.crawlUntilMsgId(
            page,
            stopMsgId,
            sinceDate,
        );
        log(
            `bale message crawl completed channelId=${channel.id ?? ''} messages=${result.posts.length}`,
            'success',
        );
        return result.posts.map((post) => this.toCrawlerMessage(post));
    }

    private async crawlUntilMsgId(
        page: Page,
        stopMsgId: string | null,
        sinceDate: Date | null,
    ): Promise<BaleCrawlResult> {
        const posts = new Map<string, BalePost>();
        const errors: unknown[] = [];
        let foundStopMessage = false;
        let crossedStopMessage = false;
        let reachedSinceDate = false;
        let reachedTop = false;
        const scrollLimit = stopMsgId
            ? BALE_CRAWLER_DEFINITION.maxTrackingScrolls
            : BALE_CRAWLER_DEFINITION.maxInitialScrolls;
        log(
            `bale message scan started stopMsgId=${stopMsgId ?? 'none'} sinceDate=${sinceDate?.toISOString() ?? 'none'}`,
            'info',
        );

        try {
            for (let scroll = 0; scroll <= scrollLimit; scroll++) {
                const beforeHydration = await this.extractVisiblePosts(page);
                let visiblePosts: BalePost[];
                try {
                    await this.hydrateVisiblePostMetrics(page);
                    visiblePosts = await this.extractVisiblePosts(page);
                } catch (error) {
                    // Preserve content even when its lazy-loaded metrics never arrive.
                    for (const post of beforeHydration) {
                        posts.set(post.msgId, this.mergePostMetrics(posts.get(post.msgId), post));
                    }
                    // Some metrics may have arrived during retries; keep those too.
                    for (const post of await this.extractVisiblePosts(page).catch(() => [])) {
                        posts.set(post.msgId, this.mergePostMetrics(posts.get(post.msgId), post));
                    }
                    errors.push(extractionError(error, 'message-metrics', { scrollNumber: scroll }));
                    visiblePosts = beforeHydration;
                }
                const latestVisibleAnchor = scroll === 0
                    ? pickLatestVisibleItem(visiblePosts, (post) => post.publishedAt, (post) => post.msgId)
                    : null;
                for (const post of visiblePosts) {
                    if (post.msgId === stopMsgId) {
                        foundStopMessage = true;
                    }

                    if (
                        stopMsgId &&
                        /^\d+$/.test(stopMsgId) &&
                        /^\d+$/.test(post.msgId) &&
                        BigInt(post.msgId) < BigInt(stopMsgId)
                    ) {
                        crossedStopMessage = true;
                        continue;
                    }

                    if (
                        sinceDate &&
                        post.publishedAt &&
                        new Date(post.publishedAt) <= sinceDate
                    ) {
                        reachedSinceDate = true;
                    }
                    if (
                        sinceDate &&
                        /^\d+$/.test(post.msgId) &&
                        BigInt(post.msgId) <= BigInt(sinceDate.getTime())
                    ) {
                        reachedSinceDate = true;
                    }

                    if (
                        !sinceDate ||
                        !post.publishedAt ||
                        new Date(post.publishedAt) >= sinceDate
                    ) {
                        posts.set(post.msgId, this.mergePostMetrics(posts.get(post.msgId), post));
                    }
                }

                if (latestVisibleAnchor) {
                    posts.set(
                        latestVisibleAnchor.msgId,
                        this.mergePostMetrics(posts.get(latestVisibleAnchor.msgId), latestVisibleAnchor),
                    );
                }

                if (crossedStopMessage && !foundStopMessage) {
                    throw new CrawlerOperationError(
                        'Bale crossed the tracking boundary without hydrating the boundary message',
                        'EXTRACTION_FAILED',
                        'extraction',
                        'error',
                        { stopMsgId, collectedMessages: posts.size },
                    );
                }

                if (foundStopMessage && stopMsgId) {
                    const incompleteMessageIds = this.getIncompleteTrackedMessageIds(posts, stopMsgId);
                    if (incompleteMessageIds.length) {
                        throw new CrawlerOperationError(
                            'Bale tracked messages reached the boundary before all metrics were hydrated',
                            'EXTRACTION_FAILED',
                            'extraction',
                            'error',
                            { stopMsgId, incompleteMessageIds },
                        );
                    }
                    break;
                }

                if (reachedSinceDate) {
                    break;
                }

                const moved = await this.scrollToPreviousMetricsBatch(page);
                if (!moved) {
                    reachedTop = true;
                    break;
                }
            }

            if (stopMsgId) {
                const incompleteMessageIds = this.getIncompleteTrackedMessageIds(posts, stopMsgId);
                if (!foundStopMessage || incompleteMessageIds.length) {
                    throw new CrawlerOperationError(
                        'Bale tracking boundary was not reached with complete metrics',
                        'EXTRACTION_FAILED',
                        'extraction',
                        'error',
                        {
                            stopMsgId,
                            foundStopMessage,
                            incompleteMessageIds,
                            collectedMessages: posts.size,
                        },
                    );
                }
            }

            if (sinceDate && !reachedSinceDate && !reachedTop) {
                throw new CrawlerOperationError(
                    'Bale initial lookback was not reached before the scroll safety limit',
                    'EXTRACTION_FAILED',
                    'extraction',
                    'error',
                    { sinceDate: sinceDate.toISOString(), collectedMessages: posts.size },
                );
            }

        } catch (error) {
            throw partialExtraction([...errors, error], {
                messages: [...posts.values()].map(post => this.toCrawlerMessage(post)),
            });
        }

        if (errors.length) throw partialExtraction(errors, { messages: [...posts.values()].map(post => this.toCrawlerMessage(post)) });
        return {
            foundStopMessage,
            posts: [...posts.values()].sort((a, b) =>
                new Date(a.publishedAt ?? 0).getTime() - new Date(b.publishedAt ?? 0).getTime()),
        };
    }

    private async hydrateVisiblePostMetrics(page: Page): Promise<void> {
        for (let attempt = 1; attempt <= BALE_CRAWLER_DEFINITION.metricsHydrationRetries; attempt++) {
            await this.nudgeMessagesForLazyMetrics(page);
            const deadline = Date.now() + BALE_CRAWLER_DEFINITION.metricsHydrationTimeoutMs;

            while (Date.now() < deadline) {
                const status = await this.readVisibleMetricsStatus(page);
                if (!status.messageIds.length || !status.missingMessageIds.length) {
                    await Delay(BALE_CRAWLER_DEFINITION.metricsSettleDelayMs);
                    return;
                }
                await Delay(BALE_CRAWLER_DEFINITION.metricsPollIntervalMs);
            }
        }

        const status = await this.readVisibleMetricsStatus(page);
        throw new CrawlerOperationError(
            'Bale did not hydrate metrics for visible messages',
            'EXTRACTION_FAILED',
            'extraction',
            'error',
            { missingMessageIds: status.missingMessageIds },
        );
    }

    private async nudgeMessagesForLazyMetrics(page: Page): Promise<void> {
        await page.evaluate(async (containerSelector, nudgePx) => {
            const container = document.querySelector(containerSelector);
            if (!(container instanceof HTMLElement)) return;

            const initialScrollTop = container.scrollTop;
            const direction = initialScrollTop > 0 ? -1 : 1;
            container.scrollTop = initialScrollTop + direction * nudgePx;
            await new Promise((resolve) => setTimeout(resolve, 120));
            container.scrollTop = initialScrollTop;
            await new Promise((resolve) => setTimeout(resolve, 120));
        }, BALE_CRAWLER_DEFINITION.messagesContainerSelector, BALE_CRAWLER_DEFINITION.lazyLoadNudgePx);
    }

    private async readVisibleMetricsStatus(page: Page): Promise<{
        messageIds: string[];
        missingMessageIds: string[];
    }> {
        return await page.evaluate((containerSelector, messageSelector) => {
            const container = document.querySelector(containerSelector);
            if (!(container instanceof HTMLElement)) {
                return { messageIds: [], missingMessageIds: [] };
            }

            const containerRect = container.getBoundingClientRect();
            const messages = Array.from(document.querySelectorAll(messageSelector));
            const visibleFooters = messages.flatMap((messageElement) => {
                const footer = messageElement.querySelector('[data-sentry-component="MessageBottomFC"]');
                if (!(footer instanceof HTMLElement)) return [];
                const footerRect = footer.getBoundingClientRect();
                const isVisible = footerRect.bottom >= containerRect.top && footerRect.top <= containerRect.bottom;
                if (!isVisible) return [];

                const dateValue = Number(messageElement.getAttribute('data-date'));
                const rawId = messageElement.getAttribute('data-sid') ?? '';
                const messageId = Number.isFinite(dateValue)
                    ? String(Math.trunc(dateValue))
                    : rawId.replace(/^client-message:/, '');
                if (!messageId) return [];

                const viewText = footer.querySelector('[data-sentry-component="View"] p')?.textContent?.trim();
                return [{ messageId, metricsAvailable: Boolean(viewText) }];
            });

            return {
                messageIds: visibleFooters.map((item) => item.messageId),
                missingMessageIds: visibleFooters
                    .filter((item) => !item.metricsAvailable)
                    .map((item) => item.messageId),
            };
        }, BALE_CRAWLER_DEFINITION.messagesContainerSelector, BALE_CRAWLER_DEFINITION.messageSelector);
    }

    private async scrollToPreviousMetricsBatch(page: Page): Promise<boolean> {
        const before = await page.evaluate((containerSelector, messageSelector) => {
            const container = document.querySelector(containerSelector);
            return container instanceof HTMLElement
                ? {
                    scrollTop: container.scrollTop,
                    clientHeight: container.clientHeight,
                    oldestVisibleMessageId: Array.from(document.querySelectorAll(messageSelector))
                        .filter((messageElement) => {
                            const footer = messageElement.querySelector('[data-sentry-component="MessageBottomFC"]');
                            if (!(footer instanceof HTMLElement)) return false;
                            const footerRect = footer.getBoundingClientRect();
                            const containerRect = container.getBoundingClientRect();
                            return footerRect.bottom >= containerRect.top && footerRect.top <= containerRect.bottom;
                        })
                        .map((messageElement) => messageElement.getAttribute('data-date'))
                        .filter((value): value is string => Boolean(value))
                        .sort((left, right) => Number(left) - Number(right))[0] ?? null,
                }
                : null;
        }, BALE_CRAWLER_DEFINITION.messagesContainerSelector, BALE_CRAWLER_DEFINITION.messageSelector);
        if (!before || before.scrollTop <= 0) return false;

        const distance = Math.max(200, Math.round(
            before.clientHeight * BALE_CRAWLER_DEFINITION.scrollViewportRatio,
        ));
        await scrollMessagesUpSmooth(
            page,
            BALE_CRAWLER_DEFINITION.messagesContainerSelector,
            distance,
            BALE_CRAWLER_DEFINITION.smoothScrollSteps,
            BALE_CRAWLER_DEFINITION.smoothScrollStepDelayMs,
        );

        const after = await page.evaluate((containerSelector, messageSelector) => {
            const container = document.querySelector(containerSelector);
            if (!(container instanceof HTMLElement)) return null;
            const containerRect = container.getBoundingClientRect();
            const oldestVisibleMessageId = Array.from(document.querySelectorAll(messageSelector))
                .filter((messageElement) => {
                    const footer = messageElement.querySelector('[data-sentry-component="MessageBottomFC"]');
                    if (!(footer instanceof HTMLElement)) return false;
                    const footerRect = footer.getBoundingClientRect();
                    return footerRect.bottom >= containerRect.top && footerRect.top <= containerRect.bottom;
                })
                .map((messageElement) => messageElement.getAttribute('data-date'))
                .filter((value): value is string => Boolean(value))
                .sort((left, right) => Number(left) - Number(right))[0] ?? null;
            return { scrollTop: container.scrollTop, oldestVisibleMessageId };
        }, BALE_CRAWLER_DEFINITION.messagesContainerSelector, BALE_CRAWLER_DEFINITION.messageSelector);
        return Boolean(after) && (
            after!.scrollTop !== before.scrollTop ||
            after!.oldestVisibleMessageId !== before.oldestVisibleMessageId
        );
    }

    private mergePostMetrics(previous: BalePost | undefined, current: BalePost): BalePost {
        if (!previous || current.metricsAvailable) return current;
        return {
            ...current,
            viewCount: previous.viewCount,
            viewsCount: previous.viewsCount,
            metricsAvailable: previous.metricsAvailable,
            reactions: previous.reactions,
            reactionsAvailable: previous.reactionsAvailable,
        };
    }

    private getIncompleteTrackedMessageIds(posts: Map<string, BalePost>, stopMsgId: string): string[] {
        if (!posts.has(stopMsgId)) return [stopMsgId];
        return [...posts.values()]
            .filter((post) => this.isAtOrNewerThanBoundary(post.msgId, stopMsgId))
            .filter((post) => !post.metricsAvailable || !post.reactionsAvailable)
            .map((post) => post.msgId);
    }

    private isAtOrNewerThanBoundary(messageId: string, stopMsgId: string): boolean {
        if (/^\d+$/.test(messageId) && /^\d+$/.test(stopMsgId)) {
            return BigInt(messageId) >= BigInt(stopMsgId);
        }
        return messageId === stopMsgId;
    }

    private async extractVisiblePosts(page: Page): Promise<BalePost[]> {
        return await page.evaluate(`(() => {
      const normalize = (value) => value ? value.replace(/\\s+/g, ' ').trim() : null;
      const parseCount = (value) => {
        if (!value) return null;
        const normalized = value
          .replace(/[۰٠]/g, '0').replace(/[۱١]/g, '1').replace(/[۲٢]/g, '2')
          .replace(/[۳٣]/g, '3').replace(/[۴٤]/g, '4').replace(/[۵٥]/g, '5')
          .replace(/[۶٦]/g, '6').replace(/[۷٧]/g, '7').replace(/[۸٨]/g, '8')
          .replace(/[۹٩]/g, '9').replace(/[٫]/g, '.').replace(/[,\\u066C]/g, '').trim();
        const match = normalized.match(/^([\\d.]+)\\s*([KkMm])?$/);
        if (!match) return null;
        const multiplier = match[2]?.toLowerCase() === 'm' ? 1000000
          : match[2]?.toLowerCase() === 'k' ? 1000 : 1;
        const parsed = Number.parseFloat(match[1]) * multiplier;
        return Number.isFinite(parsed) ? Math.round(parsed) : null;
      };

      const container = document.querySelector('${BALE_CRAWLER_DEFINITION.messagesContainerSelector}');
      if (!(container instanceof HTMLElement)) return [];
      const containerRect = container.getBoundingClientRect();

      return Array.from(document.querySelectorAll('${BALE_CRAWLER_DEFINITION.messageSelector}')).flatMap((messageEl) => {
        const bottom = messageEl.querySelector('[data-sentry-component="MessageBottomFC"]');
        if (!(bottom instanceof HTMLElement)) return [];
        const bottomRect = bottom.getBoundingClientRect();
        if (bottomRect.bottom < containerRect.top || bottomRect.top > containerRect.bottom) return [];
        const time = normalize(bottom?.querySelector(
          '[data-sentry-component="InfoFC"] > p'
        )?.textContent);
        const viewCount = normalize(bottom?.querySelector(
          '[data-sentry-component="View"] p'
        )?.textContent);
        
        const commentCountText = normalize(messageEl.querySelector('[data-sentry-component="CommentButtonFC"] span[dir="rtl"]')?.textContent);
        const commentCount = parseCount(commentCountText) ?? 0;

        const reactionElements = Array.from(bottom?.children ?? []).filter(
          (element) => !element.matches('[data-sentry-component="InfoFC"]')
        );
        const reactions = reactionElements.flatMap((element) => {
          const reaction = element.querySelector('img.emoji[alt]')?.getAttribute('alt') ??
            normalize(element.firstElementChild?.textContent);
          const count = normalize(element.lastElementChild?.textContent);
          return reaction && count ? [{ reaction, count }] : [];
        });
        const textParts = Array.from(messageEl.querySelectorAll('[data-sentry-component="NewTextContainerFC"]'))
          .filter((element) => !element.closest('[data-sentry-component="MessageBottomFC"]') &&
            !element.closest('[data-prevent-context-menu-mobile="true"]'))
          .map((element) => normalize(element.textContent)).filter(Boolean);
        const dateValue = Number(messageEl.getAttribute('data-date'));
        const rawId = messageEl.getAttribute('data-sid') ?? '';
        const msgId = Number.isFinite(dateValue)
          ? String(Math.trunc(dateValue))
          : rawId.replace(/^client-message:/, '');
        const mediaUrls = Array.from(messageEl.querySelectorAll('img[data-testid="thumbnail"]'))
          .map((image) => image.getAttribute('src')).filter((src) => src && !src.startsWith('blob:'));
        const fullText = normalize(messageEl.textContent) ?? '';
        const mediaType = messageEl.querySelector('video') ? 'video'
          : messageEl.querySelector('audio') || /\\.(m4a|mp3|wav|ogg)\\b/i.test(fullText) ? 'audio'
          : messageEl.querySelector('img[data-testid="thumbnail"]') ? 'image'
          : messageEl.querySelector('[role="radio"]') ? 'poll' : null;

        return [{
          msgId,
          text: normalize(textParts.join('\\n')),
          publishedAt: Number.isFinite(dateValue) ? new Date(dateValue).toISOString() : null,
          time,
          commentCount,
          commentsCount: commentCount,
          viewCount,
          viewsCount: parseCount(viewCount),
          metricsAvailable: Boolean(viewCount),
          reactions,
          reactionsAvailable: Boolean(viewCount),
          mediaType,
          mediaUrls,
          isForwarded: Boolean(messageEl.querySelector('[data-prevent-context-menu-mobile="true"]')),
        }];
      }).filter((post) => post.msgId);
    })()` ) as BalePost[];
    }

    private toCrawlerMessage(post: BalePost): CrawlerMessage {
        return {
            platformKey: BALE_PLATFORM_DEFINITION.key,
            externalId: post.msgId,
            text: post.text,
            publishedAt: post.publishedAt,
            raw: {
                ...post,
                reactionsText: post.reactions.map((item) => item.count).filter(Boolean).join(' '),
            },
        };
    }

    private getStopMsgId(channel: CrawlerChannel): string | null {
        if (channel.retryBoundary) return channel.retryBoundary.stopMsgId ?? null;
        const oldestTrackedMsgId = channel.metadata?.oldestTrackedMsgId;
        if (typeof oldestTrackedMsgId === 'string' && oldestTrackedMsgId.trim()) {
            return oldestTrackedMsgId.trim();
        }
        const value = channel.metadata?.lastMsgId;
        return typeof value === 'string' && value.trim() ? value.trim() : null;
    }

    private buildInitialSinceDate(): Date {
        return new Date(Date.now() - BALE_CRAWLER_DEFINITION.initialLookbackHours * 60 * 60 * 1000);
    }

}
