import type { CrawlerChannelCrawlResult, CrawlerMessage } from '../../../types/Crawler.types';

type JsonObject = Record<string, unknown>;
export type YouTubeTab = 'videos' | 'shorts';
export interface YouTubePageSnapshot {
  initial?: unknown;
  player?: unknown;
  videoId?: string | null;
  title?: string | null;
  description?: string | null;
  thumbnailUrl?: string | null;
  publishedAt?: string | null;
  duration?: string | null;
  interactions?: Record<string, string | null>;
  commentHeader?: unknown;
  commentsText?: string | null;
  buttonLabels?: string[];
  bodyText?: string;
}
export const object = (value: unknown): JsonObject =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
export function at(value: unknown, ...keys: string[]): unknown {
  return keys.reduce<unknown>((current, key) => object(current)[key], value);
}
export function text(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  const item = object(value);
  if (typeof item.simpleText === 'string') return item.simpleText.trim() || null;
  if (typeof item.content === 'string') return item.content.trim() || null;
  if (Array.isArray(item.runs)) return item.runs.map((run) => text(object(run).text) ?? '').join('').trim() || null;
  return null;
}
export function findAll(root: unknown, key: string): JsonObject[] {
  const found: JsonObject[] = [];
  const stack = [root];
  let visited = 0;
  while (stack.length && visited++ < 100000) {
    const current = stack.pop();
    if (Array.isArray(current)) { stack.push(...current.slice().reverse()); continue; }
    if (!current || typeof current !== 'object') continue;
    const record = object(current);
    if (record[key] && typeof record[key] === 'object') found.push(object(record[key]));
    stack.push(...Object.values(record).reverse());
  }
  return found;
}
export function parseYouTubeCount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : null;
  const source = text(value);
  if (!source) return null;
  if (/^\s*-/.test(source)) return null;
  const normalized = source
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[,،٬\u00a0]/g, '').replace(/٫/g, '.');
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(billion|million|thousand|میلیارد|میلیون|هزار|[KMB](?=\s|$))?/i);
  if (!match) return null;
  const multiplier = /^(b|billion|میلیارد)$/i.test(match[2] ?? '') ? 1e9
    : /^(m|million|میلیون)$/i.test(match[2] ?? '') ? 1e6
    : /^(k|thousand|هزار)$/i.test(match[2] ?? '') ? 1e3 : 1;
  const number = Math.round(Number(match[1]) * multiplier);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}
