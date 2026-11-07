import type { SocialPlatform } from "@media/contracts/social-platforms";
import type { CrawledArticle } from "../server/web-crawler";
import type { BuildReport } from "../server/crawler-builder";
import { withBrowserRuntime } from "./browser-runtime";
import { normalizeSocialSource, SocialCrawlerError } from "./platforms";
import type { CrawlerChannel, CrawlerChannelCrawlResult, CrawlerMessage } from "./engine/domain/crawl/types/Crawler.types";
import { PartialCrawlerExtractionError } from "./engine/domain/crawl/types/PartialCrawlerExtractionError";

type Crawler = { crawlChannel(channel: CrawlerChannel): Promise<CrawlerChannelCrawlResult>; close(): Promise<void> };
export type SocialResult = { articles: Array<CrawledArticle & { externalId: string }>; discovered: number; failed: number };
type Progress = (event: Record<string, unknown>) => Promise<void> | void;
export async function createSocialCrawler(platform: SocialPlatform): Promise<Crawler> {
  switch (platform) {
    case "aparat": return new (await import("./engine/domain/crawl/platforms/aparat/crawler/AparatCrawler")).default({ maxVideos: 40, maxShorts: 20, maxPages: 3 });
    case "bale": return new (await import("./engine/domain/crawl/platforms/bale/crawler/BaleWebCrawler")).default();
    case "eitaa": return new (await import("./engine/domain/crawl/platforms/eitaa/crawler/EitaaCrawler")).default();
    case "facebook": return new (await import("./engine/domain/crawl/platforms/facebook/crawler/FacebookWebCrawler")).default();
    case "instagram": return new (await import("./engine/domain/crawl/platforms/instagram/crawler/InstagramWebCrawler")).default({ includeStories: false });
    case "rubika": return new (await import("./engine/domain/crawl/platforms/rubika/crawler/RubikaWebCrawler")).default();
    case "rubino": return new (await import("./engine/domain/crawl/platforms/rubino/crawler/RubinoWebCrawler")).default();
    case "shad": return new (await import("./engine/domain/crawl/platforms/shad/crawler/ShadWebCrawler")).default();
    case "soroush": return new (await import("./engine/domain/crawl/platforms/soroush/crawler/SoroushCrawler")).default();
    case "telegram": return new (await import("./engine/domain/crawl/platforms/telegram/crawler/TelegramWebCrawler")).default("telegram", { maxScrolls: 20 });
    case "tiktok": return new (await import("./engine/domain/crawl/platforms/tiktok/crawler/TikTokWebCrawler")).default();
    case "x": return new (await import("./engine/domain/crawl/platforms/x/crawler/XWebCrawler")).default({ timelineScrollCount: 5 });
    case "youtube": return new (await import("./engine/domain/crawl/platforms/youtube/crawler/YouTubeWebCrawler")).default();
  }
}
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function publicAsset(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.port ? url.href : null; } catch { return null; }
}
function text(value: unknown, max: number): string | null {
  return typeof value === "string" ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max) || null : null;
}
export function socialMessageArticle(platform: SocialPlatform, sourceUrl: string, message: CrawlerMessage): (CrawledArticle & { externalId: string }) | null {
  if (message.platformKey !== platform || typeof message.externalId !== "string" || !/^[A-Za-z0-9_:.\-]{1,200}$/.test(message.externalId)) return null;
  const raw = record(message.raw);
  const main = text(message.text, 100_000) ?? text(raw.caption, 100_000) ?? text(raw.title, 100_000);
  const description = text(raw.description, 100_000);
  const content = description && main && description !== main ? `${main}\n\n${description}`.slice(0, 100_000) : main ?? description;
  if (!content) return null; // A media-only item cannot become invented news text.
  let url = sourceUrl;
  const candidate = publicAsset(raw.permalink) ?? publicAsset(raw.url);
  if (candidate) {
    const target = new URL(candidate), source = new URL(sourceUrl);
    if (target.hostname === source.hostname || (platform === "aparat" && ["www.aparat.com", "shorts.aparat.com"].includes(target.hostname))) {
      const safeQuery = new URLSearchParams();
      for (const key of platform === "youtube" ? ["v"] : platform === "facebook" ? ["story_fbid", "id"] : []) {
        const value = target.searchParams.get(key); if (value && /^[A-Za-z0-9_-]{1,120}$/.test(value)) safeQuery.set(key, value);
      }
      target.search = safeQuery.toString(); target.hash = ""; url = target.href;
    }
  } else if ((platform === "telegram" || platform === "eitaa") && /^\d+$/.test(message.externalId)) url = `${sourceUrl.replace(/\/$/, "")}/${message.externalId}`;
  const date = message.publishedAt instanceof Date ? message.publishedAt.getTime() : typeof message.publishedAt === "string" ? Date.parse(message.publishedAt) : NaN;
  const images = Array.isArray(raw.mediaUrls) ? raw.mediaUrls : [];
  return {
    externalId: message.externalId, url, title: text(raw.title, 300) ?? content.split(/\r?\n/)[0].slice(0, 200),
    content, summary: content.slice(0, 500), contentHtml: null,
    imageUrl: publicAsset(raw.thumbnailUrl) ?? publicAsset(raw.imageUrl) ?? publicAsset(raw.coverUrl) ?? (String(raw.mediaType).match(/photo|image/i) ? publicAsset(images[0]) : null),
    publishedAt: Number.isFinite(date) ? new Date(date).toISOString() : null,
    categories: [], tags: [], author: null,
  };
}
export async function runSocialCrawler(platform: SocialPlatform, input: string, signal: AbortSignal, progress?: Progress, factory = createSocialCrawler): Promise<SocialResult> {
  const sourceUrl = normalizeSocialSource(platform, input);
  const deadline = AbortSignal.timeout(5 * 60_000);
  const combined = AbortSignal.any([signal, deadline]);
  return withBrowserRuntime(platform, combined, async () => {
    const crawler = await factory(platform);
    const channel: CrawlerChannel = {
      platformKey: platform,
      address: platform === "rubika" ? `@${new URL(sourceUrl).pathname.slice(1)}` : ["rubino", "bale", "telegram"].includes(platform) ? new URL(sourceUrl).pathname.slice(1) : sourceUrl,
      retryBoundary: { sinceDate: new Date(Date.now() - 24 * 3600_000).toISOString() },
      reportProgress: async event => {
        // Never persist the reference's free-text diagnostics, context or network data.
        if (/^[A-Z0-9_]{1,80}$/.test(event.eventCode)) await progress?.({ stage: "social-browser", status: "progress", message: `مرحلهٔ دریافت مرورگری: ${event.eventCode}` });
      },
    };
    await progress?.({ stage: "social-browser", status: "started", message: "دریافت با کراولر ثابت پلتفرم و نشست مرورگر آغاز شد." });
    let result: CrawlerChannelCrawlResult, incomplete = false;
    let abortHandler: (() => void) | undefined;
    try {
      result = await Promise.race([
        crawler.crawlChannel(channel).catch(error => {
          if (error instanceof PartialCrawlerExtractionError) { incomplete = true; return error.result; }
          throw error;
        }),
        new Promise<never>((_resolve, reject) => { abortHandler = () => reject(new SocialCrawlerError(signal.aborted ? "USER_CANCELLED" : "SOCIAL_CRAWL_TIMEOUT")); combined.addEventListener("abort", abortHandler, { once: true }); if (combined.aborted) abortHandler(); }),
      ]);
      combined.throwIfAborted();
      if (!result.messages.length && !result.profile) throw new SocialCrawlerError("SOCIAL_EMPTY_RESULT");
      const messages = result.messages.slice(0, 500);
      const articles = [...new Map(messages.flatMap(message => { const article = socialMessageArticle(platform, sourceUrl, message); return article ? [[article.externalId, article] as const] : []; })).values()];
      return { articles, discovered: messages.length, failed: (incomplete || result.extractionIncomplete ? 1 : 0) + messages.filter(message => !socialMessageArticle(platform, sourceUrl, message)).length };
    } finally {
      if (abortHandler) combined.removeEventListener("abort", abortHandler);
      await Promise.race([crawler.close().catch(() => {}), new Promise(resolve => { const timer = setTimeout(resolve, 3000); timer.unref(); })]);
    }
  });
}
export async function validateSocialCrawler(platform: SocialPlatform, url: string, signal: AbortSignal, progress?: Progress) {
  const result = await runSocialCrawler(platform, url, signal, progress);
  const report: BuildReport = {
    passed: result.articles.length > 0 && result.failed === 0, checkedAt: new Date().toISOString(), discovered: result.discovered, attempts: 1,
    samples: result.articles.slice(0, 10).map(article => ({ url: article.url, title: article.title, contentLength: article.content?.length ?? 0, passed: true, errorCode: null })),
  };
  return { config: { platform, runtime: "browser", adapterVersion: 1, contractVersion: "2", validation: report }, report };
}
