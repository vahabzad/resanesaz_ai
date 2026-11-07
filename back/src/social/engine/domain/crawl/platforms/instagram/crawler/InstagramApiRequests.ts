import type { Page } from 'puppeteer-core';
import { CrawlerOperationError } from '../../../../operations/types/Operations.types';

/** Also bounds CDP/body reads where a fetch AbortSignal cannot release the Node caller. */
export async function instagramDeadline<T>(task: () => Promise<T>, timeoutMs: number, stage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new CrawlerOperationError(
          `Instagram ${stage} timed out after ${timeoutMs}ms`, 'EXTRACTION_FAILED', stage, 'warning', { timeoutMs },
        )), timeoutMs);
      }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

export async function fetchInstagramReadApi(page: Page, apiPath: string, timeoutMs: number) {
  if (!/^\/api\/v1\/(?:media\/[^/]+\/info\/|feed\/reels_media\/\?reel_ids=[^&]+)$/.test(apiPath)) {
    throw new Error('Invalid Instagram read API path');
  }
  return await instagramDeadline(() => page.evaluate(`(async () => {
    if (!['https://www.instagram.com', 'https://instagram.com'].includes(location.origin)) throw new Error('Invalid Instagram page origin');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ${timeoutMs});
    try {
      const response = await fetch(${JSON.stringify(apiPath)}, {
        method: 'GET', credentials: 'include', signal: controller.signal,
        headers: { 'x-ig-app-id': '936619743392459', 'x-requested-with': 'XMLHttpRequest' }
      });
      if (!response.ok) return { status: response.status, payload: null };
      return { status: response.status, payload: await response.json() };
    } finally { clearTimeout(timer); }
  })()`) as Promise<{ status: number; payload: unknown }>, timeoutMs + 5_000, 'page-api');
}