function exactCount(value: unknown): number | null {
  const source = text(value);
  if (source && /\d\s*[KMB]\b|thousand|million|billion|هزار|میلیون|میلیارد/i.test(source)) return null;
  return parseYouTubeCount(value);
}
function imageUrl(root: unknown): string | null {
  const item = object(root);
  const images = Array.isArray(item.thumbnails) ? item.thumbnails : Array.isArray(item.sources) ? item.sources : [];
  return text(object(images[images.length - 1]).url);
}
function metadataParts(root: unknown): string[] {
  return findAll(root, 'contentMetadataViewModel').flatMap((item) => {
    const rows = Array.isArray(item.metadataRows) ? item.metadataRows : [];
    return rows.flatMap((row) => {
      const parts = object(row).metadataParts;
      return Array.isArray(parts) ? parts.map((part) => text(object(part).text)).filter((v): v is string => v !== null) : [];
    });
  });
}
export function normalizeYouTubeChannelUrl(address: string): string {
  let value = address.trim();
  if (value.startsWith('@')) value = 'https://www.youtube.com/' + value;
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('نشانی باید شناسه @ یا لینک عمومی کانال یوتیوب باشد.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port ||
      !['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname.toLowerCase())) {
    throw new Error('دامنه نشانی کانال باید youtube.com باشد.');
  }
  const parts = url.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
  let channelPath: string;
  if (/^@[\p{L}\p{N}_.-]+$/u.test(parts[0] ?? '')) {
    channelPath = encodeURIComponent(parts[0]).replace('%40', '@');
    if (parts.length > 2 || (parts[1] && !['videos', 'shorts', 'streams', 'featured', 'about', 'playlists', 'community', 'posts'].includes(parts[1]))) throw new Error('لینک کانال معتبر نیست.');
  } else if (['channel', 'c', 'user'].includes(parts[0]) && /^[\p{L}\p{N}_.-]+$/u.test(parts[1] ?? '')) {
    if (parts[0] === 'channel' && !/^UC[A-Za-z0-9_-]{22}$/.test(parts[1])) throw new Error('شناسه کانال معتبر نیست.');
    if (parts.length > 3 || (parts[2] && !['videos', 'shorts', 'streams', 'featured', 'about', 'playlists', 'community', 'posts'].includes(parts[2]))) throw new Error('لینک کانال معتبر نیست.');
    channelPath = parts[0] + '/' + encodeURIComponent(parts[1]);
  } else throw new Error('لینک باید متعلق به کانال باشد، نه ویدیو یا playlist.');
  return 'https://www.youtube.com/' + channelPath;
}

export function parseYouTubeInitialData(payloads: unknown[], address: string, tab: YouTubeTab = 'videos'): CrawlerChannelCrawlResult {
  const canonical = normalizeYouTubeChannelUrl(address);
  const metadata = payloads.flatMap((root) => findAll(root, 'channelMetadataRenderer'))[0];
  const header = payloads.flatMap((root) => findAll(root, 'pageHeaderViewModel'))[0];
  const oldHeader = payloads.flatMap((root) => findAll(root, 'c4TabbedHeaderRenderer'))[0];
  const parts = metadataParts(at(header, 'metadata'));
  const subscribersText = parts.find((part) => /subscriber|مشترک/i.test(part)) ?? text(oldHeader?.subscriberCountText);
  const videosText = parts.find((part) => /\bvideos?\b|ویدیو/i.test(part)) ?? text(oldHeader?.videosCountText);
  const profile = metadata ? {
    platformKey: 'youtube', address: canonical,
    title: text(metadata.title),
    description: text(metadata.description),
    avatarUrl: imageUrl(metadata.avatar),
    raw: {
      externalChannelId: text(metadata.externalId), username: parts.find((part) => part.startsWith('@')) ?? null,
      followersCount: parseYouTubeCount(subscribersText), postsCount: parseYouTubeCount(videosText),
      subscribersDisplay: subscribersText, subscribersCountExact: subscribersText ? exactCount(subscribersText) !== null : null,
      coverUrl: imageUrl(at(header, 'banner', 'imageBannerViewModel', 'image')),
      websiteUrl: canonical,
    },
  } : null;
  const items = new Map<string, CrawlerMessage>();
  for (const payload of payloads) {
    const tabs = findAll(payload, 'tabRenderer');
    const roots = tabs.length ? tabs.filter((item) => item.selected === true).map((item) => item.content) : [payload];
    for (const root of roots) {
      const cards = [
        ...findAll(root, 'lockupViewModel').filter((card) => card.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO').map((card) => ({
          id: text(card.contentId), title: text(at(card, 'metadata', 'lockupMetadataViewModel', 'title')),
          views: metadataParts(at(card, 'metadata')).find((part) => /view|بازدید/i.test(part)),
          thumbnail: imageUrl(at(card, 'contentImage', 'thumbnailViewModel', 'image')),
          duration: text(findAll(card.contentImage, 'thumbnailBadgeViewModel')[0]?.text), isShort: false,
        })),
        ...findAll(root, 'videoRenderer').map((card) => ({
          id: text(card.videoId), title: text(card.title), views: text(card.viewCountText), thumbnail: imageUrl(card.thumbnail),
          duration: text(card.lengthText), isShort: false,
        })),
        ...findAll(root, 'shortsLockupViewModel').map((card) => ({
          id: text(at(card, 'onTap', 'innertubeCommand', 'reelWatchEndpoint', 'videoId')) ?? text(card.entityId)?.match(/([A-Za-z0-9_-]{11})$/)?.[1] ?? null,
          title: text(at(card, 'overlayMetadata', 'primaryText')), views: text(at(card, 'overlayMetadata', 'secondaryText')),
          thumbnail: imageUrl(at(card, 'thumbnailViewModel', 'image')), duration: null, isShort: true,
        })),
        ...findAll(root, 'reelItemRenderer').map((card) => ({
          id: text(card.videoId), title: text(card.headline), views: text(card.viewCountText), thumbnail: imageUrl(card.thumbnail), duration: null, isShort: true,
        })),
      ];
      for (const card of cards) {
        if (!card.id || !/^[A-Za-z0-9_-]{11}$/.test(card.id) || card.isShort !== (tab === 'shorts') || items.has(card.id)) continue;
        items.set(card.id, {
          platformKey: 'youtube', externalId: card.id, text: card.title, publishedAt: null,
          raw: {
            title: card.title, isShort: card.isShort, mediaType: card.isShort ? 'short' : 'video',
            url: card.isShort ? 'https://www.youtube.com/shorts/' + card.id : 'https://www.youtube.com/watch?v=' + card.id,
            thumbnailUrl: card.thumbnail, durationText: card.duration,
            viewsCount: parseYouTubeCount(card.views), viewsSource: 'channel_list', viewsCountExact: false,
            likesCount: null, commentsCount: null, detailStatus: 'pending',
          },
        });
      }
    }
  }
  return { profile, messages: [...items.values()] };
}

