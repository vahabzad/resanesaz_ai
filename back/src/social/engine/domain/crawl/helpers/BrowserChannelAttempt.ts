import type { HTTPResponse, Page } from 'puppeteer-core';
import { log } from '../../../helper/showLog';
import { CrawlerOperationError } from '../../operations/types/Operations.types';
import type { CrawlerChannel, CrawlerChannelCrawlResult } from '../types/Crawler.types';
import { PartialCrawlerExtractionError } from '../types/PartialCrawlerExtractionError';
import { partialExtraction } from './CrawlRecovery';

export async function browserDeadline<T>(task: () => Promise<T>, timeoutMs: number, stage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve().then(task), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new CrawlerOperationError(
        `Browser operation timed out at ${stage} after ${timeoutMs}ms`, 'EXTRACTION_FAILED', stage, 'warning', { timeoutMs },
      )), timeoutMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

export class BrowserChannelAttempt {
  cancelled = false;
  stage = 'browser-open';
  page?: Page;
  result: CrawlerChannelCrawlResult = { messages: [] };
  readonly cleanups = new Set<() => void>();

  constructor(readonly platform: string, readonly channel: CrawlerChannel, readonly timeoutMs: number) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error(`Invalid ${platform} channel timeout`);
  }

  check(): void { if (this.cancelled) throw new Error(`${this.platform} channel attempt cancelled`); }

  progress(stage: string, event: string, fields: Record<string, unknown> = {}, warning = false): void {
    log(`${this.platform} channelId=${this.channel.id ?? ''} account=${JSON.stringify(this.channel.address)} stage=${stage} event=${event}` +
      Object.entries(fields).map(([key, value]) => ` ${key}=${JSON.stringify(value)}`).join(''), warning ? 'warning' : 'info');
  }

  async run<T>(stage: string, task: () => Promise<T>, fields: Record<string, unknown> = {}): Promise<T> {
    this.check(); this.stage = stage;
    const startedAt = Date.now();
    this.progress(stage, 'started', fields);
    try {
      const value = await task();
      this.check();
      this.progress(stage, 'finished', { ...fields, elapsedMs: Date.now() - startedAt });
      return value;
    } catch (error) {
      if (!this.cancelled) this.progress(stage, 'failed', { ...fields, error: (error as Error).message }, true);
      throw error;
    }
  }

  async execute(task: () => Promise<CrawlerChannelCrawlResult>, snapshot = () => this.result): Promise<CrawlerChannelCrawlResult> {
    this.progress('browser-open', 'started', { timeoutMs: this.timeoutMs });
    try { return await browserDeadline(task, this.timeoutMs, 'channel-deadline'); }
    catch (error) {
      const timedOut = error instanceof CrawlerOperationError && error.stage === 'channel-deadline';
      // Snapshot before cleanup; no late response or task may mutate the returned partial result.
      const recovered = snapshot();
      this.cancelled = true;
      for (const cleanup of this.cleanups) cleanup();
      if (this.page) {
        await browserDeadline(async () => { if (!this.page!.isClosed()) await this.page!.close({ runBeforeUnload: false }); }, 5_000, 'failed-page-close').catch(() => undefined);
      }
      if (!timedOut) {
        if (error instanceof PartialCrawlerExtractionError || (!recovered.profile && !recovered.messages.length)) throw error;
        throw partialExtraction([error], recovered);
      }
      this.progress(this.stage, 'timeout', { timeoutMs: this.timeoutMs }, true);
      throw partialExtraction([new CrawlerOperationError(
        `${this.platform} channel time budget exceeded at ${this.stage}; continuing to next channel`,
        'EXTRACTION_FAILED', this.stage, 'warning', { timeoutMs: this.timeoutMs, channelId: this.channel.id },
      )], { ...recovered, profile: recovered.profile ? { ...recovered.profile, raw: { ...recovered.profile.raw } } : recovered.profile, messages: recovered.messages.map(item => ({ ...item, raw: { ...item.raw } })) });
    } finally {
      this.cancelled = true;
      for (const cleanup of this.cleanups) cleanup();
      this.cleanups.clear();
    }
  }
}

export function captureBrowserJson(page: Page, options: {
  accepts(response: HTTPResponse): boolean;
  onPayload(payload: unknown): void;
  onError(error: unknown, url: string): void;
  isActive?(): boolean;
  timeoutMs?: number;
  maxResponses?: number;
}) {
  const pending = new Set<Promise<void>>();
  const timers = new Set<() => void>();
  let cancelled = false;
  let accepted = 0;
  const active = () => !cancelled && (options.isActive?.() ?? true);
  const listener = (response: HTTPResponse): void => {
    if (!active()) return;
    try {
      if (!options.accepts(response)) return;
      if (response.request().method() === 'OPTIONS') return;
      const status = response.status();
      if ([204, 205, 304].includes(status) || (status >= 300 && status < 400)) return;
      if (status >= 400) {
        options.onError(new Error(`API HTTP ${status}`), response.url());
        return;
      }
      if (accepted >= (options.maxResponses ?? Infinity)) return;
      if (pending.size >= 40) {
        options.onError(new Error('Response capture pending limit reached'), response.url());
        return;
      }
      accepted++;
      // Cancellation also settles outstanding jobs and clears timers immediately.
      let cancel!: () => void;
      const job = new Promise<void>(resolve => {
        let settled = false;
        const finish = (error?: unknown, payload?: unknown) => {
          if (settled) return;
          settled = true; clearTimeout(timer); timers.delete(cancel);
          try {
            if (active()) {
              if (error) options.onError(error, response.url());
              else if (payload !== undefined) options.onPayload(payload);
            }
          } finally { resolve(); }
        };
        cancel = () => { if (!settled) { settled = true; clearTimeout(timer); timers.delete(cancel); resolve(); } };
        const timer = setTimeout(() => finish(new CrawlerOperationError(
          'API response body timed out', 'EXTRACTION_FAILED', 'response-capture', 'warning', { timeoutMs: options.timeoutMs ?? 20_000 },
        )), options.timeoutMs ?? 20_000);
        timers.add(cancel);
        Promise.resolve().then(() => response.json()).then(payload => finish(undefined, payload), error => finish(error));
      }).finally(() => pending.delete(job));
      pending.add(job);
    } catch (error) { if (active()) options.onError(error, response.url()); }
  };
  page.on('response', listener);
  return {
    flush: async () => { await Promise.allSettled([...pending]); },
    stop: () => { page.off('response', listener); },
    cancel: () => { cancelled = true; page.off('response', listener); for (const cancel of [...timers]) cancel(); },
  };
}
