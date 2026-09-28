import { XMLParser } from "fast-xml-parser";

export type RssAdapterItem = {
  externalId: string | null;
  canonicalUrl: string;
  title: string;
  summary: string | null;
  publishedAt: Date | null;
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: true });

type FeedItem = Record<string, unknown>;
type ParsedFeed = {
  rss?: { channel?: { item?: FeedItem | FeedItem[] } };
  feed?: { entry?: FeedItem | FeedItem[] };
};

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) return text((value as { "#text": unknown })["#text"]);
  return "";
}

function clean(value: unknown, maxLength: number) {
  const normalized = text(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return normalized.slice(0, maxLength);
}

function link(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const alternate = value.find((item) => item?.["@_rel"] === "alternate") ?? value[0];
    return link(alternate);
  }
  if (value && typeof value === "object") return text((value as Record<string, unknown>)["@_href"] ?? (value as Record<string, unknown>)["#text"]);
  return "";
}

function date(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseRssFeed(xml: string): RssAdapterItem[] {
  const document = parser.parse(xml) as ParsedFeed;
  const rssItems = asArray(document.rss?.channel?.item);
  const atomItems = asArray(document.feed?.entry);
  const candidates = rssItems.length ? rssItems : atomItems;

  return candidates.slice(0, 50).flatMap((item): RssAdapterItem[] => {
    const title = clean(item.title, 500);
    const canonicalUrl = link(item.link).trim();
    if (!title || !canonicalUrl) return [];

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(canonicalUrl);
    } catch {
      return [];
    }
    if (!/^https?:$/.test(parsedUrl.protocol)) return [];

    return [{
      externalId: clean(item.guid ?? item.id, 500) || null,
      canonicalUrl: parsedUrl.toString(),
      title,
      summary: clean(item.description ?? item.summary ?? item.content, 5_000) || null,
      publishedAt: date(item.pubDate ?? item.published ?? item.updated),
    }];
  });
}
