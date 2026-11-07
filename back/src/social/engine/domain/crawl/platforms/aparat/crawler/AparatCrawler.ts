import { setTimeout as wait } from 'node:timers/promises';
import { asRecord } from '../../../helpers/dataHelpers';
import type { CrawlerChannel, CrawlerChannelCrawlResult, CrawlerMessage, PlatformCrawler } from '../../../types/Crawler.types';
import { APARAT_CRAWLER_DEFINITION } from '../AparatPlatform.definition';
import { aparatNewsComplete, aparatUsername, parseAparatProfile, parseAparatVideo, parseAparatShort, mergeAparatDetails } from './AparatParser';
import { AparatRateLimitError, aparatRetryDelay } from './AparatRequestPolicy';
import AparatBrowserSession, { isAparatReadApi } from './AparatBrowserSession';

export interface AparatCrawlerOptions { maxVideos?: number; maxShorts?: number; maxPages?: number; requestIntervalMs?: number }
type FetchJson = (url: string, signal: AbortSignal) => Promise<unknown>;

export default class AparatCrawler implements PlatformCrawler {
  // Shared by local channels and crawler instances in this process, not just one page.
  private static nextRequestAt = 0;
  private static cooldownUntil = 0;
  readonly platformKey = 'aparat';
  private abortController = new AbortController();
  private readonly maxVideos: number;
  private readonly maxShorts: number;
  private readonly maxPages: number;
  private readonly requestIntervalMs: number;
  private readonly fetchJson: FetchJson;
  private readonly browserSession: AparatBrowserSession | null;
  private preparedUsername: string | null = null;
  private busy = false;
  constructor(options: AparatCrawlerOptions = {}, fetchJson?: FetchJson) {
    this.browserSession = fetchJson ? null : new AparatBrowserSession();
    this.fetchJson = fetchJson ?? (async (url, signal) => {
      const reply = await this.browserSession!.request(url, signal);
      if (reply.status < 200 || reply.status >= 300) {
        const error = new Error(`Aparat page API failed (HTTP ${reply.status})`);
        Object.assign(error, { response: { status: reply.status, headers: reply.headers } });
        throw error;
      }
      if (reply.headers['x-rr-ratelimit-remaining'] === '0') {
        AparatCrawler.cooldownUntil = Math.max(AparatCrawler.cooldownUntil, Date.now() + aparatRetryDelay(reply.headers));
      }
      return reply.payload;
    });
    this.maxVideos = options.maxVideos ?? APARAT_CRAWLER_DEFINITION.maxVideos;
    this.maxShorts = options.maxShorts ?? APARAT_CRAWLER_DEFINITION.maxShorts;
    this.maxPages = options.maxPages ?? APARAT_CRAWLER_DEFINITION.maxPages;
    this.requestIntervalMs = options.requestIntervalMs ?? APARAT_CRAWLER_DEFINITION.requestIntervalMs;
    if (!Number.isInteger(this.maxVideos) || this.maxVideos < 0 || this.maxVideos > 1000 ||
      !Number.isInteger(this.maxShorts) || this.maxShorts < 0 || this.maxShorts > 1000 ||
      !Number.isInteger(this.maxPages) || this.maxPages < 1 || this.maxPages > 100) throw new Error('Invalid Aparat crawl limits');
    if (!Number.isInteger(this.requestIntervalMs) || this.requestIntervalMs < 0 || this.requestIntervalMs > 60_000) throw new Error('Invalid Aparat request interval');
  }

  private async request(path: string, shorts = false): Promise<unknown> {
    if (this.abortController.signal.aborted) throw new Error('Aparat crawl stopped');
    for (let attempt = 0; ; attempt++) {
      if (Date.now() < AparatCrawler.cooldownUntil) throw new AparatRateLimitError(AparatCrawler.cooldownUntil);
      const scheduledAt = Math.max(Date.now(), AparatCrawler.nextRequestAt);
      AparatCrawler.nextRequestAt = scheduledAt + this.requestIntervalMs;
      if (scheduledAt > Date.now()) await wait(scheduledAt - Date.now(), undefined, { signal: this.abortController.signal });
      if (Date.now() < AparatCrawler.cooldownUntil) throw new AparatRateLimitError(AparatCrawler.cooldownUntil);
      try { return await this.fetchJson(`${shorts ? 'https://shorts.aparat.com/api' : 'https://www.aparat.com'}/${path}`, this.abortController.signal); }
      catch (error) {
        const response = asRecord(asRecord(error).response);
        const status = typeof response.status === 'number' ? response.status : undefined;
        if (status === 429) {
          const retryAt = Date.now() + aparatRetryDelay(response.headers);
          AparatCrawler.cooldownUntil = Math.max(AparatCrawler.cooldownUntil, retryAt);
          throw new AparatRateLimitError(AparatCrawler.cooldownUntil);
        }
        if (attempt >= 1 || this.abortController.signal.aborted || (status && status < 500 && status !== 429)) throw error;
        await wait(1000, undefined, { signal: this.abortController.signal });
      }
    }
  }

