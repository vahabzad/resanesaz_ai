import { CrawlerOperationError, normalizeCrawlerError } from '../../operations/types/Operations.types';
import type { CrawlerChannelCrawlResult } from './Crawler.types';

/** Carries extracted data to persistence while retaining the extraction failure. */
export class PartialCrawlerExtractionError extends CrawlerOperationError {
  constructor(error: unknown, readonly result: CrawlerChannelCrawlResult) {
    const normalized = normalizeCrawlerError(error, 'extraction');
    super(normalized.message, normalized.code, normalized.stage, normalized.severity, {
      ...normalized.context, partialExtraction: true, collectedMessages: result.messages.length,
    });
    result.extractionIncomplete = true;
  }
}
