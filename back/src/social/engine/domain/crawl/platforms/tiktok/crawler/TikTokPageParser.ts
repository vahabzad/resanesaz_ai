import type {
  CrawlerChannelProfile,
  CrawlerMessage,
  CrawlerChannelCrawlResult,
} from '../../../types/Crawler.types';
import { normalizeTikTokProfileUrl } from './TikTokAddress';
type Row = Record<string, any>;
const row = (value: unknown): Row =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {};
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;
const id = (value: unknown): string | null =>
  typeof value === 'string' && /^\d+$/.test(value)
    ? value
    : typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      ? String(value)
      : null;
export function tiktokCount(value: unknown): number | null {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value)))
    return null;
  return Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
}
function url(value: unknown): string | null {
  if (Array.isArray(value)) return value.map(url).find(Boolean) ?? null;
  if (value && typeof value === 'object')
    return url(row(value).urlList ?? row(value).url_list);
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}
function known(previous: Row, next: Row): Row {
  const result = { ...previous };
  for (const [key, value] of Object.entries(next))
    if ((value !== null && value !== undefined) || !(key in result)) result[key] = value;
  return result;
}
export class TikTokPageCollector {
  private readonly address: string;
  private readonly username: string;
  private profile: CrawlerChannelProfile | null = null;
  private targetId: string | null = null;
  private targetSecUid: string | null = null; // Used only to scope the browser's own feed responses; never persisted.
  private readonly messages = new Map<string, CrawlerMessage>();
  timelineSeen = false;
  hasNextPage: boolean | undefined;
  constructor(
    address: string,
    private readonly maxPosts = 100
  ) {
    this.address = normalizeTikTokProfileUrl(address);
    this.username = new URL(this.address).pathname.slice(2);
    if (!Number.isSafeInteger(maxPosts) || maxPosts < 1)
      throw new Error('Invalid TikTok post limit');
  }
  acceptsFeedUrl(value: string): boolean {
    try {
      const parsed = new URL(value);
      return (
        ['www.tiktok.com', 'tiktok.com'].includes(parsed.hostname) &&
        parsed.pathname === '/api/post/item_list/' &&
        this.targetSecUid !== null &&
        parsed.searchParams.get('secUid') === this.targetSecUid
      );
    } catch {
      return false;
    }
  }
  ingest(payload: unknown, scopedFeed = false): void {
    const root = row(payload),
      scope = row(root.__DEFAULT_SCOPE__);
    const detail = row(scope['webapp.user-detail']);
    this.addProfile(row(detail.userInfo));
    this.addProfile(row(root.userInfo));
    const users = row(row(root.UserModule).users),
      stats = row(row(root.UserModule).stats);
    for (const [key, user] of Object.entries(users))
      this.addProfile({ user, stats: stats[key] });
    const initial = row(scope['webapp.user-post']);
    if (Array.isArray(initial.itemList)) this.addList(initial, false);
    if (Array.isArray(root.itemList)) this.addList(root, scopedFeed);
    for (const post of Object.values(row(root.ItemModule))) this.addPost(row(post));
  }
  private addProfile(info: Row): void {
    const user = row(info.user),
      username = text(user.uniqueId);
    if (username?.toLowerCase() !== this.username) return;
    this.targetId = id(user.id) ?? this.targetId;
    this.targetSecUid = text(user.secUid) ?? this.targetSecUid;
    const stats = row(info.stats),
      v2 = row(info.statsV2);
    const count = (key: string) => tiktokCount(v2[key]) ?? tiktokCount(stats[key]);
    const raw = known(row(this.profile?.raw), {
      userId: this.targetId,
      username,
      verified: typeof user.verified === 'boolean' ? user.verified : null,
      isPrivate: typeof user.privateAccount === 'boolean' ? user.privateAccount : null,
      followersCount: count('followerCount'),
      followingCount: count('followingCount'),
      postsCount: count('videoCount'),
      likesCount: count('heartCount') ?? count('heart'),
    });
    this.profile = {
      platformKey: 'tiktok',
      address: this.address,
      title: text(user.nickname) ?? this.profile?.title ?? username,
      description:
        typeof user.signature === 'string'
          ? user.signature
          : (this.profile?.description ?? null),
      avatarUrl:
        url(user.avatarLarger) ??
        url(user.avatarMedium) ??
        url(user.avatarThumb) ??
        this.profile?.avatarUrl ??
        null,
      raw,
    };
    if (raw.postsCount === 0) this.timelineSeen = true;
  }
  private addList(payload: Row, scoped: boolean): void {
    if (payload.statusCode != null && payload.statusCode !== 0) return;
    let owned = false;
    for (const item of payload.itemList) owned = this.addPost(row(item)) || owned;
    if (scoped || owned) {
      this.timelineSeen = true;
      if (typeof payload.hasMore === 'boolean') this.hasNextPage = payload.hasMore;
      else if (payload.hasMore === 0 || payload.hasMore === 1)
        this.hasNextPage = Boolean(payload.hasMore);
    }
  }
  private addPost(post: Row): boolean {
    const author = row(post.author),
      authorName =
        text(author.uniqueId) ?? (typeof post.author === 'string' ? post.author : null);
    const authorId = id(author.id) ?? id(post.authorId);
    if (
      authorName?.toLowerCase() !== this.username &&
      !(this.targetId && authorId === this.targetId)
    )
      return false;
    const externalId = id(post.id);
    if (!externalId) return false;
    const stats = row(post.stats),
      v2 = row(post.statsV2),
      video = row(post.video),
      images = row(post.imagePost);
    const count = (key: string) => tiktokCount(v2[key]) ?? tiktokCount(stats[key]);
    const imageUrls = (Array.isArray(images.images) ? images.images : [])
      .map((image: unknown) => url(row(image).imageURL ?? row(image).displayImage))
      .filter((value: string | null): value is string => value !== null);
    const cover = url(video.cover) ?? url(video.originCover) ?? url(video.dynamicCover);
    const seconds = tiktokCount(post.createTime);
    const published =
      seconds !== null && seconds > 0 && seconds < 253402300800
        ? new Date(seconds * 1000).toISOString()
        : null;
    const likes = count('diggCount');
    const previous = this.messages.get(externalId);
    const raw = known(row(previous?.raw), {
      userId: this.targetId,
      authorId: authorId ?? this.targetId,
      username: this.username,
      permalink: `${this.address}/${imageUrls.length ? 'photo' : 'video'}/${externalId}`,
      mediaType: imageUrls.length ? 'photo' : 'video',
      mediaUrls: imageUrls.length
        ? imageUrls
        : cover
          ? [cover]
          : (previous?.raw?.mediaUrls ?? []),
      isPinned: typeof post.isPinnedItem === 'boolean' ? post.isPinnedItem : null,
      viewsCount: count('playCount'),
      likesCount: likes,
      reactionsCount: likes,
      reactions: likes !== null ? { like: likes } : (previous?.raw?.reactions ?? {}),
      commentsCount: count('commentCount'),
      sharesCount: count('shareCount'),
      savesCount: count('collectCount'),
      durationSeconds: tiktokCount(video.duration),
      width: tiktokCount(video.width),
      height: tiktokCount(video.height),
      musicTitle: text(row(post.music).title),
    });
    const message: CrawlerMessage = {
      platformKey: 'tiktok',
      externalId,
      text: typeof post.desc === 'string' ? post.desc : (previous?.text ?? null),
      publishedAt: published ?? previous?.publishedAt ?? null,
      raw,
    };
    if (!previous && this.messages.size >= this.maxPosts) {
      const oldest = [...this.messages.values()].sort(
        (a, b) =>
          new Date(a.publishedAt ?? 0).getTime() - new Date(b.publishedAt ?? 0).getTime()
      )[0];
      if (
        new Date(message.publishedAt ?? 0).getTime() <=
        new Date(oldest.publishedAt ?? 0).getTime()
      )
        return true;
      this.messages.delete(oldest.externalId);
    }
    this.messages.set(externalId, message);
    this.timelineSeen = true;
    return true;
  }
  snapshot(): CrawlerChannelCrawlResult {
    // Detach nested public data from the collector before an attempt is cancelled.
    return JSON.parse(
      JSON.stringify({
        profile: this.profile,
        messages: [...this.messages.values()].sort(
          (a, b) =>
            new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime()
        ),
      })
    );
  }
}
