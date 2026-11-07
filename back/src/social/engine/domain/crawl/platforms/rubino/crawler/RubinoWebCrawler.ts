/// <reference lib="dom" />
import { extractionError } from '../../../helpers/CrawlRecovery';
import { PartialCrawlerExtractionError } from '../../../types/PartialCrawlerExtractionError';

import type { Browser, Page } from 'puppeteer-core';
import { ErrorResult } from '../../../../../helper/error.tool';
import { log } from '../../../../../helper/showLog';
import {
    attachNetworkLogger,
    clickXPath,
    Delay,
    firstExistingSelector,
    GenerateWebBrowser,
    setInputValue,
    type NetworkLogEntry,
} from '../../../helpers/browserHelpers';
import { asNumber, asRecord, asString, unixSecondsToDate } from '../../../helpers/dataHelpers';
import type {
    CrawlerChannel,
    CrawlerChannelCrawlResult,
    CrawlerChannelProfile,
    CrawlerMessage,
} from '../../../types/Crawler.types';
import { CrawlerOperationError } from '../../../../operations/types/Operations.types';
import { RUBINO_CRAWLER_DEFINITION } from '../RubinoPlatform.definition';

export interface RubinoExtractedNetworkItem {
    rule: string;
    method: string;
    url: string;
    status: number | null;
    requestPayload: unknown;
    responseBody: unknown;
    capturedAt: string;
}

export interface RubinoReadResult extends CrawlerChannelCrawlResult {
    networkLogs: NetworkLogEntry[];
    extracted: RubinoExtractedNetworkItem[];
}

interface RubinoReadOptions {
    collectAllPosts?: boolean;
}

class RubinoWebCrawler {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private networkLogs: NetworkLogEntry[] = [];
    private detachNetworkLogger: (() => void) | null = null;

    constructor(private readonly sessionDir = RUBINO_CRAWLER_DEFINITION.sessionDir) { }

    async crawlChannel(channel: CrawlerChannel): Promise<CrawlerChannelCrawlResult> {
        const collectAllPosts = channel.retryBoundary?.initialFullCrawl ?? channel.metadata?.initialFullCrawl === true;
        await channel.rememberBoundary?.({ initialFullCrawl: collectAllPosts });
        const result = await this.readBrand(channel.address, {
            collectAllPosts,
        });
        return {
            profile: result.profile,
            messages: result.messages,
        };
    }

    async fetchChannelProfile(channel: CrawlerChannel): Promise<CrawlerChannelProfile> {
        const result = await this.readBrand(channel.address);
        if (!result.profile) {
            throw new Error(`Rubino profile not found for ${channel.address}`);
        }

        return result.profile;
    }

    async fetchNewMessages(channel: CrawlerChannel): Promise<CrawlerMessage[]> {
        const result = await this.readBrand(channel.address);
        return result.messages;
    }

    async fetchFastNewPosts(channel: CrawlerChannel, latestRegisteredPostId: string | null): Promise<CrawlerMessage[]> {
        const result = await this.fetchFastCrawlResult(channel, latestRegisteredPostId);
        return result.messages;
    }

    async fetchFastCrawlResult(
        channel: CrawlerChannel,
        latestRegisteredPostId: string | null
    ): Promise<CrawlerChannelCrawlResult> {
        const result = await this.readBrand(channel.address);
        const messages = this.filterMessagesAfterPostId(result.messages, latestRegisteredPostId);

        if (!latestRegisteredPostId) {
            log(
                `rubino fast post crawl used latest response posts channelId=${channel.id ?? ''} address=${channel.address}`,
                'info'
            );
        }

        if (latestRegisteredPostId && result.messages.some((message) => message.externalId === latestRegisteredPostId)) {
            log(`rubino fast post crawl stop post found channelId=${channel.id ?? ''}`, 'info');
        }

        return {
            profile: result.profile,
            messages,
        };
    }

