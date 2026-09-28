import { config } from "dotenv";

config({ path: ".env.local" });

const intervalMs = Number(process.env.CRAWL_WORKER_INTERVAL_MS ?? 5_000);
const delay = Number.isFinite(intervalMs) ? Math.max(intervalMs, 1_000) : 5_000;
let stopping = false;

process.once("SIGINT", () => { stopping = true; });
process.once("SIGTERM", () => { stopping = true; });

async function main() {
  const { runCrawlWorkerCycle } = await import("../lib/server/crawl-jobs");
  while (!stopping) {
    const result = await runCrawlWorkerCycle();
    if (result.processed > 0) console.log("crawl worker cycle", result);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

main().catch((error) => {
  console.error("crawl worker stopped", error);
  process.exitCode = 1;
});
