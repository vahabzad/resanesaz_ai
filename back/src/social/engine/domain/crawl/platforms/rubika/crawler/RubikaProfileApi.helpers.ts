import type { ConsoleMessage, Page } from 'puppeteer-core';
import { browserDeadline } from '../../../helpers/BrowserChannelAttempt';
import { log } from '../../../../../helper/showLog';
import { extractRubikaProfile } from './RubikaProfile.helpers';

type CapturedProfile = { channelGuid: string; membersCount: number; title: string | null };

/** Passive capture of the app's already-decrypted getChannelInfo response.
 * The deployed bundle emits console.log('inout', method, request, input, response).
 * Only argument 4 is projected inside the page. No request/auth is deserialized.
 * Attach BEFORE navigation. This collector never issues an API request.
 */
export class RubikaProfileResponseCapture {
  private readonly profiles = new Map<string, CapturedProfile>();
  private readonly waiters = new Set<{ guid: string; finish: (value: CapturedProfile | null) => void }>();
  private pending = 0;
  private stopped = false;

  constructor(private readonly page: Page) {
    page.on('console', this.onConsole);
    page.once('close', this.stop);
  }

  private readonly onConsole = (message: ConsoleMessage) => {
    const args = message.args();
    if (this.stopped || this.pending >= 8 || args.length < 5
      || args[0].remoteObject().value !== 'inout'
      || args[1].remoteObject().value !== 'getChannelInfo') return;
    this.pending++;
    void browserDeadline(() => args[4].evaluate((response: unknown) => {
      const channel = (response as { channel?: Record<string, unknown> } | null)?.channel;
      if (!channel) return null;
      const guid = channel.channel_guid ?? channel.object_guid;
      const raw = channel.count_members;
      const count = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
      if (typeof guid !== 'string' || !/^c[A-Za-z0-9]+$/.test(guid) || !Number.isSafeInteger(count) || count < 0) return null;
      return { channelGuid: guid, membersCount: count, title: typeof channel.title === 'string' ? channel.title : null };
    }), 3_000, 'rubika-profile-response').then(profile => {
      if (!profile || this.stopped) return;
      this.profiles.delete(profile.channelGuid);
      this.profiles.set(profile.channelGuid, profile);
      if (this.profiles.size > 32) this.profiles.delete(this.profiles.keys().next().value!);
      for (const waiter of this.waiters) if (waiter.guid === profile.channelGuid) waiter.finish(profile);
    }).catch(() => { /* A context failure falls back to DOM, never stalls the crawl. */ })
      .finally(() => {
        this.pending--;
        for (const handle of args) void handle.dispose().catch(() => {});
      });
  };

  waitFor(guid: string, timeoutMs: number): Promise<CapturedProfile | null> {
    const profile = this.profiles.get(guid);
    if (profile) return Promise.resolve(profile);
    if (this.stopped) return Promise.resolve(null);
    return new Promise(resolve => {
      const waiter = { guid, finish: (value: CapturedProfile | null) => {
        clearTimeout(timer); this.waiters.delete(waiter); resolve(value);
      } };
      const timer = setTimeout(() => waiter.finish(null), timeoutMs);
      this.waiters.add(waiter);
    });
  }

  readonly stop = () => {
    if (this.stopped) return;
    this.stopped = true;
    this.page.off('console', this.onConsole);
    this.page.off('close', this.stop);
    this.profiles.clear();
    for (const waiter of this.waiters) waiter.finish(null);
  };
}

export async function extractRubikaProfileApiFirst(
  page: Page, channelId: string, expectedUrl: string,
  capture?: RubikaProfileResponseCapture, waitMs = 1_500,
) {
  const context = `rubika channelId=${channelId} stage=profile-members`;
  const guid = new URL(expectedUrl).hash.match(/^#c=(c[A-Za-z0-9]+)$/)?.[1];
  log(`${context} event=read source=api:getChannelInfo mode=passive`, 'info');
  const profile = guid && capture ? await capture.waitFor(guid, waitMs) : null;
  if (profile && page.url() === expectedUrl) {
    log(`${context} event=captured source=api:getChannelInfo count=${profile.membersCount}`, 'success');
    return { ...profile, membersSource: 'api:getChannelInfo', membersText: null,
      resolvedChannelUrl: expectedUrl, metricsAvailable: true };
  }
  log(`${context} event=fallback source=dom reason=response-not-captured`, 'warning');
  return extractRubikaProfile(page, channelId, expectedUrl);
}