    async readBrand(query: string, options: RubinoReadOptions = {}): Promise<RubinoReadResult> {
        this.networkLogs.length = 0;
        let stage = 'navigation';

        try {
            const page = await this.getPage();
            await this.openSearch(page);
            stage = 'channel-search';
            await this.typeSearchQuery(page, query);
            await Delay(2_000);
            stage = 'channel-open';
            await this.openFirstResult(page);
            await Delay(3_000);

            stage = 'message-history';
            if (options.collectAllPosts) {
                await this.collectAllAvailablePostResponses(page, this.networkLogs);
            }

            const networkLogs = [...this.networkLogs];
            const extracted = this.extractNetworkData(networkLogs);
            return {
                ...this.toCrawlResult(query, extracted),
                networkLogs,
                extracted,
            };
        } catch (error) {
            const extracted = this.extractNetworkData([...this.networkLogs]);
            throw new PartialCrawlerExtractionError(extractionError(error, stage, { address: query }), this.toCrawlResult(query, extracted));
        } finally {
            this.networkLogs.length = 0;
        }
    }

    async close(): Promise<void> {
        if (this.detachNetworkLogger) {
            this.detachNetworkLogger();
            this.detachNetworkLogger = null;
        }

        const browser = this.browser;
        this.browser = null;
        this.page = null;
        this.networkLogs.length = 0;

        if (browser) {
            await browser.close();
            log('rubino browser closed; next crawl will open a fresh browser', 'info');
        }
    }

    private async getPage(): Promise<Page> {
        if (this.page && !this.page.isClosed()) {
            return this.page;
        }

        if (this.detachNetworkLogger) {
            this.detachNetworkLogger();
            this.detachNetworkLogger = null;
        }

        const { browser, page } = await GenerateWebBrowser(
            this.sessionDir,
            RUBINO_CRAWLER_DEFINITION.webUrl
        );
        this.browser = browser;
        this.page = page;
        this.detachNetworkLogger = attachNetworkLogger(page, this.networkLogs);
        await page.bringToFront();
        await Delay(3_000);
        await this.ensureAuthenticated(page);
        log('rubino browser opened', 'success');
        return page;
    }

    private async openSearch(page: Page): Promise<void> {
        await this.ensureAuthenticated(page);

        if (await clickXPath(page, RUBINO_CRAWLER_DEFINITION.selectors.homeExploreButtonXPath)) {
            await Delay(1_000);
        }

        await this.ensureAuthenticated(page);

        if (await clickXPath(page, RUBINO_CRAWLER_DEFINITION.selectors.searchButtonXPath)) {
            await Delay(1_000);
            await this.ensureAuthenticated(page);
            return;
        }

        log('rubino search button not found; continuing for manual testing', 'warning');
    }

    private async ensureAuthenticated(page: Page): Promise<void> {
        if (await isRubinoLoginPage(page)) {
            log('rubino session not authenticated', 'error');
            throw new CrawlerOperationError('Rubino session is not authenticated', 'AUTH_REQUIRED', 'authentication', 'critical');
        }
    }

    private shouldRunHeadless(): boolean {
        return process.env.HEADLESS !== 'false';
    }

    private async typeSearchQuery(page: Page, query: string): Promise<void> {
        const selector = await firstExistingSelector(
            page,
            RUBINO_CRAWLER_DEFINITION.selectors.searchInputCandidates
        );
        if (!selector) {
            throw new CrawlerOperationError('Rubino search input not found', 'SELECTOR_MISSING', 'navigation', 'error');
        }

        await page.waitForSelector(selector, { timeout: 10_000 });
        const updated = await setInputValue(page, selector, query);
        if (!updated) {
            throw new CrawlerOperationError(
                `Rubino search input could not be updated: ${selector}`,
                'EXTRACTION_FAILED', 'navigation', 'error', { selector },
            );
        }

        await page.keyboard.press('Enter');
    }

    private async openFirstResult(page: Page): Promise<void> {
        if (!(await clickXPath(page, RUBINO_CRAWLER_DEFINITION.selectors.firstResultXPath))) {
            log('rubino first result not found', 'warning');
        }
    }

    async returnToSearch(): Promise<void> {
        if (!this.page || this.page.isClosed()) {
            return;
        }

        await clickXPath(this.page, RUBINO_CRAWLER_DEFINITION.selectors.backButtonXPath);
        await Delay(1_000);
        await clickXPath(this.page, RUBINO_CRAWLER_DEFINITION.selectors.clearButtonXPath);
        await Delay(1_000);
    }