export function parseYouTubeVideoDetail(snapshot: YouTubePageSnapshot, message: CrawlerMessage, expectedChannelId?: string | null): CrawlerMessage {
  const details = object(at(snapshot.player, 'videoDetails'));
  const actualId = text(details.videoId) ?? snapshot.videoId;
  if (actualId !== message.externalId) throw new Error('YouTube detail video identity mismatch');
  const channelId = text(details.channelId);
  if (expectedChannelId && channelId && channelId !== expectedChannelId) throw new Error('YouTube detail channel identity mismatch');
  const primary = findAll(snapshot.initial, 'videoPrimaryInfoRenderer')[0];
  const secondary = findAll(snapshot.initial, 'videoSecondaryInfoRenderer')[0];
  const microformat = findAll(snapshot.player, 'playerMicroformatRenderer')[0];
  const raw = object(message.raw);
  const views = exactCount(at(primary, 'viewCount', 'videoViewCountRenderer', 'viewCount'))
    ?? exactCount(details.viewCount) ?? exactCount(snapshot.interactions?.WatchAction);
  const buttons = findAll(primary, 'buttonViewModel').filter((button) => button.iconName === 'LIKE');
  const labels = [...buttons.map((button) => text(button.accessibilityText)), ...(snapshot.buttonLabels ?? []).filter((label) => /^like this video|پسندیدن/i.test(label))];
  const likes = labels.map(exactCount).find((value) => value !== null)
    ?? exactCount(snapshot.interactions?.LikeAction)
    ?? buttons.map((button) => exactCount(button.title)).find((value) => value !== null) ?? null;
  const commentCounts = [
    at(snapshot.commentHeader, 'countText'), at(snapshot.commentHeader, 'commentsCount'),
    ...findAll(snapshot.initial, 'commentsEntryPointHeaderRenderer').map((item) => item.commentCount),
    ...findAll(snapshot.initial, 'commentsHeaderRenderer').map((item) => item.countText),
    ...(snapshot.buttonLabels ?? []).filter((label) => /^view [\d,.KMB ]+ comments|مشاهده.*نظر/i.test(label)),
    snapshot.commentsText,
  ];
  const comments = commentCounts.map(exactCount).find((value) => value !== null) ?? null;
  const title = text(details.title) ?? snapshot.title ?? text(primary?.title) ?? message.text ?? null;
  const description = text(details.shortDescription) ?? text(secondary?.attributedDescription) ?? text(secondary?.description) ?? snapshot.description ?? text(raw.description) ?? null;
  const publishedText = text(microformat?.publishDate) ?? snapshot.publishedAt ?? text(primary?.dateText);
  const normalizedDate = publishedText && !/T\d{2}:/.test(publishedText) ? publishedText + ' UTC' : publishedText;
  const publishedAt = normalizedDate && Number.isFinite(Date.parse(normalizedDate)) ? new Date(normalizedDate).toISOString() : message.publishedAt ?? null;
  const duration = parseYouTubeCount(details.lengthSeconds) ?? parseIsoDuration(snapshot.duration)
    ?? (typeof raw.durationText === 'string' && /^\d+(?::\d{2}){1,2}$/.test(raw.durationText) ? raw.durationText.split(':').reduce((total, part) => total * 60 + Number(part), 0) : null);
  const availableViews = views ?? (typeof raw.viewsCount === 'number' ? raw.viewsCount : null);
  const commentsDisabled = /comments are turned off|comments have been disabled|نظرات.*غیرفعال/i.test(snapshot.commentsText ?? '') || raw.commentsStatus === 'disabled';
  return {
    ...message, text: title, publishedAt,
    raw: {
      ...raw, title, description, authorId: channelId ?? expectedChannelId ?? null,
      thumbnailUrl: imageUrl(details.thumbnail) ?? snapshot.thumbnailUrl ?? raw.thumbnailUrl ?? null,
      durationSeconds: duration ?? raw.durationSeconds ?? null,
      publishedAtPrecision: publishedText && /T\d{2}:/.test(publishedText) ? 'timestamp' : 'day',
      viewsCount: availableViews, viewsCountExact: views !== null || raw.viewsCountExact === true,
      viewsSource: views !== null ? 'video_detail' : raw.viewsSource,
      likesCount: likes ?? raw.likesCount ?? null, commentsCount: comments ?? raw.commentsCount ?? null,
      sharesCount: null, dislikesCount: null,
      commentsStatus: commentsDisabled ? 'disabled' : (comments ?? raw.commentsCount) != null ? 'available' : 'unavailable',
      detailStatus: (views !== null || raw.viewsCountExact === true) && ((comments ?? raw.commentsCount) != null || commentsDisabled) ? 'complete' : 'partial',
      playbackStatus: text(at(snapshot.player, 'playabilityStatus', 'status')),
    },
  };
}
function parseIsoDuration(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
  return match ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) : null;
}
