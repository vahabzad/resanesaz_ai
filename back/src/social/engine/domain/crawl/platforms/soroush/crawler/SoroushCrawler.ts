/// <reference lib="dom" />
import type { Browser, Page } from 'puppeteer-core';
import type { PlatformCrawler, CrawlerChannel, CrawlerChannelCrawlResult, CrawlerMessage } from '../../../types/Crawler.types';
import { Delay, GenerateWebBrowser } from '../../../helpers/browserHelpers';
import { latestMessageControl } from '../../../helpers/latestMessageControl';
import { CrawlerOperationError } from '../../../../operations/types/Operations.types';
import { PartialCrawlerExtractionError } from '../../../types/PartialCrawlerExtractionError';
import { SOROUSH_BROWSER_DEFINITION, SOROUSH_PLATFORM_DEFINITION } from '../SoroushPlatform.definition';
import { normalizeSoroushAddress, parseSoroushBatch, type SoroushNativeBatch, type SoroushNativeMessage } from './SoroushParser';
import { installSoroushBridge } from './SoroushBrowserBridge';

export default class SoroushCrawler implements PlatformCrawler {
  readonly platformKey = 'soroush';
  private browser: Browser | null = null;
  private page: Page | null = null;

  async crawlChannel(channel: CrawlerChannel): Promise<CrawlerChannelCrawlResult> {
    const { username, url } = normalizeSoroushAddress(channel.address);
    const since = channel.retryBoundary?.sinceDate ?? new Date(Date.now() - SOROUSH_PLATFORM_DEFINITION.messageTrackingWindowHours * 3600000).toISOString();
    const sinceTime = new Date(since).getTime();
    await channel.rememberBoundary?.({ sinceDate: since });
    const result: CrawlerChannelCrawlResult = { messages: [] };
    const native = new Map<number, SoroushNativeMessage>();
    let anchorId = 0;
    let boundaryAlbum: string | null = null;
    let stage = 'navigation';
    try {
      const page = await this.getPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      try { await page.waitForSelector('.LeftMainHeader', { timeout: 30000 }); }
      catch {
        const login = await page.evaluate(() => !!document.querySelector('input[type="tel"], #auth-phone-number-form, .Auth'));
        throw new CrawlerOperationError(login ? 'Soroush login is required' : 'Soroush client is unavailable', login ? 'AUTH_REQUIRED' : 'NAVIGATION_FAILED', stage, 'error');
      }
      if (!await page.evaluate(installSoroushBridge)) throw new Error('Soroush client bridge is incompatible');
      await page.evaluate((expected) => (window as any).__vavSoroush.store.getActions().openChatByUsername({ username: expected }), username);
      await page.waitForFunction((expected) => Object.values((window as any).__vavSoroush.store.getGlobal().chats.byId).some((c: any) =>
        c.type === 'chatTypeChannel' && c.usernames?.some((u: any) => u.isActive && u.username.toLowerCase() === expected)), { timeout: 30000 }, username);
      stage = 'join';
      try { await this.joinChannelIfNeeded(page, username); }
      catch (error) { throw new CrawlerOperationError('Soroush channel membership could not be confirmed', 'NAVIGATION_FAILED', stage, 'error', { causeName: error instanceof Error ? error.name : 'UnknownError' }); }
      await page.evaluate((expected) => {
        const store = (window as any).__vavSoroush.store;
        const chat = Object.values(store.getGlobal().chats.byId).find((c: any) => c.usernames?.some((u: any) => u.isActive && u.username.toLowerCase() === expected)) as any;
        store.getActions().loadFullChat({ chatId: chat.id, force: true });
      }, username);
      await page.waitForFunction((expected) => {
        const g = (window as any).__vavSoroush.store.getGlobal();
        const chat = Object.values(g.chats.byId).find((c: any) => c.usernames?.some((u: any) => u.isActive && u.username.toLowerCase() === expected)) as any;
        return !!chat && !!g.chats.fullInfoById[chat.id];
      }, { timeout: 30000 }, username);
      stage = 'latest-messages';
      await this.moveToLatestMessages(page);
      stage = 'extraction';
      let offset = 0;
      for (let index = 0; index < 40; index++) {
        const batch = await this.readBatch(page, username, offset);
        for (const message of batch.messages) if (message.peerId === batch.peerId) native.set(message.id, message);
        if (index === 0) anchorId = Math.max(0, ...batch.messages.map((m) => m.id));
        const parsed = parseSoroushBatch(channel.address, { ...batch, messages: [...native.values()] });
        result.profile = parsed.profile;
        if (index === 0 && parsed.profile) await channel.onProfileCaptured?.(parsed.profile);
        result.messages = parsed.messages.filter((m) => new Date(m.publishedAt!).getTime() >= sinceTime || Number(m.externalId) === anchorId ||
          (m.raw?.albumMessageIds as string[] | undefined)?.some((id) => Number(id) === anchorId || (native.get(Number(id))?.date ?? 0) * 1000 >= sinceTime));
        const oldest = batch.messages.reduce<SoroushNativeMessage | null>((a, b) => !a || b.id < a.id ? b : a, null);
        const retainedAlbum = oldest?.groupedId && result.messages.some((m) => m.raw?.groupedId === oldest.groupedId);
        if (!batch.end && oldest?.groupedId) result.messages = result.messages.filter((m) => m.raw?.groupedId !== oldest.groupedId);
        if (batch.metricsIncomplete) throw new CrawlerOperationError('Soroush exact view counts are incomplete', 'EXTRACTION_FAILED', 'metrics', 'warning');
        await channel.reportProgress?.({ eventCode: 'SOROUSH_BATCH_CAPTURED', stage, message: 'Soroush message batch captured', context: { batchIndex: index, messagesReceived: batch.messages.length, itemsCollected: result.messages.length } });
        if (!oldest || batch.end) return result;
        if (boundaryAlbum) { if (oldest.groupedId !== boundaryAlbum) return result; }
        else if (oldest.date * 1000 < sinceTime) { if (!retainedAlbum) return result; boundaryAlbum = oldest.groupedId!; }
        if (oldest.id === offset) throw new Error('Soroush history pagination made no progress');
        offset = oldest.id;
      }
      throw new Error('Soroush history limit reached before the tracking boundary');
    } catch (error) {
      if (error instanceof CrawlerOperationError && error.code === 'AUTH_REQUIRED') throw error;
      const failure = error instanceof CrawlerOperationError ? error : new CrawlerOperationError(`Soroush extraction failed at ${stage}`, 'EXTRACTION_FAILED', stage, 'error', { causeName: error instanceof Error ? error.name : 'UnknownError' });
      throw new PartialCrawlerExtractionError(failure, result);
    }
  }

