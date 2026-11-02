import { runCrawlWorkerCycle } from "../../src/server/crawl-jobs";

export function startCrawlWorker(options: {
  intervalMs?: number;
  runCycle?: typeof runCrawlWorkerCycle;
  onError?: (error: unknown) => void;
  onResult?: (result: Awaited<ReturnType<typeof runCrawlWorkerCycle>>) => void;
} = {}) {
  const value = options.intervalMs ?? Number(process.env.CRAWL_WORKER_INTERVAL_MS ?? 5_000);
  const intervalMs = Number.isFinite(value) && value >= 1_000 ? value : 5_000;
  const runCycle = options.runCycle ?? runCrawlWorkerCycle;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function cycle() {
    try {
      const result = await runCycle();
      if (!stopped) options.onResult?.(result);
    } catch (error) {
      if (!stopped) options.onError?.(error);
    } finally {
      // Schedule only after completion: slow crawls must never overlap cycles.
      if (!stopped) timer = setTimeout(() => void cycle(), intervalMs);
    }
  }
  void cycle();
  return { stop() { stopped = true; if (timer) clearTimeout(timer); } };
}
