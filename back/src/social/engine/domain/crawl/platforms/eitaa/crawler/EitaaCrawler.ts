/// <reference lib="dom" />
import type { Browser, Page } from 'puppeteer-core';
import type { PlatformCrawler, CrawlerChannel, CrawlerChannelCrawlResult, CrawlerMessage } from '../../../types/Crawler.types';
import { GenerateWebBrowser } from '../../../helpers/browserHelpers';
import { CrawlerOperationError } from '../../../../operations/types/Operations.types';
import { PartialCrawlerExtractionError } from '../../../types/PartialCrawlerExtractionError';
import { EITAA_BROWSER_DEFINITION, EITAA_PLATFORM_DEFINITION } from '../EitaaPlatform.definition';
import { normalizeEitaaAddress, parseEitaaBatch, type EitaaNativeBatch, type EitaaNativeMessage } from './EitaaParser';

export default class EitaaCrawler implements PlatformCrawler {
  readonly platformKey = 'eitaa';
  private browser: Browser | null = null;
  private page: Page | null = null;

  async crawlChannel(channel: CrawlerChannel): Promise<CrawlerChannelCrawlResult> {
    const { username, url } = normalizeEitaaAddress(channel.address);
    const since = channel.retryBoundary?.sinceDate ?? new Date(Date.now() - EITAA_PLATFORM_DEFINITION.messageTrackingWindowHours * 3600000).toISOString();
    const sinceTime = new Date(since).getTime();
    await channel.rememberBoundary?.({ sinceDate: since });
    const result: CrawlerChannelCrawlResult = { messages: [] };
    const collected = new Map<number, EitaaNativeMessage>();
    let anchorId: number | undefined;
    let boundaryAlbum: string | null = null;
    let stage = 'navigation';
    try {
      const page = await this.getPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      try {
        await page.waitForFunction(async (expected) => {
          const element = document.querySelector('.chat.active .chat-info [data-peer-id]') as HTMLElement | null;
          const managers = (window as any).appImManager?.managers;
          if (!element || !managers) return false;
          try {
            const chat = await managers.appChatsManager.getChat(-Number(element.dataset.peerId));
            return chat?.username?.toLowerCase() === expected && chat.pFlags?.broadcast;
          } catch { return false; }
        }, { timeout: 30000 }, username);
      } catch {
        const login = await page.evaluate(() => !!document.querySelector('input[type="tel"], .page-signPhoneNumber, .page-signIn'));
        throw new CrawlerOperationError(login ? 'Eitaa login is required' : 'Eitaa channel did not become ready', login ? 'AUTH_REQUIRED' : 'NAVIGATION_FAILED', 'navigation', 'error');
      }
      const joined = await this.joinChannelIfNeeded(page, username);
      if (joined) await channel.reportProgress?.({ eventCode: 'EITAA_CHANNEL_JOINED', stage: 'join', message: 'Eitaa channel membership confirmed' });
      await this.goToLatestMessage(page);
      await channel.reportProgress?.({ eventCode: 'EITAA_LATEST_MESSAGE_READY', stage: 'navigation', message: 'Eitaa latest-message button clicked and chat bottom confirmed' });
      stage = 'extraction';
      let offsetId = 0;
      for (let batchIndex = 0; batchIndex < 40; batchIndex++) {
        const trackedAlbums = [...new Set([...collected.values()].filter((m) =>
          m.groupedId && (m.date * 1000 >= sinceTime || m.id === anchorId || m.groupedId === boundaryAlbum),
        ).map((m) => m.groupedId!))];
        const batch = await this.readBatch(page, username, offsetId, sinceTime, trackedAlbums);
        for (const message of batch.messages) {
          if (message.peerId === batch.peerId) collected.set(message.id, message);
        }
        if (batchIndex === 0) anchorId = Math.max(0, ...batch.messages.filter((message) => message.peerId === batch.peerId).map((message) => message.id));
        // Reparse all received members so albums spanning history pages retain
        // every attachment and settle on the same lowest native message ID.
        const parsed = parseEitaaBatch(channel.address, { ...batch, messages: [...collected.values()] });
        result.profile = parsed.profile;
        if (batchIndex === 0 && parsed.profile) await channel.onProfileCaptured?.(parsed.profile);
        result.messages = parsed.messages.filter((message) =>
          new Date(message.publishedAt!).getTime() >= sinceTime ||
          (message.raw?.albumMessageIds as string[] | undefined)?.some((id) => (collected.get(Number(id))?.date ?? 0) * 1000 >= sinceTime) ||
          Number(message.externalId) === anchorId ||
          (message.raw?.albumMessageIds as string[] | undefined)?.includes(String(anchorId)),
        );
        const oldest = batch.messages.reduce<typeof batch.messages[number] | null>((a, b) => !a || b.id < a.id ? b : a, null);
        const retainedBoundaryAlbum = oldest?.groupedId && result.messages.some((message) => message.raw?.groupedId === oldest.groupedId);
        // Do not persist an album whose first member might be on the next page:
        // a failed request must not save it under a temporary post identity.
        if (!batch.end && oldest?.groupedId) result.messages = result.messages.filter((message) => message.raw?.groupedId !== oldest.groupedId);
        if (batch.metricsIncomplete) {
          const diagnostic = batch.metricsDiagnostic;
          const detail = diagnostic ? ` missing=${diagnostic.missingCount}/${diagnostic.requestedCount} requests=${diagnostic.requests} shortResponses=${diagnostic.shortResponses} apiError=${diagnostic.errorType ?? diagnostic.errorCode ?? 'none'}` : '';
          throw new CrawlerOperationError(`Eitaa exact view counts are incomplete${detail}`, 'EXTRACTION_FAILED', 'metrics', 'warning', diagnostic);
        }
        await channel.reportProgress?.({ eventCode: 'EITAA_BATCH_CAPTURED', stage, message: 'Eitaa native message batch captured', context: { batchIndex, messagesReceived: batch.messages.length, itemsCollected: result.messages.length } });
        if (!oldest || batch.end) return result;
        const reachedBoundary = oldest.date * 1000 < sinceTime;
        if (boundaryAlbum) {
          if (oldest.groupedId !== boundaryAlbum) return result;
        } else if (reachedBoundary) {
          // An old latest post or a post crossing the cutoff can still have
          // attachments on the next page. Finish only that boundary album.
          if (!retainedBoundaryAlbum) return result;
          boundaryAlbum = oldest.groupedId!;
        }
        if (oldest.id === offsetId) throw new Error('Eitaa history pagination made no progress');
        // getHistory expects the native channel message ID, not the DOM's mid.
        offsetId = oldest.id;
      }
      throw new Error('Eitaa history limit reached before the tracking boundary');
    } catch (error) {
      if (error instanceof CrawlerOperationError && error.code === 'AUTH_REQUIRED') throw error;
      const failure = error instanceof CrawlerOperationError ? error : new CrawlerOperationError(`Eitaa extraction failed at ${stage}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'EXTRACTION_FAILED', stage, 'error');
      throw new PartialCrawlerExtractionError(failure, result);
    }
  }

  async fetchChannelProfile(channel: CrawlerChannel) {
    const result = await this.crawlChannel(channel);
    if (!result.profile) throw new Error('Eitaa profile is unavailable');
    return result.profile;
  }
  async fetchNewMessages(channel: CrawlerChannel) { return (await this.crawlChannel(channel)).messages; }
  async fetchMessageMetrics(message: CrawlerMessage) {
    const raw = message.raw ?? {};
    return { views: raw.viewsCount as number | null, reactions: raw.reactionsCount as number | null, comments: raw.commentsCount as number | null, shares: raw.sharesCount as number | null };
  }
  async close(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    this.page = null;
    if (browser?.connected) await browser.close();
  }
  private async getPage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    const { browser, page } = await GenerateWebBrowser(EITAA_BROWSER_DEFINITION.sessionDir, EITAA_BROWSER_DEFINITION.webUrl, undefined, false);
    this.browser = browser;
    this.page = page;
    return page;
  }

  private async joinChannelIfNeeded(page: Page, username: string): Promise<boolean> {
    let phase = 'checking membership';
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const member = await page.evaluate(async (expected) => {
        const element = document.querySelector('.chat.active .chat-info [data-peer-id]') as HTMLElement | null;
        if (!element) throw new Error('Eitaa active channel is unavailable');
        const chat = await (window as any).appImManager.managers.appChatsManager.getChat(-Number(element.dataset.peerId));
        if (chat.username?.toLowerCase() !== expected || !chat.pFlags?.broadcast) throw new Error('Eitaa channel identity mismatch');
        return !chat.pFlags.left && !chat.pFlags.kicked;
      }, username);
      if (member) return false;
      phase = 'joining channel';
      // Use the official client's method: it awaits the server response and
      // updates its chat cache, unlike a pointer click during header animation.
      await Promise.race([page.evaluate(async (expected) => {
        const element = document.querySelector('.chat.active .chat-info [data-peer-id]') as HTMLElement | null;
        if (!element) throw new Error('Eitaa active channel is unavailable');
        const managers = (window as any).appImManager.managers;
        const chatId = -Number(element.dataset.peerId);
        const chat = await managers.appChatsManager.getChat(chatId);
        if (chat.username?.toLowerCase() !== expected || !chat.pFlags?.broadcast) throw new Error('Eitaa channel identity mismatch');
        await managers.appChatsManager.joinChannel(chatId);
      }, username), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Eitaa join request timed out')), 30000);
      })]);
      phase = 'confirming membership';
      await page.waitForFunction(async (expected) => {
        const element = document.querySelector('.chat.active .chat-info [data-peer-id]') as HTMLElement | null;
        if (!element) return false;
        const chat = await (window as any).appImManager.managers.appChatsManager.getChat(-Number(element.dataset.peerId));
        return chat.username?.toLowerCase() === expected && chat.pFlags?.broadcast &&
          !chat.pFlags.left && !chat.pFlags.kicked;
      }, { timeout: 30000, polling: 250 }, username);
      return true;
    } catch (error) {
      const causeName = error instanceof Error ? error.name : 'UnknownError';
      throw new CrawlerOperationError(`Eitaa channel membership failed while ${phase}`, 'NAVIGATION_FAILED', 'join', 'error', { phase, causeName });
    } finally { if (timer) clearTimeout(timer); }
  }

  private async goToLatestMessage(page: Page): Promise<void> {
    try {
      // Scope the control to the active chat so a previous channel cannot win.
      const selector = '.chat.active .bubbles-go-down';
      await page.waitForSelector(selector, { timeout: 15000 });
      // Eitaa hides this button when already at the bottom; its click handler
      // still performs the latest-message action in both visibility states.
      await page.$eval(selector, (button) => (button as HTMLElement).click());
      await page.waitForFunction(() => {
        const scroller = document.querySelector('.chat.active .bubbles .scrollable') as HTMLElement | null;
        return !!scroller && scroller.clientHeight > 0 &&
          scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= 4;
      }, { timeout: 30000, polling: 100 });
    } catch {
      throw new CrawlerOperationError('Eitaa chat could not reach the latest message', 'NAVIGATION_FAILED', 'navigation', 'error');
    }
  }

  private async readBatch(page: Page, username: string, offsetId: number, sinceTime = -Infinity, trackedAlbums: string[] = []): Promise<EitaaNativeBatch> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
    return await Promise.race([page.evaluate(async (expectedUsername, offset, metricSince, previousAlbums) => {
      // The official client's managers keep credentials in the browser. Only this
      // allowlist crosses the boundary; native media access hashes and auth do not.
      const managers = (window as any).appImManager.managers;
      const element = document.querySelector('.chat.active .chat-info [data-peer-id]') as HTMLElement;
      const peerId = Number(element.dataset.peerId);
      const chat = await managers.appChatsManager.getChat(-peerId);
      if (chat.username?.toLowerCase() !== expectedUsername || !chat.pFlags?.broadcast) throw new Error('Eitaa target is not the requested public channel');
      const profile = await managers.appProfileManager.getProfileByPeerId(peerId);
      const peer = await managers.appPeersManager.getInputPeerById(peerId);
      // Read through the client's authenticated API transport. Its cached
      // getHistory results mix DOM mids and native IDs across pagination.
      const history = await managers.apiManager.invokeApiSingle('messages.getHistory', {
        peer, offset_id: offset, offset_date: 0, add_offset: 0,
        limit: 100, max_id: 0, min_id: 0, hash: '0',
      });
      if (!Array.isArray(history.messages)) throw new Error('Eitaa history response is unavailable');
      const nativeMessages = history.messages.filter((m: any) => m._ === 'message' && -m.peer_id?.channel_id === peerId);
      const newestId = offset === 0 ? Math.max(0, ...nativeMessages.map((m: any) => m.id)) : 0;
      const requiredAlbums = new Set(previousAlbums);
      for (const m of nativeMessages) {
        if ((m.date * 1000 >= (metricSince ?? -Infinity) || m.id === newestId) && m.grouped_id != null && String(m.grouped_id) !== '0') requiredAlbums.add(String(m.grouped_id));
      }
      const required = nativeMessages.filter((m: any) => m.date * 1000 >= (metricSince ?? -Infinity) || m.id === newestId ||
        (m.grouped_id != null && requiredAlbums.has(String(m.grouped_id))));
      const counts = new Map<number, { views: number | null; forwards: number | null }>();
      const pending: number[][] = required.length ? [required.map((m: any) => m.id)] : [];
      const deadline = Date.now() + 20_000;
      let requests = 0;
      let shortResponses = 0;
      let errorCode: number | null = null;
      let errorType: string | null = null;
      while (pending.length && requests < 32 && Date.now() < deadline) {
        const ids = pending.shift()!;
        requests++;
        try {
          const response = await managers.apiManager.invokeApiSingle('messages.getMessagesViews', { peer, id: ids, increment: false });
          if (!Array.isArray(response?.views) || response.views.length !== ids.length) {
            shortResponses++;
            // The response has no IDs. Never zip a shortened vector with the
            // original request: every subsequent counter could shift messages.
            if (ids.length > 1) {
              const middle = Math.ceil(ids.length / 2);
              pending.push(ids.slice(0, middle), ids.slice(middle));
            }
            continue;
          }
          for (let index = 0; index < ids.length; index++) {
            const value = response.views[index];
            counts.set(ids[index], {
              views: Number.isSafeInteger(value?.views) && value.views >= 0 ? value.views : null,
              forwards: Number.isSafeInteger(value?.forwards) && value.forwards >= 0 ? value.forwards : null,
            });
          }
        } catch (error) {
          const failure = error as { code?: unknown; type?: unknown };
          errorCode = typeof failure?.code === 'number' ? failure.code : null;
          errorType = typeof failure?.type === 'string' && /^[A-Z0-9_]{1,80}$/.test(failure.type) ? failure.type : null;
          break;
        }
      }
      const missing = required.filter((m: any) => counts.get(m.id)?.views == null);
      const metricsIncomplete = missing.length > 0;
      const metricsDiagnostic = { requestedCount: required.length, missingCount: missing.length,
        requests, shortResponses, errorCode, errorType };
      const messages = nativeMessages.map((m: any) => {
        const document = m.media?.document;
        let mediaType = 'text';
        if (m.media?.photo) mediaType = 'photo';
        else if (document) mediaType = document.type === 'video' || document.mime_type?.startsWith('video/') ? 'video' : document.mime_type?.startsWith('audio/') ? 'audio' : 'file';
        const reactions: Record<string, number> = {};
        for (const reaction of m.reactions?.results ?? []) {
          const key = reaction.reaction?.emoticon ?? (reaction.reaction?.document_id ? `doc:${reaction.reaction.document_id}` : null);
          if (key && typeof reaction.count === 'number') reactions[key] = reaction.count;
        }
        // Keep the native 64-bit album key as text; Number would lose precision.
        const groupedId = m.grouped_id != null && String(m.grouped_id) !== '0' ? String(m.grouped_id) : null;
        return { id: m.id, peerId: -m.peer_id?.channel_id, date: m.date, text: m.message ?? '', views: counts.get(m.id)?.views ?? null, forwards: counts.get(m.id)?.forwards ?? m.forwards ?? null, comments: m.replies?.replies ?? null, reactions: m.reactions ? reactions : null, mediaType, groupedId, edited: !!m.edit_date, pinned: !!m.pFlags?.pinned };
      });
      return { peerId, title: chat.title, username: chat.username, description: profile.about ?? null, followersCount: profile.participants_count ?? chat.participants_count ?? null, verified: !!chat.pFlags?.verified, messages, metricsIncomplete, metricsDiagnostic, end: history.messages.length < 100 };
    }, username, offsetId, Number.isFinite(sinceTime) ? sinceTime : null, trackedAlbums), new Promise<EitaaNativeBatch>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Eitaa API batch timed out')), 30000);
    })]);
    } finally { if (timer) clearTimeout(timer); }
  }
}