  async fetchChannelProfile(channel: CrawlerChannel) {
    const result = await this.crawlChannel(channel);
    if (!result.profile) throw new Error('Soroush profile is unavailable');
    return result.profile;
  }
  async fetchNewMessages(channel: CrawlerChannel) { return (await this.crawlChannel(channel)).messages; }
  async fetchMessageMetrics(message: CrawlerMessage) {
    const raw = message.raw ?? {};
    return { views: raw.viewsCount as number | null, reactions: raw.reactionsCount as number | null, comments: raw.commentsCount as number | null, shares: raw.sharesCount as number | null };
  }
  async close(): Promise<void> {
    const browser = this.browser; this.browser = null; this.page = null;
    if (browser?.connected) await browser.close();
  }
  private async getPage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    const { browser, page } = await GenerateWebBrowser(SOROUSH_BROWSER_DEFINITION.sessionDir, SOROUSH_BROWSER_DEFINITION.webUrl, undefined, false);
    this.browser = browser; this.page = page; return page;
  }
  private async joinChannelIfNeeded(page: Page, username: string): Promise<void> {
    await this.withTimeout(page.evaluate(async (expected) => {
      const { store, callApi } = (window as any).__vavSoroush;
      const chat = Object.values(store.getGlobal().chats.byId).find((c: any) => c.usernames?.some((u: any) => u.isActive && u.username.toLowerCase() === expected)) as any;
      if (!chat || chat.type !== 'chatTypeChannel') throw new Error('Soroush channel identity mismatch');
      if (chat.isNotJoined) await callApi('joinChannel', { channelId: chat.id, accessHash: chat.accessHash });
    }, username));
    await page.waitForFunction((expected) => Object.values((window as any).__vavSoroush.store.getGlobal().chats.byId).some((c: any) =>
      c.type === 'chatTypeChannel' && c.usernames?.some((u: any) => u.isActive && u.username.toLowerCase() === expected) && c.isNotJoined === false), { timeout: 30000 }, username);
  }
  private async withTimeout<T>(request: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([request, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Soroush API request timed out')), 30000); })]); }
    finally { if (timer) clearTimeout(timer); }
  }
  private async moveToLatestMessages(page: Page): Promise<void> {
    await page.waitForSelector('#MiddleColumn .MessageList', { visible: true, timeout: 30000 });
    // Current Soroush uses hashed wrapper classes, but its native icon is stable.
    const selector = '#MiddleColumn button:has(.icon-arrow-down)';
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!await latestMessageControl(page, selector, true)) return;
      await Delay(750);
    }
    if (await latestMessageControl(page, selector)) {
      throw new CrawlerOperationError('Soroush latest-message control remained visible',
        'NAVIGATION_FAILED', 'latest-messages', 'error');
    }
  }
  private async readBatch(page: Page, username: string, offset: number): Promise<SoroushNativeBatch> {
    return await this.withTimeout(page.evaluate(async (expected, offsetId) => {
      const { store, callApi } = (window as any).__vavSoroush;
      const g = store.getGlobal();
      const chat = Object.values(g.chats.byId).find((c: any) => c.usernames?.some((u: any) => u.isActive && u.username.toLowerCase() === expected)) as any;
      if (!chat || chat.type !== 'chatTypeChannel') throw new Error('Soroush channel identity mismatch');
      const full = g.chats.fullInfoById[chat.id];
      const history = await callApi('fetchMessages', { chat, threadId: -1, offsetId, limit: 100, addOffset: 0 });
      if (!Array.isArray(history?.messages)) throw new Error('Soroush history response is unavailable');
      const items = history.messages.filter((m: any) => m.chatId === chat.id && !m.content?.action && !m.isScheduled);
      let metricsIncomplete = false;
      let views = new Map<number, any>();
      try {
        if (items.length) {
          const counts = await callApi('fetchMessageViews', { chat, ids: items.map((m: any) => m.id), shouldIncrement: false });
          views = new Map((counts?.viewsInfo ?? []).map((v: any) => [v.id, v]));
          metricsIncomplete = items.some((m: any) => !views.has(m.id));
        }
      } catch { metricsIncomplete = true; }
      const messages = items.map((m: any) => {
        const content = m.content ?? {}, metric = views.get(m.id);
        const mediaType = content.photo ? 'photo' : content.video ? 'video' : content.audio || content.voice ? 'audio' : content.document ? 'file' : content.sticker ? 'sticker' : content.poll ? 'poll' : 'text';
        const reactions: Record<string, number> = {};
        for (const r of m.reactions?.results ?? []) {
          const key = r.reaction?.emoticon ?? (r.reaction?.documentId ? `doc:${r.reaction.documentId}` : null);
          if (key && typeof r.count === 'number') reactions[key] = r.count;
        }
        return { id: m.id, peerId: Number(m.chatId), date: m.date, text: content.text?.text ?? '',
          views: metric?.views ?? null, forwards: metric?.forwards ?? m.forwardsCount ?? null,
          comments: m.repliesThreadInfo?.messagesCount ?? null, reactions: m.reactions ? reactions : null,
          groupedId: m.isInAlbum && m.groupedId ? String(m.groupedId) : null,
          mediaType, edited: m.isEdited === true, pinned: m.isPinned === true };
      });
      return { peerId: Number(chat.id), title: chat.title, username: expected, description: full?.about ?? null,
        followersCount: chat.membersCount ?? null, verified: chat.isVerified === true, messages,
        end: history.messages.length < 100, metricsIncomplete };
    }, username, offset));
  }
}
