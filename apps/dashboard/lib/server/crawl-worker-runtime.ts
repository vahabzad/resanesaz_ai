import "server-only";

import { runCrawlWorkerCycle } from "@/lib/server/crawl-jobs";

declare global {
  var __mediaCommandCrawlWorkerTimer: NodeJS.Timeout | undefined;
  var __mediaCommandCrawlWorkerBusy: boolean | undefined;
}

async function tick() {
  if (globalThis.__mediaCommandCrawlWorkerBusy) return;
  globalThis.__mediaCommandCrawlWorkerBusy = true;
  try {
    await runCrawlWorkerCycle();
  } catch (error) {
    console.error("crawl worker cycle failed", { error });
  } finally {
    globalThis.__mediaCommandCrawlWorkerBusy = false;
  }
}

export function startInlineCrawlWorker() {
  if (globalThis.__mediaCommandCrawlWorkerTimer) return;
  void tick();
  const intervalMs = Number(process.env.CRAWL_WORKER_INTERVAL_MS ?? 5_000);
  const timer = setInterval(() => void tick(), Number.isFinite(intervalMs) ? Math.max(intervalMs, 1_000) : 5_000);
  timer.unref();
  globalThis.__mediaCommandCrawlWorkerTimer = timer;
}
