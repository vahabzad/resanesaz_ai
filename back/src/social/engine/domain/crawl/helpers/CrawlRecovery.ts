import { CrawlerOperationError, normalizeCrawlerError } from '../../operations/types/Operations.types';
import { PartialCrawlerExtractionError } from '../types/PartialCrawlerExtractionError';
import type { CrawlerChannelCrawlResult } from '../types/Crawler.types';

export function extractionError(error: unknown, stage: string, context: Record<string, unknown> = {}) {
  const normalized = normalizeCrawlerError(error, stage);
  return new CrawlerOperationError(normalized.message, normalized.code, stage, normalized.severity, { ...normalized.context, ...context });
}

export function partialExtraction(errors: unknown[], result: CrawlerChannelCrawlResult) {
  const normalized = errors.map(error => normalizeCrawlerError(error, 'extraction'));
  const first = normalized[0];
  return new PartialCrawlerExtractionError(new CrawlerOperationError(
    first.message, first.code, first.stage, first.severity,
    { ...first.context, errors: normalized.map(error => ({ code: error.code, stage: error.stage, message: error.message, ...error.context })) },
  ), result);
}

export async function attemptExtraction<T>(errors: unknown[], stage: string, task: () => Promise<T>, context: Record<string, unknown> = {}): Promise<T | undefined> {
  try { return await task(); }
  catch (error) { errors.push(extractionError(error, stage, context)); return undefined; }
}
