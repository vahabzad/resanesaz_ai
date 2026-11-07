import { asNumber, asRecord, asString, unixSecondsToDate } from '../../../helpers/dataHelpers';
import type {
  CrawlerChannelCrawlResult,
  CrawlerChannelProfile,
  CrawlerMessage,
  CrawlerStory,
} from '../../../types/Crawler.types';
import type { NetworkLogEntry } from '../../../helpers/browserHelpers';

type InstagramTab = 'posts' | 'reels';

interface CollectionState {
  count: number;
  hasNextPage: boolean | null;
}

export const getInstagramCollectionState = (
  logs: NetworkLogEntry[],
  tab: InstagramTab
): CollectionState => {
  const items = new Set<string>();
  let hasNextPage: boolean | null = null;

  for (const log of matchingResponses(logs, tab)) {
    const connection = getConnection(log, tab);
    const edges = Array.isArray(connection.edges) ? connection.edges : [];
    for (const edge of edges) {
      const edgeRecord = asRecord(edge);
      const node = tab === 'reels'
        ? asRecord(asRecord(edgeRecord.node).media)
        : asRecord(edgeRecord.node);
      const id = asString(node.pk) ?? asString(node.id);
      if (id) items.add(id);
    }

    const pageInfo = asRecord(connection.page_info);
    if (typeof pageInfo.has_next_page === 'boolean') {
      hasNextPage = pageInfo.has_next_page;
    }
  }

  if (tab === 'reels') {
    for (const log of logs) {
      if (log.type !== 'response' || !/\/api\/graphql|\/graphql\/query/i.test(log.url ?? '')) continue;
      for (const node of findReelMetricNodes(log.responseBody)) {
        const id = asString(node.pk) ?? asString(node.id);
        if (id) items.add(id);
      }
    }
  }

  return { count: items.size, hasNextPage };
};

export const parseInstagramCrawlResult = (
  logs: NetworkLogEntry[],
  address: string
): CrawlerChannelCrawlResult => {
  const profile = parseProfile(logs, address);
  const messages = new Map<string, CrawlerMessage>();

  for (const log of matchingResponses(logs, 'posts')) {
    collectMessages(messages, getConnection(log, 'posts'), false);
  }
  for (const log of matchingResponses(logs, 'reels')) {
    collectMessages(messages, getConnection(log, 'reels'), true);
  }
  collectReelMetricsFromGraphql(messages, logs);

  return { profile, messages: [...messages.values()] };
};

export const parseInstagramReelDetail = (
  responseBody: unknown,
  expectedExternalId: string
): CrawlerMessage | null => {
  const items = asRecord(responseBody).items;
  if (!Array.isArray(items)) return null;

  const node = items
    .map(asRecord)
    .find((item) => (asString(item.pk) ?? asString(item.id)) === expectedExternalId);
  return node ? normalizeMessage(node, true) : null;
};

export const parseInstagramStories = (
  logs: NetworkLogEntry[],
  expectedUserId?: string | null
): CrawlerStory[] => {
  const stories = new Map<string, CrawlerStory>();

  for (const log of logs) {
    if (log.type !== 'response' || !isStoryResponse(log)) continue;
    for (const node of findStoryNodes(log.responseBody)) {
      const owner = Object.keys(asRecord(node.user)).length
        ? asRecord(node.user)
        : asRecord(node.owner);
      const ownerId = asIdentifier(owner.pk) ?? asIdentifier(owner.id);
      if (expectedUserId && ownerId && ownerId !== expectedUserId) continue;

      const externalId = asIdentifier(node.pk) ?? asIdentifier(node.id);
      if (!externalId) continue;
      const images = asRecord(node.image_versions2).candidates;
      const videos = node.video_versions;
      const imageUrl = asString(asRecord(Array.isArray(images) ? images[0] : null).url) ??
        asString(node.display_url);
      const videoUrl = asString(asRecord(Array.isArray(videos) ? videos[0] : null).url) ??
        asString(node.video_url);
      const mediaTypeValue = asNumber(node.media_type);
      const typename = asString(node.__typename) ?? '';
      const mediaType = mediaTypeValue === 2 || /video/i.test(typename) || Boolean(videoUrl)
        ? 'video'
        : 'image';
      const takenAt = unixSecondsToDate(node.taken_at ?? node.takenAt);
      const expiresAt = unixSecondsToDate(node.expiring_at ?? node.expiringAt) ??
        (takenAt ? new Date(takenAt.getTime() + 24 * 60 * 60 * 1000) : null);

      stories.set(externalId, {
        platformKey: 'instagram',
        externalId,
        mediaType,
        mediaUrl: mediaType === 'video' ? videoUrl ?? imageUrl : imageUrl ?? videoUrl,
        takenAt,
        expiresAt,
        raw: {
          ownerId,
          mediaType,
          width: asNumber(node.original_width),
          height: asNumber(node.original_height),
          videoDuration: asNumber(node.video_duration),
          hasAudio: typeof node.has_audio === 'boolean' ? node.has_audio : null,
          audience: asString(node.audience),
          caption: asString(asRecord(node.caption).text),
          mediaUrl: mediaType === 'video' ? videoUrl ?? imageUrl : imageUrl ?? videoUrl,
          takenAt: asNumber(node.taken_at),
          expiringAt: asNumber(node.expiring_at),
        },
      });
    }
  }

  return [...stories.values()];
};

