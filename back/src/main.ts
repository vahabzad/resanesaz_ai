import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { toNodeHandler } from "better-auth/node";
import { config } from "dotenv";

config({ path: ".env.local" });

const [{ auth }, { handleApiRequest }] = await Promise.all([
  import("@/src/server/auth"),
  import("@/src/router"),
]);
const { migrateLocalDatabase } = await import("@/src/server/database");
await migrateLocalDatabase();
const { enrollCompletedMediaRequests } = await import("@/src/server/media-requests");
await enrollCompletedMediaRequests();

const port = Number(process.env.API_PORT ?? 4_000);
const hostname = process.env.API_HOST ?? "127.0.0.1";
const authHandler = toNodeHandler(auth);

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 2 * 1024 * 1024) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(buffer);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function toWebRequest(request: IncomingMessage) {
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const host = request.headers.host ?? `${hostname}:${port}`;
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await readBody(request);
  return new Request(new URL(request.url ?? "/", `${protocol}://${host}`), {
    method: request.method,
    headers: new Headers(request.headers as Record<string, string>),
    body,
  });
}

async function writeResponse(response: Response, target: ServerResponse) {
  target.statusCode = response.status;
  const cookies = response.headers.getSetCookie();
  response.headers.forEach((value, key) => {
    if (key !== "set-cookie") target.setHeader(key, value);
  });
  if (cookies.length) target.setHeader("set-cookie", cookies);
  target.setHeader("x-content-type-options", "nosniff");
  target.end(Buffer.from(await response.arrayBuffer()));
}

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;
    if (pathname.startsWith("/api/auth/")) return void authHandler(request, response);
    await writeResponse(await handleApiRequest(await toWebRequest(request)), response);
  } catch (error) {
    console.error("http request failed", error instanceof Error ? error.message : "unknown");
    response.statusCode = error instanceof Error && error.message === "REQUEST_TOO_LARGE" ? 413 : 500;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ contractVersion: "1", error: { code: "INTERNAL_ERROR", message: "درخواست قابل پردازش نیست." } }));
  }
});

server.listen(port, hostname, async () => {
  console.info(`media api listening on http://${hostname}:${port}`);
  if (process.env.DATABASE_DRIVER === "pglite" && process.env.NODE_ENV !== "production") {
    const { recoverInterruptedLocalRuns } = await import("@/src/server/crawl-jobs");
    const recovered = await recoverInterruptedLocalRuns();
    if (recovered) console.info("local interrupted runs requeued", { recovered });
    const { startCrawlWorker } = await import("../worker/src/runtime");
    const worker = startCrawlWorker({
      onResult(result) { if (result.processed || result.recovered || result.scheduled) console.info("local crawl worker cycle", result); },
      onError() { console.error("local crawl worker cycle failed"); },
    });
    console.info("local crawl worker started (shared PGlite connection)");
    const { startEditorialWorker } = await import("../worker/src/editorial-runtime");
    const editorialWorker = startEditorialWorker();
    console.info("local editorial worker started (shared PGlite connection)");
    const { startPublicationWorker } = await import("../worker/src/publication-runtime");
    const publicationWorker = startPublicationWorker();
    console.info("local publication worker started (shared PGlite connection)");
    server.once("close", () => { worker.stop(); editorialWorker.stop(); publicationWorker.stop(); });
  }
});
