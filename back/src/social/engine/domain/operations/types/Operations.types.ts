export const OPERATION_ERROR_CODES = [
  'AUTH_REQUIRED',
  'NAVIGATION_FAILED',
  'SELECTOR_MISSING',
  'EXTRACTION_FAILED',
  'PERSISTENCE_FAILED',
  'LOCK_LOST',
  'PROCESS_OFFLINE',
  'UNEXPECTED_ERROR',
] as const;

export type OperationErrorCode = typeof OPERATION_ERROR_CODES[number];
export type OperationSeverity = 'info' | 'warning' | 'error' | 'critical';
export type CrawlerMode = 'main' | 'fast';
export type CrawlerRunStatus = 'running' | 'success' | 'partial_failed' | 'failed' | 'skipped' | 'interrupted';

export class CrawlerOperationError extends Error {
  constructor(
    message: string,
    readonly code: OperationErrorCode = 'UNEXPECTED_ERROR',
    readonly stage = 'crawl',
    readonly severity: OperationSeverity = 'error',
    readonly context: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'CrawlerOperationError';
  }
}

export const normalizeCrawlerError = (error: unknown, fallbackStage = 'crawl'): CrawlerOperationError => {
  if (error instanceof CrawlerOperationError) return error;
  const candidate = error as { statusCode?: number; messageCode?: string; message?: string };
  if (candidate?.statusCode === 401 || candidate?.messageCode === 'AUTH_REQUIRED') {
    return new CrawlerOperationError(candidate.message ?? 'Crawler session is not authenticated', 'AUTH_REQUIRED', 'authentication', 'critical');
  }
  if (candidate?.messageCode && OPERATION_ERROR_CODES.includes(candidate.messageCode as OperationErrorCode)) {
    return new CrawlerOperationError(
      candidate.message ?? String(error),
      candidate.messageCode as OperationErrorCode,
      fallbackStage,
      candidate.messageCode === 'LOCK_LOST' ? 'warning' : 'error',
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  if (
    /net::ERR_|navigation timeout|failed to navigate|cannot navigate|page\.goto/i.test(message)
  ) {
    return new CrawlerOperationError(
      message,
      'NAVIGATION_FAILED',
      'navigation',
      'error',
      { originalStage: fallbackStage },
    );
  }
  return new CrawlerOperationError(
    message,
    'UNEXPECTED_ERROR',
    fallbackStage,
    'error',
  );
};
