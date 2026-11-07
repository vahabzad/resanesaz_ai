import { asRecord } from '../../../helpers/dataHelpers';

export class AparatRateLimitError extends Error {
  readonly messageCode = 'APARAT_RATE_LIMITED';
  constructor(readonly retryAt: number) {
    super(`Aparat request limit reached; retry after ${new Date(retryAt).toISOString()}`);
    this.name = 'AparatRateLimitError';
  }
}

/** Retry-After has priority over the vendor's Unix reset timestamp. */
export function aparatRetryDelay(headers: unknown, now = Date.now()): number {
  const values = asRecord(headers);
  const retryAfter = values['retry-after'];
  if (retryAfter != null) {
    const text = String(retryAfter).trim();
    const delay = /^\d+(?:\.\d+)?$/.test(text) ? Number(text) * 1000 : Date.parse(text) - now;
    if (Number.isFinite(delay)) return Math.max(1000, delay);
  }
  const reset = Number(values['x-rr-ratelimit-reset']);
  if (Number.isFinite(reset) && reset * 1000 > now) return reset * 1000 - now;
  return 60_000;
}
