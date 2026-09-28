export class CrawlerGeneratorError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CrawlerGeneratorError";
  }
}

export function crawlerGeneratorSiteId(value: string) {
  const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  return hostname.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "news-site";
}

export function finalNdjsonEvent(body: string, expectedType: string) {
  let final: Record<string, unknown> | null = null;
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event: Record<string, unknown>;
    try { event = JSON.parse(line) as Record<string, unknown>; }
    catch { throw new CrawlerGeneratorError("CRAWLER_INVALID_RESPONSE", "CrawlerGenerator returned invalid NDJSON."); }
    if (event.type === "failure") throw new CrawlerGeneratorError("CRAWLER_REMOTE_FAILED", String(event.message ?? "CrawlerGenerator failed."));
    if (event.type === expectedType) final = event;
  }
  if (!final) throw new CrawlerGeneratorError("CRAWLER_INVALID_RESPONSE", `CrawlerGenerator did not return ${expectedType}.`);
  return final;
}