export const mergeInstagramMessage = (
  current: CrawlerMessage,
  incoming: CrawlerMessage
): CrawlerMessage => {
  const currentRaw = asRecord(current.raw);
  const incomingRaw = asRecord(incoming.raw);
  const mergedRaw = mergeDefined(currentRaw, incomingRaw);
  preservePositiveMetrics(currentRaw, incomingRaw, mergedRaw);
  mergedRaw.fromPostsTab = currentRaw.fromPostsTab === true || incomingRaw.fromPostsTab === true;
  mergedRaw.fromReelsTab = currentRaw.fromReelsTab === true || incomingRaw.fromReelsTab === true;
  mergedRaw.pinned = mergePinnedState(currentRaw.pinned, incomingRaw.pinned);

  return {
    ...current,
    text: current.text ?? incoming.text,
    publishedAt: current.publishedAt ?? incoming.publishedAt,
    raw: mergedRaw,
  };
};

const preservePositiveMetrics = (
  current: Record<string, unknown>,
  incoming: Record<string, unknown>,
  merged: Record<string, unknown>
): void => {
  const metricNames = [
    'likesCount',
    'commentsCount',
    'viewsCount',
    'playsCount',
    'repostsCount',
    'sharesCount',
    'savesCount',
  ];

  for (const metricName of metricNames) {
    const currentValue = asNumber(current[metricName]);
    const incomingValue = asNumber(incoming[metricName]);
    if ((incomingValue === null || incomingValue === 0) && currentValue !== null && currentValue > 0) {
      merged[metricName] = currentValue;
    }
  }
};

const parseProfile = (logs: NetworkLogEntry[], address: string): CrawlerChannelProfile | null => {
  const response = logs.find((log) => friendlyName(log) === 'PolarisProfilePageContentQuery');
  const user = asRecord(asRecord(asRecord(response?.responseBody).data).user);
  const username = asString(user.username);
  if (!username) return null;

  const hdProfile = asRecord(user.hd_profile_pic_url_info);
  const highlightsResponse = logs.find(
    (log) => friendlyName(log) === 'PolarisProfileStoryHighlightsTrayContentQuery'
  );
  const highlights = asRecord(asRecord(highlightsResponse?.responseBody).data).highlights;
  const highlightEdges = Array.isArray(asRecord(highlights).edges)
    ? asRecord(highlights).edges as unknown[]
    : [];
  const raw = {
    instagramUserId: asString(user.pk) ?? asString(user.id),
    username,
    fullName: asString(user.full_name),
    bio: asString(user.biography),
    avatarUrl: asString(hdProfile.url) ?? asString(user.profile_pic_url),
    externalUrl: asString(user.external_url),
    bioLinks: Array.isArray(user.bio_links) ? user.bio_links.map((item) => {
      const link = asRecord(item);
      return {
        title: asString(link.title),
        url: asString(link.url),
        isPinned: typeof link.is_pinned === 'boolean' ? link.is_pinned : null,
      };
    }) : [],
    category: asString(user.category),
    verified: typeof user.is_verified === 'boolean' ? user.is_verified : null,
    isPrivate: typeof user.is_private === 'boolean' ? user.is_private : null,
    isBusiness: typeof user.is_business === 'boolean' ? user.is_business : null,
    accountType: asNumber(user.account_type),
    followersCount: asNumber(user.follower_count),
    followingCount: asNumber(user.following_count),
    postsCount: asNumber(user.media_count),
    reelsCount: asNumber(user.total_clips_count),
    latestReelMedia: asNumber(user.latest_reel_media),
    highlightsCount: highlightEdges.length,
    addressStreet: asString(user.address_street),
    cityName: asString(user.city_name),
  };

  return {
    platformKey: 'instagram',
    address,
    title: raw.fullName,
    description: raw.bio,
    avatarUrl: raw.avatarUrl,
    raw,
  };
};

