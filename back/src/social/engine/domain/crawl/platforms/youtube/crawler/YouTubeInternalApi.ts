import { browserDeadline } from '../../../helpers/BrowserChannelAttempt';
import type { Page } from 'puppeteer-core';
import { CrawlerOperationError } from '../../../../operations/types/Operations.types';
import { at, object } from './YouTubePageParser';

export interface YouTubeInternalApiReply {
  status: number;
  elapsedMs: number;
  payload: unknown;
}

export async function requestYouTubeInternalApi(
  page: Page,
  endpoint: 'browse' | 'player' | 'next',
  input: Record<string, unknown>,
): Promise<YouTubeInternalApiReply> {
  // Context and credentials stay in the browser and are never included in logs/results.
  const reply = await browserDeadline(() => page.evaluate(`(async () => {
    if (location.origin !== 'https://www.youtube.com') throw new Error('YouTube session is not on youtube.com');
    const cfg = window.ytcfg;
    const context = structuredClone(cfg?.get('INNERTUBE_CONTEXT'));
    if (!context?.client?.clientVersion) throw new Error('YouTube client context is missing');
    const headers = { 'Content-Type': 'application/json',
      'X-Youtube-Client-Name': String(cfg.get('INNERTUBE_CONTEXT_CLIENT_NAME') || 1),
      'X-Youtube-Client-Version': context.client.clientVersion };
    if (context.client.visitorData) headers['X-Goog-Visitor-Id'] = context.client.visitorData;
    const started = performance.now();
    const response = await fetch('/youtubei/v1/' + ${JSON.stringify(endpoint)} + '?prettyPrint=false', {
      method: 'POST', credentials: 'same-origin', headers,
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({context, ...${JSON.stringify(input)}})
    });
    return {status: response.status, elapsedMs: Math.round(performance.now() - started), payload: await response.json()};
  })()`) as Promise<YouTubeInternalApiReply>, 35_000, 'api-' + endpoint);
  if (reply.status < 200 || reply.status >= 300 || object(reply.payload).error) {
    throw new CrawlerOperationError('YouTube internal API ' + endpoint + ' failed (HTTP ' + reply.status + ')',
      'EXTRACTION_FAILED', 'video-details-api', 'error', { endpoint, httpStatus: reply.status,
        apiCode: at(reply.payload, 'error', 'code') });
  }
  return reply;
}
