import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const backendRoot = fileURLToPath(new URL("../../", import.meta.url));
process.chdir(backendRoot);
config({ path: resolve(backendRoot, ".env.local") });

if (process.env.DATABASE_DRIVER === "pglite") {
  console.error("PGlite local worker runs automatically with the Backend API. Use npm run dev in back. A standalone worker requires PostgreSQL.");
  process.exitCode = 1;
} else {
  const { startCrawlWorker } = await import("./runtime.ts");
  const worker = startCrawlWorker({
    onResult(result) { if (result.processed || result.recovered || result.scheduled) console.info("crawl worker cycle", result); },
    onError() { console.error("crawl worker cycle failed"); },
  });
  const { startEditorialWorker } = await import("./editorial-runtime.ts");
  const editorialWorker = startEditorialWorker();
  const { startPublicationWorker } = await import("./publication-runtime.ts");
  const publicationWorker = startPublicationWorker();
  process.once("SIGTERM", () => { worker.stop(); editorialWorker.stop(); publicationWorker.stop(); process.exit(0); });
  process.once("SIGINT", () => { worker.stop(); editorialWorker.stop(); publicationWorker.stop(); process.exit(0); });
}
