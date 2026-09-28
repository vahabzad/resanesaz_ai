import "server-only";

import { z } from "zod";
import { CrawlerGeneratorError, crawlerGeneratorSiteId } from "@/lib/crawler-generator-contract";

export { CrawlerGeneratorError, crawlerGeneratorSiteId } from "@/lib/crawler-generator-contract";

const articleSchema = z.object({
  url: z.url().max(2_048),
  title: z.string().min(1).max(1_000),
  publishedAt: z.string().max(100).nullable(),
  summary: z.string().max(20_000).nullable(),
  content: z.string().max(2_000_000).nullable(),
  contentHtml: z.string().max(2_000_000).nullable(),
  imageUrl: z.string().max(2_048).nullable(),
  categories: z.array(z.string().max(300)).max(100),
  tags: z.array(z.string().max(300)).max(200),
  author: z.string().max(500).nullable(),
});

const siteSchema = z.object({
  id: z.string(),
  version: z.string(),
  listingMode: z.string(),
  articleMode: z.string(),
});

const collectionSchema = z.object({
  outputFile: z.string().nullable(),
  status: z.string(),
  discovered: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  articles: z.array(z.object({ index: z.number().int().nonnegative() })).max(500),
});

type CrawlerGeneratorArticle = z.infer<typeof articleSchema>;

function serviceUrl() {
  const configured = process.env.CRAWLER_GENERATOR_URL ?? "http://127.0.0.1:8787";
  const url = new URL(configured);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.pathname !== "/") {
    throw new CrawlerGeneratorError("CRAWLER_SERVICE_CONFIG", "CrawlerGenerator URL is invalid.");
  }
  return url;
}

function endpoint(path: string) {
  return new URL(path.replace(/^\//, ""), serviceUrl()).toString();
}

async function boundedText(response: Response, limit = 8_000_000) {
  const body = await response.text();
  if (body.length > limit) throw new CrawlerGeneratorError("CRAWLER_RESPONSE_TOO_LARGE", "CrawlerGenerator response exceeded its limit.");
  return body;
}

async function serviceFetch(url: string, init: RequestInit) {
  try { return await fetch(url, init); }
  catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new CrawlerGeneratorError("CRAWLER_SERVICE_TIMEOUT", "CrawlerGenerator timed out.");
    }
    throw new CrawlerGeneratorError("CRAWLER_SERVICE_UNAVAILABLE", "CrawlerGenerator is unavailable.");
  }
}

async function jsonRequest(path: string) {
  const response = await serviceFetch(endpoint(path), { signal: AbortSignal.timeout(30_000), cache: "no-store" });
  const body = await boundedText(response);
  if (!response.ok) throw new CrawlerGeneratorError(response.status === 404 ? "CRAWLER_NOT_FOUND" : "CRAWLER_SERVICE_FAILED", `CrawlerGenerator returned ${response.status}.`);
  try { return JSON.parse(body) as unknown; }
  catch { throw new CrawlerGeneratorError("CRAWLER_INVALID_RESPONSE", "CrawlerGenerator returned invalid JSON."); }
}

type ProgressHandler = (event: Record<string, unknown>) => Promise<void> | void;

async function action(path: string, expectedType: string, body?: unknown, timeoutMs = 60 * 60_000, externalSignal?: AbortSignal, onProgress?: ProgressHandler): Promise<Record<string, unknown>> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const response = await serviceFetch(endpoint(path), {
    method: "POST",
    headers: { accept: "application/x-ndjson", ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: externalSignal ? AbortSignal.any([timeoutSignal, externalSignal]) : timeoutSignal,
  });
  if (!response.body) throw new CrawlerGeneratorError("CRAWLER_INVALID_RESPONSE", "CrawlerGenerator returned no stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedBytes = 0;
  const final: { value: Record<string, unknown> | null } = { value: null };
  const consume = async (line: string) => {
    if (!line.trim()) return;
    let event: Record<string, unknown>;
    try { event = JSON.parse(line) as Record<string, unknown>; }
    catch { throw new CrawlerGeneratorError("CRAWLER_INVALID_RESPONSE", "CrawlerGenerator returned invalid NDJSON."); }
    const progress = event.type === "log" && event.entry && typeof event.entry === "object"
      ? event.entry as Record<string, unknown>
      : event;
    await onProgress?.(progress);
    if (event.type === "failure") throw new CrawlerGeneratorError("CRAWLER_REMOTE_FAILED", String(event.message ?? "CrawlerGenerator failed."));
    if (event.type === expectedType) final.value = event;
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > 8_000_000) throw new CrawlerGeneratorError("CRAWLER_RESPONSE_TOO_LARGE", "CrawlerGenerator response exceeded its limit.");
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) await consume(line);
  }
  buffer += decoder.decode();
  await consume(buffer);
  if (!response.ok) throw new CrawlerGeneratorError("CRAWLER_SERVICE_FAILED", `CrawlerGenerator returned ${response.status}.`);
  if (!final.value) throw new CrawlerGeneratorError("CRAWLER_INVALID_RESPONSE", `CrawlerGenerator did not return ${expectedType}.`);
  return final.value;
}

async function getSite(siteId: string) {
  try { return siteSchema.parse(await jsonRequest(`/api/sites/${encodeURIComponent(siteId)}`)); }
  catch (error) {
    if (error instanceof CrawlerGeneratorError && error.code === "CRAWLER_NOT_FOUND") return null;
    throw error;
  }
}

export async function ensureGeneratedCrawler(listingUrl: string, siteId = crawlerGeneratorSiteId(listingUrl), signal?: AbortSignal, onProgress?: ProgressHandler) {
  const existing = await getSite(siteId);
  if (existing) return existing;
  await action("/api/generate", "result", { listingUrl }, 60 * 60_000, signal, onProgress);
  const generated = await getSite(siteId);
  if (!generated) throw new CrawlerGeneratorError("CRAWLER_GENERATION_FAILED", "Generated crawler was not published.");
  return generated;
}

export async function runGeneratedCrawler(listingUrl: string, siteId = crawlerGeneratorSiteId(listingUrl), selfHeal = true, signal?: AbortSignal, onProgress?: ProgressHandler) {
  const site = await ensureGeneratedCrawler(listingUrl, siteId, signal, onProgress);
  const result = await action(`/api/sites/${encodeURIComponent(siteId)}/run`, "run_result", { selfHeal }, 60 * 60_000, signal, onProgress);
  const collection = collectionSchema.parse(await jsonRequest(`/api/sites/${encodeURIComponent(siteId)}/articles`));
  if (!collection.outputFile) throw new CrawlerGeneratorError("CRAWLER_EMPTY_OUTPUT", "CrawlerGenerator returned no article output.");
  const articles: CrawlerGeneratorArticle[] = [];
  for (const preview of collection.articles) {
    articles.push(articleSchema.parse(await jsonRequest(
      `/api/sites/${encodeURIComponent(siteId)}/articles/${encodeURIComponent(collection.outputFile)}/${preview.index}`,
    )));
  }

  return {
    site,
    outputFile: collection.outputFile,
    discovered: Number(result.discovered ?? collection.discovered),
    failed: Number(result.failed ?? collection.failed),
    status: String(result.status ?? collection.status),
    articles,
  };
}