  async fetchChannelProfile(channel: CrawlerChannel) {
    const username = aparatUsername(channel.address);
    if (Date.now() < AparatCrawler.cooldownUntil) throw new AparatRateLimitError(AparatCrawler.cooldownUntil);
    if (this.browserSession && this.preparedUsername !== username) {
      await this.browserSession.startChannel(username); this.preparedUsername = username;
    }
    return parseAparatProfile(await this.request(`api/fa/v1/user/user/information/username/${encodeURIComponent(username)}`), username);
  }

  async crawlChannel(channel: CrawlerChannel): Promise<CrawlerChannelCrawlResult> {
    if (this.busy) throw new Error('Aparat crawler already has an active channel');
    this.busy = true;
    try {
      if (channel.platformKey !== this.platformKey) throw new Error('Aparat channel platform mismatch');
      if (this.abortController.signal.aborted) this.abortController = new AbortController();
      if (Date.now() < AparatCrawler.cooldownUntil) throw new AparatRateLimitError(AparatCrawler.cooldownUntil);
      const username = aparatUsername(channel.address);
      if (this.browserSession) {
        await this.browserSession.startChannel(username); this.preparedUsername = username;
      }
      return await this.collectChannel(channel);
    } finally {
      this.browserSession?.clearCaptured(); this.preparedUsername = null; this.busy = false;
    }
  }

