import type {
  CrawlerChannelCrawlResult,
  CrawlerChannelProfile,
  CrawlerMessage,
} from '../../../types/Crawler.types';

type UnknownRecord = Record<string, unknown>;

export const parseXGraphqlResponses = (
  payloads: unknown[],
  address: string,
): CrawlerChannelCrawlResult => {
  const username = normalizeUsername(address);
  const records = collectRecords(payloads);
  const user = findMatchingUser(records, username);
  const messages = findMatchingTweets(records, username);

  return {
    profile: user ? parseProfile(user, address) : null,
    messages,
  };
};

const parseProfile = (user: UnknownRecord, address: string): CrawlerChannelProfile => {
  const legacy = asRecord(user.legacy) ?? {};
  const core = asRecord(user.core) ?? {};
  const avatar = asRecord(user.avatar) ?? {};
  const profileBio = asRecord(user.profile_bio) ?? {};
  const relationshipCounts = asRecord(user.relationship_counts) ?? {};
  const tweetCounts = asRecord(user.tweet_counts) ?? {};
  const actionCounts = asRecord(user.action_counts) ?? {};
  const verification = asRecord(user.verification) ?? {};
  const privacy = asRecord(user.privacy) ?? {};
  const location = asRecord(user.location) ?? {};
  const website = asRecord(user.website) ?? {};
  const username =
    asString(core.screen_name) ??
    asString(legacy.screen_name) ??
    normalizeUsername(address);

  return {
    platformKey: 'x',
    address: `@${username}`,
    title: asString(core.name) ?? asString(legacy.name) ?? asString(user.name),
    description: asString(profileBio.description) ?? asString(legacy.description),
    avatarUrl:
      asString(avatar.image_url) ??
      asString(legacy.profile_image_url_https) ??
      asString(legacy.profile_image_url),
    raw: {
      externalUserId: asString(user.rest_id),
      username,
      followersCount:
        asNumber(relationshipCounts.followers) ?? asNumber(legacy.followers_count),
      followingCount:
        asNumber(relationshipCounts.following) ?? asNumber(legacy.friends_count),
      postsCount: asNumber(tweetCounts.tweets) ?? asNumber(legacy.statuses_count),
      likesCount:
        asNumber(actionCounts.favorites_count) ?? asNumber(legacy.favourites_count),
      mediaCount: asNumber(tweetCounts.media_tweets) ?? asNumber(legacy.media_count),
      listedCount: asNumber(legacy.listed_count),
      verified: asBoolean(verification.verified) ?? asBoolean(legacy.verified),
      verificationType: asString(verification.verified_type),
      blueVerified: asBoolean(user.is_blue_verified),
      protected: asBoolean(privacy.protected),
      location: asString(location.location),
      websiteUrl: asString(website.url),
      accountCreatedAt: parseDate(asString(core.created_at) ?? asString(legacy.created_at)),
    },
  };
};

const findMatchingUser = (records: UnknownRecord[], username: string): UnknownRecord | null => {
  return (
    records.find((record) => {
      const legacy = asRecord(record.legacy);
      const core = asRecord(record.core);
      return (
        typeof record.rest_id === 'string' &&
        normalizeUsername(
          asString(core?.screen_name) ?? asString(legacy?.screen_name) ?? '',
        ) === username
      );
    }) ?? null
  );
};

const findMatchingTweets = (records: UnknownRecord[], username: string): CrawlerMessage[] => {
  const byId = new Map<string, CrawlerMessage>();

  for (const record of records) {
    const parsed = parseTweet(record, username);
    if (!parsed || byId.has(parsed.externalId)) continue;
    byId.set(parsed.externalId, parsed);
  }

  return [...byId.values()].sort((left, right) => {
    const leftTime = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
    const rightTime = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
    return rightTime - leftTime;
  });
};

