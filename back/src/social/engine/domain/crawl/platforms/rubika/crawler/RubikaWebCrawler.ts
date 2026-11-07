/// <reference lib="dom" />
import { partialExtraction, extractionError } from '../../../helpers/CrawlRecovery';
import { PartialCrawlerExtractionError } from '../../../types/PartialCrawlerExtractionError';

import type { Browser, Page } from 'puppeteer-core';
import { ErrorResult } from '../../../../../helper/error.tool';
import { log } from '../../../../../helper/showLog';
import { Delay, GenerateWebBrowser, scrollMessagesUp } from '../../../helpers/browserHelpers';
import { pickLatestVisibleItem } from '../../../helpers/latestVisibleMessage';
import { latestMessageControl } from '../../../helpers/latestMessageControl';
import type {
    CrawlerChannel,
    CrawlerChannelCrawlResult,
    CrawlerChannelProfile,
    CrawlerMessage,
} from '../../../types/Crawler.types';
import type { RubikaPost } from './RubikaPost.types';
import { CrawlerOperationError } from '../../../../operations/types/Operations.types';
import { estimateForwardedPostViews } from './RubikaForwardedViews';
import { isRubikaLoginPage } from './RubikaBrowser.helpers';
import { extractRubikaProfileApiFirst, RubikaProfileResponseCapture } from './RubikaProfileApi.helpers';
import { RUBIKA_JOIN_LABELS } from './RubikaJoin.helpers';
import { RUBIKA_CRAWLER_DEFINITION, RUBIKA_PLATFORM_DEFINITION } from '../RubikaPlatform.definition';

export interface RubikaCrawlResult {
    foundStopMessage: boolean;
    posts: RubikaPost[];
}

class RubikaWebCrawler {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private profileCapture: RubikaProfileResponseCapture | null = null;

    constructor(private readonly sessionDir = RUBIKA_CRAWLER_DEFINITION.sessionDir) {}

    async crawlChannel(channel: CrawlerChannel): Promise<CrawlerChannelCrawlResult> {
        const page = await this.openChannel(channel);
        let profile: CrawlerChannelProfile | null = null;
        const errors: unknown[] = [];
        try { profile = await this.extractChannelProfile(page, channel); await channel.onProfileCaptured?.(profile); }
        catch (error) { errors.push(extractionError(error, 'profile')); }
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
        const page = await this.openChannel(channel);
        return await this.extractChannelProfile(page, channel);
    }

    async fetchNewMessages(channel: CrawlerChannel): Promise<CrawlerMessage[]> {
        const page = await this.openChannel(channel);
        return await this.extractNewMessages(page, channel);
    }

    async fetchFastNewMessages(channel: CrawlerChannel, latestRegisteredMsgId: string | null): Promise<CrawlerMessage[]> {
        const page = await this.openChannel(channel);
        const result = await this.crawlUntilMsgId({
            page,
            stopMsgId: latestRegisteredMsgId,
            sinceDate: this.buildSinceDate(channel, latestRegisteredMsgId),
            maxScrolls: RUBIKA_CRAWLER_DEFINITION.maxScrolls,
        });

        if (!latestRegisteredMsgId) {
            log(
                `rubika fast message crawl used initial lookback channelId=${channel.id ?? ''} address=${channel.address}`,
                'info'
            );
        }

        if (result.foundStopMessage) {
            log(`rubika fast message crawl stop message found channelId=${channel.id ?? ''}`, 'info');
        }

        return result.posts.map((post) => this.toCrawlerMessage(post));
    }

    private async extractChannelProfile(page: Page, channel: CrawlerChannel): Promise<CrawlerChannelProfile> {
        const raw = await extractRubikaProfileApiFirst(page, channel.id ?? channel.address, page.url(), this.profileCapture ?? undefined);

        return {
            platformKey: 'rubika',
            address: channel.address,
            title: raw.title,
            raw: {
                ...raw,
                resolvedChannelUrl: this.currentChannelUrl(page),
                requestedIdentifier: channel.address,
            },
        };
    }

    private async extractNewMessages(page: Page, channel: CrawlerChannel): Promise<CrawlerMessage[]> {
        const stopMsgId = this.getStopMsgId(channel);
        const sinceDate = this.buildSinceDate(channel, stopMsgId);
        await channel.rememberBoundary?.({ stopMsgId, sinceDate: sinceDate?.toISOString() });

        if (sinceDate) {
            log(
                `rubika message time boundary channelId=${channel.id ?? ''} address=${channel.address} since=${sinceDate.toISOString()} stopMsgId=${stopMsgId ?? 'none'}`,
                'info'
            );
        }

        log(`rubika message crawl started channelId=${channel.id ?? ''} address=${channel.address}`, 'info');
        const result = await this.crawlUntilMsgId({
            page,
            stopMsgId,
            sinceDate,
            maxScrolls: RUBIKA_CRAWLER_DEFINITION.maxScrolls,
        });

        if (result.posts.length === 0) {
            log(`rubika no new messages found channelId=${channel.id ?? ''} address=${channel.address}`, 'info');
        }

        if (result.foundStopMessage) {
            log(`rubika stop message found channelId=${channel.id ?? ''} address=${channel.address}`, 'info');
        }

        log(
            `rubika message crawl completed channelId=${channel.id ?? ''} address=${channel.address} messages=${result.posts.length}`,
            'success'
        );

        return result.posts.map((post) => this.toCrawlerMessage(post));
    }