const collectMessages = (
  target: Map<string, CrawlerMessage>,
  connection: Record<string, unknown>,
  fromReelsTab: boolean
): void => {
  const edges = Array.isArray(connection.edges) ? connection.edges : [];
  for (const edge of edges) {
    const edgeRecord = asRecord(edge);
    const node = fromReelsTab
      ? asRecord(asRecord(edgeRecord.node).media)
      : asRecord(edgeRecord.node);
    const externalId = asString(node.pk) ?? asString(node.id);
    if (!externalId) continue;

    const normalized = normalizeMessage(node, fromReelsTab);
    const existing = target.get(externalId);
    if (!existing) {
      target.set(externalId, normalized);
      continue;
    }

    target.set(externalId, mergeInstagramMessage(existing, normalized));
  }
};

const collectReelMetricsFromGraphql = (
  target: Map<string, CrawlerMessage>,
  logs: NetworkLogEntry[]
): void => {
  for (const log of logs) {
    if (log.type !== 'response' || !/\/api\/graphql|\/graphql\/query/i.test(log.url ?? '')) {
      continue;
    }

    for (const node of findReelMetricNodes(log.responseBody)) {
      const normalized = normalizeMessage(node, true);
      if (!normalized.externalId) continue;
      const existing = target.get(normalized.externalId);
      target.set(
        normalized.externalId,
        existing ? mergeInstagramMessage(existing, normalized) : normalized
      );
    }
  }
};

const findReelMetricNodes = (value: unknown): Record<string, unknown>[] => {
  const found: Record<string, unknown>[] = [];

  const visit = (current: unknown): void => {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }

    const record = asRecord(current);
    if (!Object.keys(record).length) return;
    const externalId = asString(record.pk) ?? asString(record.id);
    const shortcode = asString(record.code);
    const playsCount = asNumber(record.play_count) ?? asNumber(record.ig_play_count);
    if (externalId && shortcode && playsCount !== null) {
      found.push(record);
      return;
    }

    Object.values(record).forEach(visit);
  };

  visit(value);
  return found;
};

const normalizeMessage = (node: Record<string, unknown>, fromReelsTab: boolean): CrawlerMessage => {
  const externalId = asString(node.pk) ?? asString(node.id) ?? '';
  const code = asString(node.code);
  const caption = asString(asRecord(node.caption).text);
  const productType = asString(node.product_type);
  const mediaType = normalizeMediaType(productType, asNumber(node.media_type), fromReelsTab);
  const location = asRecord(node.location);
  const clipsMetadata = asRecord(node.clips_metadata);
  const owner = asRecord(node.user);
  const originalSound = asRecord(clipsMetadata.original_sound_info);
  const musicInfo = asRecord(asRecord(clipsMetadata.music_info).music_asset_info);
  const coauthors = Array.isArray(node.coauthor_producers)
    ? node.coauthor_producers.map((item) => {
      const user = asRecord(item);
      return {
        id: asString(user.pk) ?? asString(user.id),
        username: asString(user.username),
        fullName: asString(user.full_name),
        verified: typeof user.is_verified === 'boolean' ? user.is_verified : null,
      };
    })
    : [];
  const raw = {
    shortcode: code,
    permalink: code ? `https://www.instagram.com/${mediaType === 'reel' ? 'reel' : 'p'}/${code}/` : null,
    caption,
    mediaType,
    mediaUrls: getMediaUrls(node),
    owner: Object.keys(owner).length ? {
      id: asString(owner.pk) ?? asString(owner.id),
      username: asString(owner.username),
      fullName: asString(owner.full_name),
      verified: typeof owner.is_verified === 'boolean' ? owner.is_verified : null,
    } : null,
    width: asNumber(node.original_width),
    height: asNumber(node.original_height),
    durationSeconds: asNumber(node.video_duration),
    productType,
    captionEdited: typeof node.caption_is_edited === 'boolean' ? node.caption_is_edited : null,
    paidPartnership: typeof node.is_paid_partnership === 'boolean' ? node.is_paid_partnership : null,
    pinned: getPinnedState(node),
    location: Object.keys(location).length ? {
      id: asString(location.pk),
      name: asString(location.name),
      latitude: asNumber(location.lat),
      longitude: asNumber(location.lng),
    } : null,
    coauthors,
    audio: Object.keys(clipsMetadata).length ? {
      type: asString(clipsMetadata.audio_type),
      title: asString(musicInfo.title) ?? asString(originalSound.original_audio_title),
      artist: asString(musicInfo.display_artist),
      assetId: asString(musicInfo.audio_id) ?? asString(originalSound.audio_asset_id),
    } : null,
    hashtags: extractMatches(caption, /#[\p{L}\p{N}_]+/gu),
    mentions: extractMatches(caption, /@[\p{L}\p{N}._]+/gu),
    likesCount: asNumber(node.like_count),
    commentsCount: asNumber(node.comment_count),
    viewsCount: asNumber(node.view_count),
    playsCount: asNumber(node.play_count) ?? asNumber(node.ig_play_count),
    repostsCount: asNumber(node.media_repost_count) ?? asNumber(node.repost_count),
    sharesCount: asNumber(node.share_count)
      ?? asNumber(node.reshare_count)
      ?? asNumber(node.shares_count),
    savesCount: asNumber(node.save_count),
    fromPostsTab: !fromReelsTab,
    fromReelsTab,
  };

  return {
    platformKey: 'instagram',
    externalId,
    text: caption,
    publishedAt: unixSecondsToDate(node.taken_at),
    raw,
  };
};

const matchingResponses = (logs: NetworkLogEntry[], tab: InstagramTab): NetworkLogEntry[] => {
  const pattern = tab === 'posts' ? /^PolarisProfilePosts/ : /^PolarisProfileReelsTabContent/;
  return logs.filter((log) => {
    if (log.type !== 'response') return false;
    if (pattern.test(friendlyName(log) ?? '')) return true;

    // Instagram changes GraphQL operation names independently of the response
    // schema. Detect the timeline by its stable connection key as well, so a
    // valid reels response is not discarded when the friendly name changes.
    return Object.keys(getConnection(log, tab)).length > 0;
  });
};

const getConnection = (log: NetworkLogEntry, tab: InstagramTab): Record<string, unknown> => {
  const connectionKey = tab === 'posts'
    ? 'xdt_api__v1__feed__user_timeline_graphql_connection'
    : 'xdt_api__v1__clips__user__connection_v2';
  const direct = asRecord(asRecord(asRecord(log.responseBody).data)[connectionKey]);
  if (Object.keys(direct).length) return direct;

  return asRecord(findNestedValue(log.responseBody, connectionKey));
};

const findNestedValue = (value: unknown, key: string): unknown => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNestedValue(item, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  const record = asRecord(value);
  if (!Object.keys(record).length) return undefined;
  if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];

  for (const child of Object.values(record)) {
    const found = findNestedValue(child, key);
    if (found !== undefined) return found;
  }
  return undefined;
};