  private async collectChannel(channel: CrawlerChannel): Promise<CrawlerChannelCrawlResult> {
    if (channel.platformKey !== this.platformKey) throw new Error('Aparat channel platform mismatch');
    if (this.abortController.signal.aborted) this.abortController = new AbortController();
    const username = aparatUsername(channel.address);
    const profile = await this.fetchChannelProfile(channel);
    await channel.onProfileCaptured?.(profile);
    const messages = new Map<string, CrawlerMessage>();
    let incomplete = false;
    const incompleteStages = new Set<string>();
    let rateLimited = false;
    let firstError: unknown;
    let sourceLoaded = this.maxVideos === 0 && this.maxShorts === 0;
    let offset = 0;
    let nextVideoPath: string | null = null;
    for (let page = 0; page < this.maxPages && messages.size < this.maxVideos; page++) {
      let payload: Record<string, unknown>;
      try {
        payload = asRecord(await this.request(nextVideoPath ?? `etc/api/videobyuser/username/${encodeURIComponent(username)}/perpage/${APARAT_CRAWLER_DEFINITION.pageSize}/curoffset/${offset}`));
        if (!Array.isArray(payload.videobyuser)) throw new Error('Invalid Aparat video list');
        sourceLoaded = true;
      } catch (error) {
        rateLimited = error instanceof AparatRateLimitError;
        if (page === 0) firstError = error;
        incomplete = true; incompleteStages.add('VIDEO_LIST_REQUEST'); break;
      }
      const rows = payload.videobyuser as unknown[];
      if (!rows.length) break;
      const countBefore = messages.size;
      for (const row of rows) {
        if (messages.size >= this.maxVideos) break;
        let listed: CrawlerMessage;
        try { listed = parseAparatVideo(row, username); }
        catch (error) {
          if (error instanceof Error && error.message === 'Aparat video belongs to another channel') {
            await channel.reportProgress?.({ eventCode: 'APARAT_FOREIGN_VIDEO_EXCLUDED', stage: 'identity', message: 'A video from another channel was excluded' });
            continue;
          }
          incomplete = true; incompleteStages.add('VIDEO_IDENTITY'); continue;
        }
        if (messages.has(listed.externalId)) continue;
        if (aparatNewsComplete(listed)) { messages.set(listed.externalId, listed); continue; }
        if (rateLimited) { incomplete = true; incompleteStages.add('RATE_LIMIT'); messages.set(listed.externalId, listed); continue; }
        try {
          const detail = mergeAparatDetails(listed, parseAparatVideo(await this.request(`api/fa/v1/video/video/show/videohash/${listed.externalId}`), username, listed.externalId));
          messages.set(detail.externalId, detail);
          if (!aparatNewsComplete(detail)) { incomplete = true; incompleteStages.add('VIDEO_BODY'); }
        } catch (error) {
          if (this.abortController.signal.aborted) throw new Error('Aparat crawl stopped');
          incomplete = true; incompleteStages.add('VIDEO_DETAIL_REQUEST'); messages.set(listed.externalId, listed);
          if (error instanceof AparatRateLimitError) rateLimited = true;
        }
      }
      await channel.reportProgress?.({ eventCode: 'APARAT_PAGE_FETCHED', stage: 'extraction', message: 'Aparat video page fetched', context: { page: page + 1, items: messages.size } });
      if (rateLimited) break;
      if (!asRecord(payload.ui).pagingForward) break;
      if (messages.size === countBefore) { incomplete = true; incompleteStages.add('PAGINATION_STALLED'); break; }
      if (page === this.maxPages - 1 && messages.size < this.maxVideos) { incomplete = true; incompleteStages.add('PAGE_BUDGET'); }
      offset += rows.length;
      if (payload.sourceApi === 'browser-video-list') {
        const next = String(asRecord(payload.ui).pagingForward);
        if (!isAparatReadApi(next) || !new URL(next).pathname.startsWith(`/api/fa/v1/user/video/list/username/${username}/`)) {
          incomplete = true; incompleteStages.add('PAGINATION_URL'); break;
        }
        const url = new URL(next); nextVideoPath = `${url.pathname.slice(1)}${url.search}`;
      }
    }
    const authorId = profile.raw?.authorId;
    let shortsCount = 0;
    let from = 1;
    if (this.maxShorts > 0 && !rateLimited) {
      if (typeof authorId !== 'string' || !/^\d+$/.test(authorId)) {
        firstError ??= new Error('Aparat profile has no numeric channel ID for shorts');
        incomplete = true; incompleteStages.add('SHORTS_AUTHOR_ID');
      } else {
        for (let page = 0; page < this.maxPages && shortsCount < this.maxShorts; page++) {
          let data: Record<string, unknown>;
          try {
            const payload = asRecord(await this.request(`v1/profile/${authorId}/posts?from=${from}&count=${APARAT_CRAWLER_DEFINITION.pageSize}`, true));
            data = asRecord(payload.data);
            if (payload.status !== 'ok' || !Array.isArray(data.posts)) throw new Error('Invalid Aparat shorts list');
            sourceLoaded = true;
          } catch (error) {
            rateLimited = error instanceof AparatRateLimitError;
            firstError ??= error; incomplete = true; incompleteStages.add('SHORTS_LIST_REQUEST'); break;
          }
          const rows = data.posts as unknown[];
          if (!rows.length) break;
          const countBefore = shortsCount;
          for (const row of rows) {
            if (shortsCount >= this.maxShorts) break;
            if (asRecord(row).type === 'ad') continue;
            let listed: CrawlerMessage;
            try { listed = parseAparatShort(row, username, authorId); }
            catch { incomplete = true; incompleteStages.add('SHORT_IDENTITY'); continue; }
            if (messages.has(listed.externalId)) continue;
            if (aparatNewsComplete(listed)) { messages.set(listed.externalId, listed); shortsCount++; continue; }
            if (rateLimited) {
              messages.set(listed.externalId, { ...listed, raw: { ...listed.raw, detailStatus: 'partial' } });
              shortsCount++; continue;
            }
            let detail = listed;
            const shortId = String(listed.raw?.shortId);
            try {
              detail = mergeAparatDetails(listed, parseAparatShort(await this.request(`v1/posts/${shortId}`, true), username, authorId, shortId));
            } catch (error) {
              if (this.abortController.signal.aborted) throw new Error('Aparat crawl stopped');
              incomplete = true; incompleteStages.add('SHORT_DETAIL_REQUEST');
              // Keep exact list counters, but record that the detail request failed.
              detail = { ...listed, raw: { ...listed.raw, detailStatus: 'partial' } };
              rateLimited = error instanceof AparatRateLimitError;
            }
            if (!aparatNewsComplete(detail)) { incomplete = true; incompleteStages.add('SHORT_BODY'); }
            messages.set(detail.externalId, detail); shortsCount++;
          }
          await channel.reportProgress?.({ eventCode: 'APARAT_SHORTS_PAGE_FETCHED', stage: 'extraction', message: 'Aparat shorts page fetched', context: { page: page + 1, items: shortsCount } });
          if (rateLimited) break;
          if (!data.load_more && !data.load_more_link) break;
          if (shortsCount === countBefore) { incomplete = true; incompleteStages.add('SHORT_PAGINATION_STALLED'); break; }
          if (page === this.maxPages - 1 && shortsCount < this.maxShorts) { incomplete = true; incompleteStages.add('SHORT_PAGE_BUDGET'); }
          const count = Number(data.count);
          from += Number.isInteger(count) && count > 0 && count <= 1000 ? count : APARAT_CRAWLER_DEFINITION.pageSize;
        }
      }
    }
    if (this.abortController.signal.aborted) throw new Error('Aparat crawl stopped');
    if (rateLimited) await channel.reportProgress?.({ eventCode: 'APARAT_RATE_LIMITED', stage: 'extraction', level: 'warning',
      message: 'Aparat rate limit reached; collected data retained and remaining requests stopped',
      context: { retryAt: new Date(AparatCrawler.cooldownUntil).toISOString() } });
    if (!sourceLoaded && firstError) throw firstError;
    for (const reason of incompleteStages) await channel.reportProgress?.({ eventCode: `APARAT_PARTIAL_${reason}`, stage: 'extraction', level: 'warning', message: 'Aparat extraction incomplete' });
    return { profile, messages: [...messages.values()], extractionIncomplete: incomplete };
  }

  async fetchNewMessages(channel: CrawlerChannel) { return (await this.crawlChannel(channel)).messages; }
  async fetchMessageMetrics(message: CrawlerMessage) {
    const raw = message.raw ?? {};
    return { views: raw.viewsCount as number | null, reactions: raw.likesCount as number | null, comments: raw.commentsCount as number | null, shares: (raw.sharesCount as number | null) ?? null, raw };
  }
  async initialize() { await this.browserSession?.open(); }
  async close() { this.abortController.abort(); this.preparedUsername = null; await this.browserSession?.close(); }
}
