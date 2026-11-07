import type { CrawlerChannelCrawlResult, CrawlerMessage } from '../../../types/Crawler.types';

export function normalizeEitaaAddress(address: string): { username: string; url: string } {
  let username = address.trim();
  if (/^https?:\/\//i.test(username)) {
    const url = new URL(username);
    if (url.protocol !== 'https:' || !['eitaa.com', 'www.eitaa.com', 'web.eitaa.com'].includes(url.hostname)) {
      throw new Error('Invalid Eitaa channel URL');
    }
    username = url.hostname === 'web.eitaa.com' ? url.hash.replace(/^#@?/, '') : url.pathname.replace(/^\//, '').replace(/\/$/, '');
  }
  username = username.replace(/^@/, '');
  if (!/^[a-z][a-z0-9_]{3,31}$/i.test(username)) throw new Error('Invalid Eitaa channel username');
  username = username.toLowerCase();
  return { username, url: `https://web.eitaa.com/#@${username}` };
}

export interface EitaaNativeMessage {
  id: number;
  peerId: number;
  date: number;
  text: string;
  views: number | null;
  forwards: number | null;
  comments: number | null;
  reactions: Record<string, number> | null;
  mediaType: string;
  edited: boolean;
  pinned: boolean;
  groupedId?: string | null;
}

export interface EitaaNativeBatch {
  peerId: number;
  title: string;
  username: string;
  description: string | null;
  followersCount: number | null;
  verified: boolean;
  messages: EitaaNativeMessage[];
  end: boolean;
  metricsIncomplete?: boolean;
  metricsDiagnostic?: {
    requestedCount: number;
    missingCount: number;
    requests: number;
    shortResponses: number;
    errorCode: number | null;
    errorType: string | null;
  };
}

export function parseEitaaBatch(address: string, batch: EitaaNativeBatch): CrawlerChannelCrawlResult {
  const { username } = normalizeEitaaAddress(address);
  if (batch.username.toLowerCase() !== username || batch.peerId >= 0) throw new Error('Eitaa channel identity mismatch');
  const numberOrNull = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  const groups = new Map<string, Map<number, EitaaNativeMessage>>();
  for (const m of batch.messages) {
    if (m.peerId !== batch.peerId || !Number.isSafeInteger(m.id) || m.id <= 0 || !Number.isFinite(m.date) || m.date <= 0) continue;
    const key = m.groupedId ? `album:${m.groupedId}` : `message:${m.id}`;
    if (!groups.has(key)) groups.set(key, new Map());
    groups.get(key)!.set(m.id, m);
  }
  const messages: CrawlerMessage[] = [...groups.values()].map((group) => {
    const members = [...group.values()].sort((a, b) => a.id - b.id);
    const m = members[0];
    const text = [...new Set(members.map((member) => member.text).filter(Boolean))].join('\n\n');
    const maxCount = (field: 'views' | 'forwards' | 'comments'): number | null => {
      const counts = members.map((member) => numberOrNull(member[field])).filter((count): count is number => count !== null);
      return counts.length ? Math.max(...counts) : null;
    };
    const reactions: Record<string, number> = {};
    // Album counters are repeated on attachments; summing would inflate totals.
    for (const member of members) {
      for (const [key, count] of Object.entries(member.reactions ?? {})) {
        const value = numberOrNull(count);
        if (value !== null) reactions[key] = Math.max(reactions[key] ?? 0, value);
      }
    }
    const mediaTypes = [...new Set(members.map((member) => member.mediaType).filter((type) => type !== 'text'))];
    const mediaType = mediaTypes.length > 1 ? 'album' : mediaTypes[0] ?? 'text';
    return {
      platformKey: 'eitaa', externalId: String(m.id), text,
      publishedAt: new Date(m.date * 1000),
      raw: {
        text, mediaType, mediaUrls: [],
        ...(m.groupedId ? {
          groupedId: m.groupedId,
          albumMessageIds: members.map((member) => String(member.id)),
          mediaItems: members.filter((member) => member.mediaType !== 'text').map((member) => ({
            externalId: String(member.id), mediaType: member.mediaType,
          })),
        } : {}),
        viewsCount: maxCount('views'), sharesCount: maxCount('forwards'),
        commentsCount: maxCount('comments'), reactions,
        reactionsCount: members.every((member) => member.reactions == null) ? null : Object.values(reactions).reduce((a, b) => a + b, 0),
        isEdited: members.some((member) => member.edited), isPinned: members.some((member) => member.pinned),
        permalink: `https://eitaa.com/${username}/${m.id}`,
        mediaAvailability: mediaType === 'text' ? 'none' : 'not-downloaded',
      },
    };
  });
  return {
    profile: {
      platformKey: 'eitaa', address: `@${username}`, title: batch.title,
      description: batch.description, avatarUrl: null,
      raw: { username, bio: batch.description, followersCount: numberOrNull(batch.followersCount), verified: batch.verified, peerId: batch.peerId },
    },
    messages,
  };
}