const friendlyName = (log: NetworkLogEntry): string | null => {
  if (typeof log.requestPayload !== 'string') return null;
  return new URLSearchParams(log.requestPayload).get('fb_api_req_friendly_name');
};

const isStoryResponse = (log: NetworkLogEntry): boolean => {
  const name = friendlyName(log) ?? '';
  return /StoryViewer|Stories/i.test(name) ||
    /\/api\/v1\/(?:feed\/)?(?:reels_media|feed\/reels_tray|feed\/user\/[^/]+\/story)/i.test(log.url ?? '');
};

const findStoryNodes = (value: unknown): Record<string, unknown>[] => {
  const found: Record<string, unknown>[] = [];
  const visit = (current: unknown): void => {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    const record = asRecord(current);
    if (!Object.keys(record).length) return;

    const externalId = asIdentifier(record.pk) ?? asIdentifier(record.id);
    const takenAt = asNumber(record.taken_at ?? record.takenAt);
    if (externalId && takenAt !== null) {
      found.push(record);
      return;
    }
    Object.values(record).forEach(visit);
  };

  visit(value);
  return found;
};

const asIdentifier = (value: unknown): string | null => {
  const stringValue = asString(value);
  if (stringValue) return stringValue;
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : null;
};

const normalizeMediaType = (
  productType: string | null,
  mediaType: number | null,
  fromReelsTab: boolean
): string => {
  if (fromReelsTab || productType === 'clips') return 'reel';
  if (mediaType === 8 || productType === 'carousel_container') return 'carousel';
  if (mediaType === 2) return 'video';
  return 'image';
};

const mergeDefined = (
  current: Record<string, unknown>,
  incoming: Record<string, unknown>
): Record<string, unknown> => Object.entries(incoming).reduce<Record<string, unknown>>((result, [key, value]) => {
  if (value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0)) {
    result[key] = value;
  }
  return result;
}, { ...current });

const getPinnedState = (node: Record<string, unknown>): boolean | null => {
  const pinCollections = [
    node.timeline_pinned_user_ids,
    node.clips_tab_pinned_user_ids,
  ].filter(Array.isArray) as unknown[][];

  if (!pinCollections.length) return null;
  return pinCollections.some((ids) => ids.length > 0);
};

const mergePinnedState = (...values: unknown[]): boolean | null => {
  if (values.some((value) => value === true)) return true;
  if (values.some((value) => value === false)) return false;
  return null;
};

const getMediaUrls = (node: Record<string, unknown>): string[] => {
  const images = asRecord(node.image_versions2).candidates;
  const videos = node.video_versions;
  const urls = [
    asString(asRecord(Array.isArray(images) ? images[0] : null).url),
    asString(asRecord(Array.isArray(videos) ? videos[0] : null).url),
  ].filter((value): value is string => Boolean(value));
  return [...new Set(urls)];
};

const extractMatches = (text: string | null, pattern: RegExp): string[] => {
  return text ? [...new Set(text.match(pattern) ?? [])] : [];
};
