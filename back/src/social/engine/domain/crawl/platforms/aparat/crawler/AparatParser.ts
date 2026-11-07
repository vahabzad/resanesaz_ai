import { asRecord, asString } from '../../../helpers/dataHelpers';
import type { CrawlerChannelProfile, CrawlerMessage } from '../../../types/Crawler.types';

/** Accept exact counters only. A rounded label such as «۲٫۳ هزار» is not an integer. */
export function exactCount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632)).replace(/[,٬\s]/g, '');
  if (!/^\d+$/.test(normalized)) return null;
  const count = Number(normalized);
  return Number.isSafeInteger(count) ? count : null;
}

export function aparatUsername(address: string): string {
  let username = address.trim().replace(/^@/, '');
  if (/^https?:\/\//i.test(username)) {
    const url = new URL(username);
    if (!['aparat.com', 'www.aparat.com', 'shorts.aparat.com'].includes(url.hostname) || url.username || url.password) {
      throw new Error('Invalid Aparat channel address');
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.join('/') === 'shorts/user/shorts') {
      username = url.searchParams.get('user') ?? '';
    } else {
      if (parts.length !== 1 || url.hostname === 'shorts.aparat.com') throw new Error('Use an Aparat channel URL, not a video URL');
      username = parts[0];
    }
  }
  if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,79}$/.test(username) || /^(v|shorts|etc|api|live|login|search)$/i.test(username)) {
    throw new Error('Invalid Aparat username');
  }
  return username;
}

/** Aparat's unqualified Gregorian timestamps use Tehran local time. */
export function aparatPublishedAt(value: unknown): string | null {
  const text = asString(value);
  if (!text) return null;
  if (/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const match = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)$/.exec(text);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  const target = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
  const check = new Date(target);
  if (check.getUTCFullYear() !== parts[0] || check.getUTCMonth() + 1 !== parts[1] || check.getUTCDate() !== parts[2] ||
    parts[3] > 23 || parts[4] > 59 || parts[5] > 59) return null;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  let timestamp = target;
  for (let i = 0; i < 3; i++) {
    const values = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map(p => [p.type, p.value]));
    const local = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
    timestamp += target - local;
  }
  return new Date(timestamp).toISOString();
}

export function parseAparatProfile(payload: unknown, username: string): CrawlerChannelProfile {
  const data = asRecord(asRecord(payload).data);
  const attributes = asRecord(data.attributes ?? data);
  if (asString(attributes.username)?.toLowerCase() !== username.toLowerCase()) throw new Error('Aparat profile identity mismatch');
  return {
    platformKey: 'aparat', address: `https://www.aparat.com/${username}`,
    title: asString(attributes.name), description: asString(attributes.description), avatarUrl: asString(attributes.pic_b),
    raw: {
      username: attributes.username, authorId: asString(attributes.id),
      followersCount: exactCount(attributes.follower_cnt_num), postsCount: exactCount(attributes.video_cnt),
      followersDisplay: asString(attributes.follower_cnt), coverUrl: asString(attributes.cover_src),
      subscribersCountExact: exactCount(attributes.follower_cnt_num) !== null,
    },
  };
}

export function parseAparatVideo(payload: unknown, username: string, expectedUid?: string): CrawlerMessage {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const modern = asRecord(data.attributes ?? (data.uid ? data : undefined));
  const row = Object.keys(modern).length ? modern : asRecord(root.video ?? payload);
  const uid = asString(row.uid);
  if (!uid || !/^[a-zA-Z0-9]+$/.test(uid) || (expectedUid && uid !== expectedUid)) throw new Error('Aparat video identity mismatch');
  const owner = asString(row.username ?? row.owner_username);
  if (owner && owner.toLowerCase() !== username.toLowerCase()) throw new Error('Aparat video belongs to another channel');
  const included = Array.isArray(root.included) ? root.included.map(asRecord) : [];
  const like = included.find(item => item.type === 'Like' && String(item.id) === String(row.id));
  const likes = exactCount(row.like_cnt_non_formatted ?? asRecord(like?.attributes).cnt ?? row.like_cnt ?? asRecord(row.Like).cnt);
  const publishedAt = aparatPublishedAt(row.create_date ?? row.sdate_rss ?? row.sdate_real);
  const views = exactCount(row.visit_cnt_int ?? row.visit_cnt_non_formatted ?? row.visit_cnt);
  const comments = exactCount(row.comment_cnt_non_formatted);
  const commentsStatus = row.comment_enable === 'no' ? 'disabled' : comments === null ? 'unavailable' : 'available';
  const complete = views !== null && likes !== null && (comments !== null || commentsStatus === 'disabled') &&
    Object.prototype.hasOwnProperty.call(row, 'description') && publishedAt !== null && exactCount(row.duration) !== null;
  return {
    platformKey: 'aparat', externalId: uid, text: asString(row.title), publishedAt,
    raw: {
      title: asString(row.title), description: asString(row.description),
      descriptionAvailable: Object.prototype.hasOwnProperty.call(row, 'description'),
      username: owner ?? username, authorId: asString(row.userid), url: `https://www.aparat.com/v/${uid}`,
      thumbnailUrl: asString(row.big_poster ?? row.small_poster), mediaType: 'video', isShort: false,
      durationSeconds: exactCount(row.duration), publishedAtPrecision: publishedAt ? 'timestamp' : null,
      viewsCount: views, viewsCountExact: views !== null, viewsSource: Object.keys(modern).length ? 'video-detail' : 'video-list',
      likesCount: likes, commentsCount: comments, commentsStatus,
      detailStatus: complete ? 'complete' : 'partial',
    },
  };
}