const parseTweet = (tweet: UnknownRecord, expectedUsername: string): CrawlerMessage | null => {
  const legacy = asRecord(tweet.legacy);
  const externalId = asString(tweet.rest_id) ?? asString(legacy?.id_str);
  const text = asString(legacy?.full_text);
  if (!legacy || !externalId || text === null) return null;

  const author = extractTweetAuthor(tweet);
  if (!author || normalizeUsername(author.username) !== expectedUsername) return null;

  const views = asNumber(asRecord(tweet.views)?.count);
  const retweets = asNumber(legacy.retweet_count);
  const quotes = asNumber(legacy.quote_count);
  const media = extractMedia(legacy);
  const publishedAt = parseDate(asString(legacy.created_at));

  return {
    platformKey: 'x',
    externalId,
    text,
    publishedAt,
    raw: {
      conversationId: asString(legacy.conversation_id_str),
      authorId: author.id,
      authorUsername: author.username,
      viewsCount: views,
      likesCount: asNumber(legacy.favorite_count),
      repliesCount: asNumber(legacy.reply_count),
      repostsCount: retweets,
      quotesCount: quotes,
      sharesCount: retweets === null && quotes === null ? null : (retweets ?? 0) + (quotes ?? 0),
      bookmarksCount: asNumber(legacy.bookmark_count),
      language: asString(legacy.lang),
      possiblySensitive: asBoolean(legacy.possibly_sensitive),
      media,
      url: `https://x.com/${author.username}/status/${externalId}`,
    },
  };
};

const extractTweetAuthor = (
  tweet: UnknownRecord,
): { id: string | null; username: string } | null => {
  const core = asRecord(tweet.core);
  const userResults = asRecord(core?.user_results);
  const result = unwrapResult(asRecord(userResults?.result));
  const legacy = asRecord(result?.legacy);
  const userCore = asRecord(result?.core);
  const username = asString(userCore?.screen_name) ?? asString(legacy?.screen_name);
  if (!username) return null;
  return { id: asString(result?.rest_id), username };
};

const extractMedia = (legacy: UnknownRecord): UnknownRecord[] => {
  const extendedEntities = asRecord(legacy.extended_entities);
  const entities = asRecord(legacy.entities);
  const candidates = Array.isArray(extendedEntities?.media)
    ? extendedEntities.media
    : Array.isArray(entities?.media)
      ? entities.media
      : [];

  return candidates.flatMap((candidate) => {
    const media = asRecord(candidate);
    if (!media) return [];
    const videoInfo = asRecord(media.video_info);
    const variants = Array.isArray(videoInfo?.variants)
      ? videoInfo.variants.flatMap((variant) => {
          const value = asRecord(variant);
          const url = asString(value?.url);
          if (!value || !url) return [];
          return [{
            url,
            contentType: asString(value.content_type),
            bitrate: asNumber(value.bitrate),
          }];
        })
      : [];

    return [{
      id: asString(media.id_str),
      type: asString(media.type),
      url: asString(media.media_url_https) ?? asString(media.media_url),
      expandedUrl: asString(media.expanded_url),
      width: asNumber(asRecord(media.original_info)?.width),
      height: asNumber(asRecord(media.original_info)?.height),
      variants,
    }];
  });
};

const collectRecords = (roots: unknown[]): UnknownRecord[] => {
  const output: UnknownRecord[] = [];
  const seen = new Set<object>();
  const stack = [...roots];

  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }

    const record = current as UnknownRecord;
    output.push(unwrapResult(record) ?? record);
    stack.push(...Object.values(record));
  }

  return output;
};

const unwrapResult = (record: UnknownRecord | null): UnknownRecord | null => {
  let current = record;
  const visited = new Set<UnknownRecord>();
  while (current && !visited.has(current)) {
    visited.add(current);
    const typename = asString(current.__typename);
    const result = asRecord(current.result);
    const tweet = asRecord(current.tweet);
    if ((typename === 'TweetWithVisibilityResults' || !current.legacy) && tweet) {
      current = tweet;
      continue;
    }
    if (!current.legacy && result) {
      current = result;
      continue;
    }
    break;
  }
  return current;
};

const normalizeUsername = (value: string): string => {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).pathname.split('/').filter(Boolean)[0]?.toLowerCase() ?? '';
    } catch {
      return '';
    }
  }
  return trimmed.replace(/^@/, '').toLowerCase();
};

const parseDate = (value: string | null): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const asRecord = (value: unknown): UnknownRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

const asNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const asBoolean = (value: unknown): boolean | null =>
  typeof value === 'boolean' ? value : null;