    async close(): Promise<void> {
        this.profileCapture?.stop();
        this.profileCapture = null;
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }

    async readChannelMessages(channel: CrawlerChannel): Promise<RubikaCrawlResult> {
        const page = await this.openChannel(channel);
        const stopMsgId = this.getStopMsgId(channel);
        return await this.crawlUntilMsgId({
            page,
            stopMsgId,
            sinceDate: this.buildSinceDate(channel, stopMsgId),
            maxScrolls: RUBIKA_CRAWLER_DEFINITION.maxScrolls,
        });
    }

    private async getBrowserPage(): Promise<Page> {
        const { browser, page } = await GenerateWebBrowser(
            this.sessionDir,
            RUBIKA_CRAWLER_DEFINITION.webUrl,
            undefined,
            false,
        );
        this.browser = browser;
        this.page = page;
        log('rubika browser opened', 'success');
        return page;
    }

    private async getFreshChannelPage(): Promise<Page> {
        if (!this.browser) {
            return await this.getBrowserPage();
        }

        if (this.page && !this.page.isClosed()) {
            await this.page.close();
        }

        const page = await this.browser.newPage();
        this.page = page;
        return page;
    }

    private async openChannel(channel: CrawlerChannel): Promise<Page> {
        const page = await this.getFreshChannelPage();
        this.profileCapture?.stop();
        this.profileCapture = new RubikaProfileResponseCapture(page);
        const resolvedUrl = this.resolvedChannelUrl(channel);

        log(`rubika channel opening channelId=${channel.id ?? ''} address=${channel.address}`, 'info');
        if (resolvedUrl) {
            await this.navigate(page, resolvedUrl, channel.address);
            await Delay(RUBIKA_CRAWLER_DEFINITION.afterChannelOpenDelayMs);
            await this.ensureAuthenticated(page);
            try {
                await this.ensureConversationOpen(page, channel.address);
            } catch (error) {
                if (!this.isChannelIdentifier(channel.address)) throw error;
                log(
                    `rubika stored channel url did not open; resolving identifier again address=${channel.address}`,
                    'warning',
                );
                await this.openChannelByIdentifier(page, channel.address);
            }
        } else {
            await this.openChannelByIdentifier(page, channel.address);
        }

        await this.joinChannelIfNeeded(page, channel.address);
        await this.ensureMessagesContainer(page);
        await this.moveToLatestMessages(page);
        log(`rubika channel opened channelId=${channel.id ?? ''} address=${channel.address}`, 'success');

        return page;
    }

    private async moveToLatestMessages(page: Page): Promise<void> {
        let previousId: string | null = null;
        let stableRounds = 0;
        for (let attempt = 0; attempt < RUBIKA_CRAWLER_DEFINITION.latestMaxAttempts; attempt++) {
            // The native button also requests the latest history when the loaded
            // DOM ends at an old batch. Scrolling that batch alone is insufficient.
            const clicked = await latestMessageControl(page, RUBIKA_CRAWLER_DEFINITION.latestControlSelector, true);
            if (clicked) log('rubika stage=latest-messages event=control-clicked', 'info');
            if (!clicked) {
                await page.evaluate((selector) => {
                    const container = document.querySelector<HTMLElement>(selector);
                    if (container) {
                        container.scrollTop = container.scrollHeight;
                        container.dispatchEvent(new Event('scroll', { bubbles: true }));
                    }
                }, RUBIKA_CRAWLER_DEFINITION.bubblesContainerSelector);
            }
            await Delay(RUBIKA_CRAWLER_DEFINITION.latestScrollDelayMs);
            const state = await page.evaluate((selector) => {
                const container = document.querySelector<HTMLElement>(selector);
                if (!container) return null;
                const items = container.querySelectorAll('[data-msg-id]');
                return {
                    lastId: items[items.length - 1]?.getAttribute('data-msg-id') ?? null,
                    atBottom: container.scrollHeight - container.clientHeight - container.scrollTop <= 4,
                };
            }, RUBIKA_CRAWLER_DEFINITION.bubblesContainerSelector);
            const pending = await latestMessageControl(page, RUBIKA_CRAWLER_DEFINITION.latestControlSelector);
            stableRounds = state?.atBottom && !pending && !clicked && state.lastId === previousId ? stableRounds + 1 : 0;
            previousId = state?.lastId ?? null;
            if (stableRounds >= RUBIKA_CRAWLER_DEFINITION.latestStableRounds) {
                log(`rubika stage=latest-messages event=positioned latestMessageId=${previousId ?? 'empty'}`, 'info');
                return;
            }
        }
        throw new CrawlerOperationError('Rubika conversation did not reach the latest message',
            'EXTRACTION_FAILED', 'latest-messages', 'error');
    }