/** Short post IDs exceed JS's safe integer range: preserve the vendor's string ID. */
export function parseAparatShort(payload: unknown, username: string, authorId: string, expectedId?: string): CrawlerMessage {
  const root = asRecord(payload);
  const post = asRecord(asRecord(root.data).post ?? payload);
  const id = asString(post.id);
  if (post.type !== 'short-video' || typeof post.id !== 'string' || !id || !/^\d{1,32}$/.test(id) || (expectedId && id !== expectedId)) {
    throw new Error('Aparat short identity mismatch');
  }
  const user = asRecord(post.user);
  if (String(user.id) !== authorId || asString(user.username)?.toLowerCase() !== username.toLowerCase()) {
    throw new Error('Aparat short belongs to another channel');
  }
  const stats = asRecord(post.stats);
  const views = exactCount(stats.views);
  const likes = exactCount(stats.likes);
  const comments = exactCount(stats.comments);
  const shares = exactCount(stats.shares);
  const saves = exactCount(stats.bookmarks);
  const description = asString(post.description);
  const title = description ? (description.length > 120 ? `${description.slice(0, 120)}…` : description) : null;
  const created = exactCount(post.created_at);
  const date = created === null ? null : new Date(created * 1000);
  const publishedAt = date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  const clip = Array.isArray(post.short_videos) ? asRecord(post.short_videos[0]) : {};
  const duration = Number(clip.duration);
  const durationSeconds = clip.duration != null && Number.isFinite(duration) && duration >= 0 ? duration : null;
  return {
    platformKey: 'aparat', externalId: `short:${id}`, text: title, publishedAt,
    raw: {
      shortId: id, title, description, caption: description,
      descriptionAvailable: Object.prototype.hasOwnProperty.call(post, 'description'),
      username: user.username, authorId, url: `https://www.aparat.com/shorts/${id}`,
      thumbnailUrl: asString(asRecord(post.cover).cdn_link), mediaType: 'short', isShort: true,
      durationSeconds, publishedAtPrecision: publishedAt ? 'timestamp' : null,
      viewsCount: views, viewsCountExact: views !== null, viewsSource: 'short-post',
      likesCount: likes, commentsCount: comments, sharesCount: shares, savesCount: saves,
      commentsStatus: comments === null ? 'unavailable' : 'available',
      detailStatus: [views, likes, comments, shares, saves].every(value => value !== null) &&
        publishedAt !== null && durationSeconds !== null && Object.prototype.hasOwnProperty.call(post, 'description') ? 'complete' : 'partial',
    },
  };
}

/** Fill missing detail fields without erasing exact counters already read from the list. */
export function mergeAparatDetails(listed: CrawlerMessage, detail: CrawlerMessage): CrawlerMessage {
  if (listed.externalId !== detail.externalId || listed.raw?.isShort !== detail.raw?.isShort) throw new Error('Aparat detail identity/type mismatch');
  const before = listed.raw ?? {}, after = detail.raw ?? {};
  const raw: Record<string, unknown> = { ...before, ...after };
  for (const key of ['viewsCount', 'likesCount', 'commentsCount', 'sharesCount', 'savesCount', 'durationSeconds', 'thumbnailUrl', 'title', 'authorId']) {
    if (after[key] === null || after[key] === undefined) raw[key] = before[key] ?? null;
  }
  if (after.descriptionAvailable !== true) raw.description = before.description ?? null;
  raw.descriptionAvailable = before.descriptionAvailable === true || after.descriptionAvailable === true;
  const publishedAt = detail.publishedAt ?? listed.publishedAt;
  raw.publishedAtPrecision = publishedAt ? 'timestamp' : null;
  raw.viewsCountExact = raw.viewsCount != null && (after.viewsCountExact === true || before.viewsCountExact === true);
  if (after.viewsCount == null) raw.viewsSource = before.viewsSource;
  if (raw.commentsCount != null && raw.commentsStatus === 'unavailable') raw.commentsStatus = 'available';
  const counters = raw.isShort ? ['viewsCount', 'likesCount', 'commentsCount', 'sharesCount', 'savesCount'] : ['viewsCount', 'likesCount'];
  const complete = counters.every(key => raw[key] != null) &&
    (raw.commentsCount != null || raw.commentsStatus === 'disabled') &&
    raw.durationSeconds != null && raw.descriptionAvailable === true && publishedAt != null;
  raw.detailStatus = complete ? 'complete' : 'partial';
  return { ...listed, ...detail, text: detail.text ?? listed.text, publishedAt, raw };
}

// News ingestion requires source text and publication evidence. Missing audience
// counters remain nullable analytics and must not invalidate complete news text.
export function aparatNewsComplete(message: CrawlerMessage): boolean {
  return Boolean((message.text?.trim() || asString(message.raw?.description)) && message.publishedAt && message.raw?.descriptionAvailable === true);
}
