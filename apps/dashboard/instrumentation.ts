export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.CRAWL_WORKER_MODE === "inline") {
    await import("./instrumentation-node");
  }
}