    extractNetworkData(logs: NetworkLogEntry[]): RubinoExtractedNetworkItem[] {
        const responses = logs.filter((entry) => entry.type === 'response' && entry.responseBody !== undefined);
        const items: RubinoExtractedNetworkItem[] = [];

        for (const response of responses) {
            const method = this.getPayloadMethod(response.requestPayload);
            if (method !== 'getProfileInfo' && method !== 'getProfilePosts') {
                continue;
            }

            items.push({
                rule: method === 'getProfileInfo' ? 'profile-detail' : 'profile-posts',
                method: response.method,
                url: response.url,
                status: response.status ?? null,
                requestPayload: response.requestPayload ?? response.requestPostData ?? null,
                responseBody: response.responseBody,
                capturedAt: response.capturedAt,
            });
        }

        return items;
    }

    toCrawlResult(query: string, items: RubinoExtractedNetworkItem[]): CrawlerChannelCrawlResult {
        const profileItem = items.find((item) => this.getPayloadMethod(item.requestPayload) === 'getProfileInfo');
        const profile = profileItem ? this.getProfileFromResponse(profileItem.responseBody) : null;
        if (profile && asString(profile.username)?.replace(/^@/, '').toLowerCase() !== query.replace(/^@/, '').toLowerCase()) {
            throw new CrawlerOperationError('Rubino profile identity mismatch', 'EXTRACTION_FAILED', 'identity', 'error');
        }
        const messages = this.uniqueMessages(items
            .filter((item) => this.getPayloadMethod(item.requestPayload) === 'getProfilePosts')
            .flatMap((item) => this.getPostsFromResponse(item.responseBody).map((post) => this.toCrawlerMessage(post, item.capturedAt))));

        return {
            profile: profile ? this.toCrawlerProfile(query, profile) : null,
            messages,
        };
    }

    private toCrawlerProfile(query: string, profile: Record<string, unknown>): CrawlerChannelProfile {
        return {
            platformKey: 'rubino',
            address: asString(profile.username) ?? query,
            title: asString(profile.name),
            description: asString(profile.bio),
            avatarUrl: asString(profile.full_photo_url) ?? asString(profile.full_thumbnail_url),
            raw: {
                ...profile,
                followersCount: asNumber(profile.follower_count),
                postsCount: asNumber(profile.post_count),
                username: asString(profile.username),
                profileId: asString(profile.id),
            },
        };
    }

    private toCrawlerMessage(post: Record<string, unknown>, capturedAt: string): CrawlerMessage {
        const postId = asString(post.id) ?? `${asString(post.profile_id) ?? 'rubino'}-${capturedAt}`;
        const likesCount = asNumber(post.likes_count);

        return {
            platformKey: 'rubino',
            externalId: postId,
            text: null,
            publishedAt: unixSecondsToDate(post.create_date),
            raw: {
                ...post,
                mediaType: asString(post.file_type) ?? asString(post.show_type),
                mediaUrls: this.collectPostMediaUrls(post),
                caption: asString(post.caption),
                viewsCount: asNumber(post.video_view_count),
                likesCount,
                commentsCount: asNumber(post.comment_count),
                reactionsCount: likesCount,
                reactions: likesCount === null ? {} : { like: likesCount },
            },
        };
    }

    private getPayloadMethod(payload: unknown): string | null {
        return asString(asRecord(payload).method);
    }

    private getProfileFromResponse(responseBody: unknown): Record<string, unknown> | null {
        const profile = asRecord(asRecord(asRecord(responseBody).data).profile);
        return Object.keys(profile).length ? profile : null;
    }

    private getPostsFromResponse(responseBody: unknown): Array<Record<string, unknown>> {
        const posts = asRecord(asRecord(responseBody).data).posts;
        return Array.isArray(posts)
            ? posts.filter((post): post is Record<string, unknown> => Boolean(post) && typeof post === 'object' && !Array.isArray(post))
            : [];
    }