    private resolvedChannelUrl(channel: CrawlerChannel): string | null {
        const fromMetadata = channel.metadata?.resolvedChannelUrl;
        if (typeof fromMetadata === 'string' && this.isChannelUrl(fromMetadata)) {
            return fromMetadata;
        }

        return this.isChannelUrl(channel.address) ? channel.address : null;
    }

    private isChannelUrl(value: string): boolean {
        try {
            const url = new URL(value);
            return url.origin === RUBIKA_CRAWLER_DEFINITION.webUrl && /^#c=c[A-Za-z0-9]+$/.test(url.hash);
        } catch {
            return false;
        }
    }

    private channelIdentifier(value: string): string {
        const match = value.trim().match(/^@([A-Za-z0-9_]{3,64})$/);
        if (!match) {
            throw ErrorResult.badRequest('Rubika channel identifier must be a public @username');
        }
        return `@${match[1]}`;
    }

    private isChannelIdentifier(value: string): boolean {
        return /^@[A-Za-z0-9_]{3,64}$/.test(value.trim());
    }

    private async navigate(page: Page, url: string, address: string): Promise<void> {
        try {
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 60_000,
            });
        } catch (error) {
            throw new CrawlerOperationError(
                `Rubika channel navigation failed: ${(error as Error).message}`,
                'NAVIGATION_FAILED', 'navigation', 'error', { address, url },
            );
        }
    }

    private async openChannelByIdentifier(page: Page, value: string): Promise<void> {
        const identifier = this.channelIdentifier(value);
        await this.navigate(page, RUBIKA_CRAWLER_DEFINITION.webUrl, value);
        await Delay(RUBIKA_CRAWLER_DEFINITION.afterChannelOpenDelayMs);
        await this.ensureAuthenticated(page);

        const inputSelector = 'input.input-search-input';
        try {
            await page.waitForSelector(inputSelector, { visible: true, timeout: 20_000 });
            await page.click(inputSelector);
            await page.keyboard.down('Control');
            try {
                await page.keyboard.press('KeyA');
            } finally {
                await page.keyboard.up('Control');
            }
            await page.keyboard.press('Backspace');
            await page.keyboard.type(identifier, { delay: 120 });
            await page.focus(inputSelector);
            await page.keyboard.press('Enter');
        } catch (error) {
            throw new CrawlerOperationError(
                `Rubika channel identifier could not be typed and submitted: ${(error as Error).message}`,
                'NAVIGATION_FAILED', 'navigation', 'error', { identifier },
            );
        }

        // Search is debounced and may briefly render an empty state while resolving a public ID.
        await Delay(RUBIKA_CRAWLER_DEFINITION.searchSettleDelayMs);

        try {
            await page.waitForFunction(
                () => Array.from(document.querySelectorAll('.search-group-contacts li'))
                    .filter((element) => {
                        const bounds = element.getBoundingClientRect();
                        const style = window.getComputedStyle(element);
                        return /مشترک/.test(element.textContent ?? '') &&
                            bounds.width > 0 && bounds.height > 0 &&
                            style.display !== 'none' && style.visibility !== 'hidden';
                    }).length > 0,
                { timeout: RUBIKA_CRAWLER_DEFINITION.searchResultWaitMs },
            );
        } catch {
            throw new CrawlerOperationError(
                'Rubika public channel could not be resolved from its identifier',
                'SELECTOR_MISSING', 'navigation', 'error', { identifier },
            );
        }

        const searchResult = await page.evaluate(() => {
            document.querySelectorAll('[data-vav-rubika-search-target]').forEach((element) =>
                element.removeAttribute('data-vav-rubika-search-target')
            );
            const channels = Array.from(document.querySelectorAll('.search-group-contacts li'))
                .filter((element) => {
                    const bounds = element.getBoundingClientRect();
                    const style = window.getComputedStyle(element);
                    return /مشترک/.test(element.textContent ?? '') &&
                        bounds.width > 0 && bounds.height > 0 &&
                        style.display !== 'none' && style.visibility !== 'hidden';
                });
            if (channels.length === 0) return null;
            channels[0].setAttribute('data-vav-rubika-search-target', 'true');
            const bounds = channels[0].getBoundingClientRect();
            return {
                x: bounds.x + bounds.width * 0.75,
                y: bounds.y + bounds.height * 0.5,
            };
        });
        if (!searchResult) {
            throw new CrawlerOperationError(
                'Rubika public channel search result was not found',
                'SELECTOR_MISSING', 'navigation', 'error', { identifier },
            );
        }

        try {
            await page.mouse.click(searchResult.x, searchResult.y, {
                delay: RUBIKA_CRAWLER_DEFINITION.searchResultClickDelayMs,
            });
        } catch (error) {
            throw new CrawlerOperationError(
                `Rubika public channel search result could not be clicked: ${(error as Error).message}`,
                'NAVIGATION_FAILED', 'navigation', 'error', { identifier },
            );
        }
        await this.ensureConversationOpen(page, value);
        try {
            await page.waitForFunction(
                () => /^#c=c[A-Za-z0-9]+$/.test(window.location.hash),
                { timeout: RUBIKA_CRAWLER_DEFINITION.searchResultWaitMs },
            );
        } catch {
            throw new CrawlerOperationError(
                'Rubika channel opened without a canonical channel URL',
                'NAVIGATION_FAILED', 'navigation', 'error', { identifier, currentUrl: page.url() },
            );
        }
        log(`rubika identifier resolved identifier=${identifier} url=${this.currentChannelUrl(page)}`, 'success');
    }

    private async ensureConversationOpen(page: Page, address: string): Promise<void> {
        try {
            await page.waitForSelector('tab-conversation .sidebar-header', { timeout: 20_000 });
        } catch {
            throw new CrawlerOperationError(
                'Rubika channel conversation did not open',
                'SELECTOR_MISSING', 'navigation', 'error', { address, currentUrl: page.url() },
            );
        }
    }

    private currentChannelUrl(page: Page): string | null {
        const currentUrl = page.url();
        return this.isChannelUrl(currentUrl) ? currentUrl : null;
    }

    private async ensureAuthenticated(page: Page): Promise<void> {
        if (await isRubikaLoginPage(page)) {
            log('rubika session not authenticated', 'error');
            throw new CrawlerOperationError('Rubika session is not authenticated', 'AUTH_REQUIRED', 'authentication', 'critical');
        }
    }

    private async joinChannelIfNeeded(page: Page, address: string): Promise<void> {
        const startedAt = Date.now();
        let readyChecks = 0;
        const targetSelector = '[data-vav-rubika-join-target="true"]';

        while (Date.now() - startedAt < RUBIKA_CRAWLER_DEFINITION.joinDetectionTimeoutMs) {
            const state = await this.locateJoinControl(page);

            if (state.found) {
                log(
                    `rubika join control detected address=${address} target=${JSON.stringify(state.target)}`,
                    'info'
                );
                const confirmationStartedAt = Date.now();
                let clickAttempts = 0;
                let nextClickAt = confirmationStartedAt;

                while (
                    Date.now() - confirmationStartedAt <
                    RUBIKA_CRAWLER_DEFINITION.joinConfirmationTimeoutMs
                ) {
                    const currentState = await this.locateJoinControl(page);
                    if (!currentState.found) {
                        await Delay(RUBIKA_CRAWLER_DEFINITION.afterJoinDelayMs);
                        log(
                            `rubika channel membership confirmed address=${address} clickAttempts=${clickAttempts}`,
                            'success'
                        );
                        return;
                    }

                    if (
                        !currentState.target?.disabled &&
                        clickAttempts < RUBIKA_CRAWLER_DEFINITION.joinClickMaxAttempts &&
                        Date.now() >= nextClickAt
                    ) {
                        const joinControl = await page.$(targetSelector);
                        if (!joinControl) {
                            await Delay(RUBIKA_CRAWLER_DEFINITION.joinConfirmationPollMs);
                            continue;
                        }

                        const clickMethod = clickAttempts % 2 === 0 ? 'puppeteer' : 'dom';
                        try {
                            await joinControl.evaluate((element) => {
                                element.scrollIntoView({ block: 'center', inline: 'center' });
                            });
                            if (clickMethod === 'puppeteer') {
                                await joinControl.click({ delay: 100 });
                            } else {
                                await joinControl.evaluate((element) => {
                                    (element as HTMLElement).click();
                                });
                            }
                        } catch (error) {
                            throw new CrawlerOperationError(
                                `Rubika channel join failed while clicking: ${(error as Error).message}`,
                                'NAVIGATION_FAILED',
                                'navigation',
                                'error',
                                { address, label: currentState.label, clickAttempt: clickAttempts + 1 },
                            );
                        } finally {
                            await joinControl.dispose();
                        }

                        clickAttempts++;
                        nextClickAt = Date.now() + RUBIKA_CRAWLER_DEFINITION.joinClickRetryDelayMs;
                        log(
                            `rubika join click dispatched address=${address} attempt=${clickAttempts} method=${clickMethod}`,
                            'info'
                        );
                    }

                    await Delay(RUBIKA_CRAWLER_DEFINITION.joinConfirmationPollMs);
                }

                throw new CrawlerOperationError(
                    `Rubika channel join failed: membership control remained visible after ${clickAttempts} click attempts`,
                    'NAVIGATION_FAILED',
                    'navigation',
                    'error',
                    { address, label: state.label, clickAttempts },
                );
            }

            readyChecks = state.conversationReady ? readyChecks + 1 : 0;
            if (readyChecks >= 3) return;
            await Delay(1_000);
        }

        log(`rubika join action not found address=${address}; continuing`, 'info');
    }

    private async locateJoinControl(page: Page): Promise<{
        found: boolean;
        label: string | null;
        conversationReady: boolean;
        target: {
            tagName: string;
            className: string;
            role: string | null;
            disabled: boolean;
            bounds: { x: number; y: number; width: number; height: number };
        } | null;
    }> {
        const joinLabels = JSON.stringify(RUBIKA_JOIN_LABELS);
        return (await page.evaluate(`(() => {
            const normalize = (value) => (value || '')
                .replace(/[يى]/g, 'ی')
                .replace(/ك/g, 'ک')
                .replace(/[\\u200c\\u200d\\u200e\\u200f]/g, ' ')
                .replace(/\\s+/g, ' ')
                .trim()
                .replace(/[!…]+$/g, '')
                .toLocaleLowerCase('fa-IR');
            const labels = new Set(${joinLabels}.map(normalize));
            const isVisible = (element) => {
                const style = window.getComputedStyle(element);
                const bounds = element.getBoundingClientRect();
                return style.display !== 'none' && style.visibility !== 'hidden' &&
                    Number.parseFloat(style.opacity || '1') > 0 && bounds.width > 0 && bounds.height > 0;
            };

            document.querySelectorAll('[data-vav-rubika-join-target]').forEach((element) =>
                element.removeAttribute('data-vav-rubika-join-target')
            );
            const headerSelectors = [
                'tab-conversation .sidebar-header',
                'tab-conversation header',
                'tab-conversation [class*="header" i]'
            ];
            const headers = Array.from(new Set(headerSelectors.flatMap((selector) =>
                Array.from(document.querySelectorAll(selector))
            ))).filter(isVisible);
            const matches = headers.flatMap((header) => Array.from(
                header.querySelectorAll('button, [role="button"], a, [tabindex], div, span')
            )).filter((element) => isVisible(element) && labels.has(normalize(element.textContent)));
            const labelElement = matches.sort((left, right) => {
                const leftBounds = left.getBoundingClientRect();
                const rightBounds = right.getBoundingClientRect();
                return leftBounds.width * leftBounds.height - rightBounds.width * rightBounds.height;
            })[0];

            if (!labelElement) {
                return {
                    found: false,
                    label: null,
                    conversationReady: Boolean(document.querySelector('tab-conversation')),
                    target: null
                };
            }

            const clickTarget = labelElement.closest('button, [role="button"], a, [tabindex]') || labelElement;
            clickTarget.setAttribute('data-vav-rubika-join-target', 'true');
            const bounds = clickTarget.getBoundingClientRect();
            return {
                found: true,
                label: (labelElement.textContent || '').trim(),
                conversationReady: true,
                target: {
                    tagName: clickTarget.tagName.toLowerCase(),
                    className: String(clickTarget.getAttribute('class') || '').slice(0, 160),
                    role: clickTarget.getAttribute('role'),
                    disabled: clickTarget.matches(':disabled, [aria-disabled="true"]'),
                    bounds: {
                        x: Math.round(bounds.x),
                        y: Math.round(bounds.y),
                        width: Math.round(bounds.width),
                        height: Math.round(bounds.height)
                    }
                }
            };
        })()`)) as {
            found: boolean;
            label: string | null;
            conversationReady: boolean;
            target: {
                tagName: string;
                className: string;
                role: string | null;
                disabled: boolean;
                bounds: { x: number; y: number; width: number; height: number };
            } | null;
        };
    }

    private async ensureMessagesContainer(page: Page): Promise<void> {
        const exists = await page.evaluate(
            (selector) => document.querySelector(selector) !== null,
            RUBIKA_CRAWLER_DEFINITION.bubblesContainerSelector
        );
        if (!exists) {
            throw new CrawlerOperationError('Rubika channel content container not found', 'SELECTOR_MISSING', 'navigation', 'error', {
                selector: RUBIKA_CRAWLER_DEFINITION.bubblesContainerSelector,
            });
        }
    }

    private getStopMsgId(channel: CrawlerChannel): string | null {
        if (channel.retryBoundary) return channel.retryBoundary.stopMsgId ?? null;
        const oldestTrackedMsgId = channel.metadata?.oldestTrackedMsgId;
        if (typeof oldestTrackedMsgId === 'string' && oldestTrackedMsgId.trim()) {
            return oldestTrackedMsgId.trim();
        }

        const lastMsgId = channel.metadata?.lastMsgId;
        return typeof lastMsgId === 'string' && lastMsgId.trim() ? lastMsgId.trim() : null;
    }

    private async extractVisiblePosts(page: Page): Promise<RubikaPost[]> {
        try {
            return await page.evaluate(`
                (() => {
                    const textOf = (el) => {
                        const text = el && el.textContent ? el.textContent.trim() : null;
                        return text || null;
                    };

                    const normalizeSpaces = (value) => {
                        return value ? value.replace(/\\s+/g, ' ').trim() : null;
                    };

                    const emojiLabel = (el) => {
                        if (!el) {
                            return null;
                        }

                        const titled = el.querySelector('[title]');
                        return (titled && titled.getAttribute('title')) || normalizeSpaces(el.textContent);
                    };

                    const extractText = (messageEl) => {
                        const textEl =
                            messageEl.querySelector('[rb-message-text] [rb-copyable]') ||
                            messageEl.querySelector('[rb-message-text]');

                        if (textEl) {
                            return normalizeSpaces(textEl.textContent);
                        }

                        const clone = messageEl.cloneNode(true);
                        clone
                            .querySelectorAll('.reactions, [rb-message-time], [rb-message-video], [rb-message-photo], img, video, audio, svg, canvas')
                            .forEach((el) => el.remove());

                        return normalizeSpaces(clone.textContent);
                    };

                    const normalizeNumberText = (value) => {
                        return value ? value
                            .replace(/[۰٠]/g, '0')
                            .replace(/[۱١]/g, '1')
                            .replace(/[۲٢]/g, '2')
                            .replace(/[۳٣]/g, '3')
                            .replace(/[۴٤]/g, '4')
                            .replace(/[۵٥]/g, '5')
                            .replace(/[۶٦]/g, '6')
                            .replace(/[۷٧]/g, '7')
                            .replace(/[۸٨]/g, '8')
                            .replace(/[۹٩]/g, '9')
                            .replace(/[,\u066C]/g, '')
                            .trim() : null;
                    };

                    const parseCount = (value) => {
                        const normalized = normalizeNumberText(value);
                        if (!normalized) {
                            return null;
                        }

                        const match = normalized.match(/^([\\d.]+)\\s*([KkMm])?/);
                        if (!match) {
                            return null;
                        }

                        const multiplier = match[2] && match[2].toLowerCase() === 'm'
                            ? 1000000
                            : match[2] && match[2].toLowerCase() === 'k'
                                ? 1000
                                : 1;
                        const parsed = Number.parseFloat(match[1]) * multiplier;
                        return Number.isNaN(parsed) ? null : Math.round(parsed);
                    };

                    const parseMeta = (metaText) => {
                        if (!metaText) {
                            return { time: null, viewCount: null, viewsCount: null };
                        }

                        const timeMatch = metaText.match(/\\b\\d{1,2}:\\d{2}\\b/);
                        const viewBeforeTimeMatch = metaText.match(/([\\d\\u06F0-\\u06F9\\u0660-\\u0669][\\d\\u06F0-\\u06F9\\u0660-\\u0669,.\\u066C]*\\s*[KkMm]?)\\s+\\d{1,2}:\\d{2}/);
                        const withoutTime = metaText
                            .replace(/\\b\\d{1,2}:\\d{2}\\b/g, ' ')
                            .replace(/ویرایش شده/g, ' ');
                        const viewMatch = viewBeforeTimeMatch || withoutTime.match(/[\\d\\u06F0-\\u06F9\\u0660-\\u0669][\\d\\u06F0-\\u06F9\\u0660-\\u0669,.\\u066C]*\\s*[KkMm]?/);
                        const viewCount = viewMatch ? (viewMatch[1] || viewMatch[0]).trim() : null;

                        return {
                            time: timeMatch ? timeMatch[0] : null,
                            viewCount,
                            viewsCount: parseCount(viewCount),
                        };
                    };

                    const findPublishedDateText = (postEl) => {
                        let current = postEl.previousElementSibling;
                        while (current) {
                            if (current.matches && current.matches('.bubble.service.is-date')) {
                                return normalizeSpaces(current.textContent);
                            }
                            current = current.previousElementSibling;
                        }

                        return null;
                    };
                    const extractReactions = (postEl) => {
                        return Array.from(postEl.querySelectorAll('.reaction.reaction-block')).map((reactionEl) => {
                            return {
                                reaction: emojiLabel(reactionEl.querySelector('.reaction-sticker')),
                                count: textOf(reactionEl.querySelector('.reaction-counter')),
                            };
                        }).filter((reaction) => reaction.reaction || reaction.count);
                    };

                    const detectMediaType = (postEl) => {
                        const bubble = postEl.querySelector('.bubble');

                        if (postEl.querySelector('[rb-message-video]') || (bubble && bubble.classList.contains('video'))) {
                            return 'video';
                        }

                        if (postEl.querySelector('[rb-message-photo], img.media-photo')) {
                            return 'image';
                        }

                        if (postEl.querySelector('audio')) {
                            return 'audio';
                        }

                        return 'text';
                    };

                    const extractMediaUrls = (postEl) => {
                        return Array.from(postEl.querySelectorAll('img.media-photo, video, audio'))
                            .map((el) => el.currentSrc || el.src || el.getAttribute('src'))
                            .filter(Boolean);
                    };

                    const postElements = Array.from(document.querySelectorAll('.bubbles-group[data-msg-id]'));

                    return postElements.map((postEl) => {
                        const msgId = postEl.getAttribute('data-msg-id') || '';
                        const messageWrapper = postEl.querySelector('.message-wrapper');
                        const messageEl = (messageWrapper && messageWrapper.querySelector('.message')) || postEl;
                        const reactions = extractReactions(postEl);
                        const reactionsText = reactions.map((reaction) => [reaction.reaction, reaction.count].filter(Boolean).join(':')).join(' ');
                        const metaText =
                            textOf(postEl.querySelector('[rb-message-time] .inner')) ||
                            textOf(postEl.querySelector('[rb-message-time]')) ||
                            normalizeSpaces(postEl.textContent);
                        const parsedMeta = parseMeta(metaText);
                        const bubble = postEl.querySelector('.bubble');
                        const isForwarded = Boolean(bubble && bubble.classList.contains('forwarded'));
                        const forwardedFromName = isForwarded
                            ? normalizeSpaces(
                                (bubble.querySelector('.name') && bubble.querySelector('.name').textContent) || null
                            )
                            : null;

                        return {
                            msgId,
                            text: extractText(messageEl),
                            reactionsText,
                            reactions,
                            metaText,
                            time: parsedMeta.time,
                            viewCount: parsedMeta.viewCount,
                            viewsCount: parsedMeta.viewsCount,
                            isForwarded,
                            forwardedFromName,
                            publishedDateText: findPublishedDateText(postEl),
                            mediaType: detectMediaType(postEl),
                            mediaUrls: extractMediaUrls(postEl),
                            publishedAt: null,
                        };
                    });
                })()
            `) as RubikaPost[];
        } catch (error) {
            throw new CrawlerOperationError(
                `Rubika message extraction failed: ${(error as Error).message}`,
                'EXTRACTION_FAILED', 'extraction', 'error',
            );
        }
    }

    private async crawlUntilMsgId(params: {
        page: Page;
        stopMsgId: string | null;
        sinceDate: Date | null;
        maxScrolls: number;
    }): Promise<RubikaCrawlResult> {
        const { page, stopMsgId, sinceDate, maxScrolls } = params;
        const collected = new Map<string, RubikaPost>();
        let foundStopMessage = false;
        let foundSinceBoundary = false;
        let noNewCount = 0;

        try {
            for (let i = 0; i < maxScrolls; i++) {
                const visiblePosts = estimateForwardedPostViews(
                    this.withPublishedAt(await this.extractVisiblePosts(page))
                );
                const latestVisibleAnchor = i === 0
                    ? pickLatestVisibleItem(visiblePosts, (post) => post.publishedAt, (post) => post.msgId)
                    : null;
                let newCount = 0;

                for (const post of visiblePosts) {
                    const publishedAt = post.publishedAt ? new Date(post.publishedAt) : null;

                    if (sinceDate && publishedAt && publishedAt < sinceDate) {
                        foundSinceBoundary = true;
                        continue;
                    }

                    if (stopMsgId && post.msgId === stopMsgId) {
                        collected.set(post.msgId, post);
                        newCount++;
                        foundStopMessage = true;
                    }

                    const existingPost = collected.get(post.msgId);
                    const shouldReplace = !existingPost || (
                        post.isForwarded === true &&
                        post.viewsCountEstimated === true &&
                        existingPost.viewsCountEstimated !== true
                    );
                    if (shouldReplace) {
                        collected.set(post.msgId, post);
                        if (!existingPost) {
                            newCount++;
                        }
                    }
                }

                if (latestVisibleAnchor && !collected.has(latestVisibleAnchor.msgId)) {
                    collected.set(latestVisibleAnchor.msgId, latestVisibleAnchor);
                    newCount++;
                }

                if (foundStopMessage) {
                    break;
                }

                if (foundSinceBoundary) {
                    log(`rubika message time boundary reached since=${sinceDate?.toISOString()} stopMsgId=${stopMsgId ?? 'none'}`, 'info');
                    break;
                }

                // Rubika keeps loaded messages in the DOM. Traversing a tall
                // batch can take many scrolls before older messages load.
                if (newCount === 0 && await this.isMessagesAtTop(page)) {
                    noNewCount++;
                } else {
                    noNewCount = 0;
                }

                if (noNewCount >= RUBIKA_CRAWLER_DEFINITION.noNewMessageLimit) {
                    log(`rubika no new messages found scans=${i + 1}/${maxScrolls} messages=${collected.size} stopMsgId=${stopMsgId ?? 'none'} since=${sinceDate?.toISOString() ?? 'none'}`, 'info');
                    break;
                }

                await scrollMessagesUp(page, RUBIKA_CRAWLER_DEFINITION.bubblesContainerSelector);
                await Delay(RUBIKA_CRAWLER_DEFINITION.scrollDelayMs);
            }

        } catch (error) {
            throw new PartialCrawlerExtractionError(error, { messages: [...collected.values()].map(post => this.toCrawlerMessage(post)) });
        }
        if (stopMsgId && !foundStopMessage && !foundSinceBoundary) throw new PartialCrawlerExtractionError(
            new CrawlerOperationError('Rubika tracking boundary was not reached', 'EXTRACTION_FAILED', 'extraction', 'error', { stopMsgId }),
            { messages: [...collected.values()].map(post => this.toCrawlerMessage(post)) },
        );
        return {
            foundStopMessage,
            posts: Array.from(collected.values()),
        };
    }

    private buildInitialSinceDate(): Date {
        return new Date(
            Date.now() - RUBIKA_CRAWLER_DEFINITION.initialLookbackHours * 60 * 60 * 1000
        );
    }

    private async isMessagesAtTop(page: Page): Promise<boolean> {
        return page.evaluate((selector) => {
            const container = document.querySelector(selector);
            if (!container) throw new Error('Rubika messages scroll container disappeared');
            return container.scrollTop <= 1;
        }, RUBIKA_CRAWLER_DEFINITION.bubblesContainerSelector);
    }

    private buildSinceDate(channel: CrawlerChannel, stopMsgId: string | null): Date {
        if (stopMsgId) {
            // A saved message boundary must not force tracking expired posts.
            return new Date(Date.now() - RUBIKA_PLATFORM_DEFINITION.messageTrackingWindowHours * 60 * 60 * 1000);
        }
        return channel.retryBoundary?.sinceDate
            ? new Date(channel.retryBoundary.sinceDate)
            : this.buildInitialSinceDate();
    }

    private toCrawlerMessage(post: RubikaPost): CrawlerMessage {
        return {
            platformKey: 'rubika',
            externalId: post.msgId,
            text: post.text,
            publishedAt: post.publishedAt,
            raw: post as unknown as Record<string, unknown>,
        };
    }

    private withPublishedAt(posts: RubikaPost[]): RubikaPost[] {
        return posts.map((post) => ({
            ...post,
            publishedAt: this.parseRubikaPublishedAt(post)?.toISOString() ?? null,
        }));
    }

    private parseRubikaPublishedAt(post: RubikaPost): Date | null {
        if (!post.publishedDateText || !post.time) {
            return null;
        }

        const normalizedDateText = this.normalizeDigits(post.publishedDateText);
        const dateMatch = normalizedDateText.match(/(\d{1,2})\s+([^\s،,]+)\s+(\d{4})/);
        const timeMatch = this.normalizeDigits(post.time).match(/(\d{1,2}):(\d{2})/);
        if (!dateMatch || !timeMatch) {
            return null;
        }

        const day = Number.parseInt(dateMatch[1], 10);
        const month = this.getJalaliMonth(dateMatch[2]);
        const year = Number.parseInt(dateMatch[3], 10);
        const hour = Number.parseInt(timeMatch[1], 10);
        const minute = Number.parseInt(timeMatch[2], 10);
        if (!month || [day, year, hour, minute].some((value) => Number.isNaN(value))) {
            return null;
        }

        const gregorian = this.jalaliToGregorian(year, month, day);
        const date = new Date(gregorian.year, gregorian.month - 1, gregorian.day, hour, minute, 0, 0);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    private normalizeDigits(value: string): string {
        return value
            .replace(/[۰٠]/g, '0')
            .replace(/[۱١]/g, '1')
            .replace(/[۲٢]/g, '2')
            .replace(/[۳٣]/g, '3')
            .replace(/[۴٤]/g, '4')
            .replace(/[۵٥]/g, '5')
            .replace(/[۶٦]/g, '6')
            .replace(/[۷٧]/g, '7')
            .replace(/[۸٨]/g, '8')
            .replace(/[۹٩]/g, '9');
    }

    private getJalaliMonth(monthName: string): number | null {
        const months: Record<string, number> = {
            فروردین: 1,
            اردیبهشت: 2,
            خرداد: 3,
            تیر: 4,
            مرداد: 5,
            شهریور: 6,
            مهر: 7,
            آبان: 8,
            آذر: 9,
            دی: 10,
            بهمن: 11,
            اسفند: 12,
        };

        return months[monthName] ?? null;
    }

    private jalaliToGregorian(jy: number, jm: number, jd: number): { year: number; month: number; day: number } {
        let jalaliYear = jy + 1595;
        let days =
            -355668 +
            365 * jalaliYear +
            Math.floor(jalaliYear / 33) * 8 +
            Math.floor(((jalaliYear % 33) + 3) / 4) +
            jd +
            (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);

        let gy = 400 * Math.floor(days / 146097);
        days %= 146097;

        if (days > 36524) {
            gy += 100 * Math.floor(--days / 36524);
            days %= 36524;
            if (days >= 365) {
                days++;
            }
        }

        gy += 4 * Math.floor(days / 1461);
        days %= 1461;

        if (days > 365) {
            gy += Math.floor((days - 1) / 365);
            days = (days - 1) % 365;
        }

        const gd = days + 1;
        const leap =
            (gy % 4 === 0 && gy % 100 !== 0) ||
            gy % 400 === 0;
        const monthDays = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        let gm = 1;
        let dayOfYear = gd;

        while (gm <= 12 && dayOfYear > monthDays[gm]) {
            dayOfYear -= monthDays[gm];
            gm++;
        }

        return { year: gy, month: gm, day: dayOfYear };
    }
}

export default RubikaWebCrawler;