    private collectPostMediaUrls(post: Record<string, unknown>): string[] {
        const urls = [
            asString(post.full_file_url),
            asString(post.full_thumbnail_url),
            asString(post.full_snapshot_url),
            asString(post.full_post_profile_thumbnail_url),
        ].filter((value): value is string => Boolean(value));

        const fileList = post.file_list;
        if (Array.isArray(fileList)) {
            for (const item of fileList) {
                const file = asRecord(item);
                for (const key of ['full_file_url', 'full_thumbnail_url', 'full_snapshot_url']) {
                    const url = asString(file[key]);
                    if (url) urls.push(url);
                }
            }
        }

        return [...new Set(urls)];
    }

    private async collectAllAvailablePostResponses(page: Page, logs: NetworkLogEntry[]): Promise<void> {
        let knownPostIds = this.getExtractedPostIds(logs);
        let noNewPostCount = 0;

        log(`rubino initial full crawl started posts=${knownPostIds.size}`, 'info');

        for (let scroll = 1; scroll <= RUBINO_CRAWLER_DEFINITION.initialCrawl.maxScrolls; scroll++) {
            await this.scrollPostsDown(page);
            await Delay(RUBINO_CRAWLER_DEFINITION.initialCrawl.scrollDelayMs);

            const nextPostIds = this.getExtractedPostIds(logs);
            const newPostsCount = nextPostIds.size - knownPostIds.size;
            knownPostIds = nextPostIds;

            if (newPostsCount <= 0) {
                noNewPostCount++;
            } else {
                noNewPostCount = 0;
                log(`rubino initial full crawl loaded more posts total=${knownPostIds.size}`, 'info');
            }

            if (noNewPostCount >= RUBINO_CRAWLER_DEFINITION.initialCrawl.noNewPostLimit) {
                break;
            }
        }

        log(`rubino initial full crawl completed posts=${knownPostIds.size}`, 'success');
    }

    private async scrollPostsDown(page: Page): Promise<void> {
        await page.evaluate(() => {
            const scrollableElements = Array.from(document.querySelectorAll<HTMLElement>('div, main, section, ul'))
                .filter((element) => element.scrollHeight > element.clientHeight + 50)
                .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
            const target = scrollableElements[0] ?? document.scrollingElement ?? document.documentElement;
            target.scrollTop = target.scrollHeight;
            window.scrollTo(0, document.body.scrollHeight);
        });
    }

    private getExtractedPostIds(logs: NetworkLogEntry[]): Set<string> {
        const ids = new Set<string>();
        const items = this.extractNetworkData(logs)
            .filter((item) => this.getPayloadMethod(item.requestPayload) === 'getProfilePosts');

        for (const item of items) {
            for (const post of this.getPostsFromResponse(item.responseBody)) {
                const id = asString(post.id);
                if (id) ids.add(id);
            }
        }

        return ids;
    }

    private uniqueMessages(messages: CrawlerMessage[]): CrawlerMessage[] {
        const byExternalId = new Map<string, CrawlerMessage>();
        for (const message of messages) {
            byExternalId.set(message.externalId, message);
        }

        return Array.from(byExternalId.values());
    }

    private filterMessagesAfterPostId(messages: CrawlerMessage[], latestRegisteredPostId: string | null): CrawlerMessage[] {
        if (!latestRegisteredPostId || !/^\d+$/.test(latestRegisteredPostId)) {
            return messages;
        }

        const stopId = BigInt(latestRegisteredPostId);
        return messages.filter((message) => {
            if (!/^\d+$/.test(message.externalId)) {
                return true;
            }

            return BigInt(message.externalId) > stopId;
        });
    }
}


export async function isRubinoLoginPage(page: Page): Promise<boolean> {
  await Delay(1_000);
  return await page.evaluate(() => {
    const hasLoginSignIn = document.querySelector('[class*="login_sign_in"]') !== null;
    const hasAuthImage = document.querySelector('[class*="auth-image"]') !== null;
    const hasPhoneInput = document.querySelector('[id*="phoneNumber"]') !== null;
    return hasLoginSignIn || hasAuthImage || hasPhoneInput;
  });
}

export default RubinoWebCrawler;
