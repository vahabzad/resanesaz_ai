import {
  asNumber,
  asRecord,
  asString,
  unixSecondsToDate,
} from "../../../helpers/dataHelpers";
import type {
  CrawlerChannelCrawlResult,
  CrawlerChannelProfile,
  CrawlerMessage,
} from "../../../types/Crawler.types";
import type { ShadDecryptedApiResponse } from "../api/ShadApi.types";

export const normalizeShadChannelAddress = (
  address: string,
): { guid: string; url: string } => {
  const trimmed = address.trim();
  let guid = trimmed;

  if (trimmed.includes("://")) {
    const url = new URL(trimmed);
    if (url.origin !== "https://web.shad.ir") {
      throw new Error(
        "Shad channel address must belong to https://web.shad.ir",
      );
    }
    guid = new URLSearchParams(url.hash.slice(1)).get("c") ?? "";
  } else if (trimmed.startsWith("#")) {
    guid = new URLSearchParams(trimmed.slice(1)).get("c") ?? "";
  }

  if (!/^c[A-Za-z0-9]+$/.test(guid)) {
    throw new Error(
      "Shad channel address must be a channel GUID or a web.shad.ir/#c= link",
    );
  }

  return { guid, url: `https://web.shad.ir/#c=${guid}` };
};

export const parseShadApiResponses = (
  requestedAddress: string,
  responses: ShadDecryptedApiResponse[],
): CrawlerChannelCrawlResult => {
  let profile: CrawlerChannelProfile | null = null;
  const messages = new Map<string, CrawlerMessage>();

  for (const response of responses) {
    const data = asRecord(response.payload.data);
    const channel = asRecord(data.channel);
    if (!profile && Object.keys(channel).length) {
      profile = toProfile(requestedAddress, channel);
    }

    for (const value of [
      ...toArray(data.messages),
      ...toArray(data.updated_messages),
    ]) {
      const candidate = asRecord(value);
      const message = Object.keys(asRecord(candidate.message)).length
        ? asRecord(candidate.message)
        : candidate;
      const parsed = toMessage(message);
      if (parsed) messages.set(parsed.externalId, parsed);
    }
  }

  return {
    profile,
    messages: [...messages.values()].sort(compareMessageIds),
  };
};

const toProfile = (
  requestedAddress: string,
  channel: Record<string, unknown>,
): CrawlerChannelProfile => ({
  platformKey: "shad",
  address:
    asString(channel.username) ??
    asString(channel.channel_guid) ??
    requestedAddress,
  title: asString(channel.channel_title),
  description: asString(channel.description),
  avatarUrl: null,
  raw: {
    channelGuid: asString(channel.channel_guid),
    username: asString(channel.username),
    followersCount: asNumber(channel.count_members),
    postsCount: null,
    viewsCount: null,
    verified: channel.is_verified === true,
    shareUrl: asString(channel.share_url),
    channelType: asString(channel.channel_type),
    native: sanitize(channel),
  },
});

const toMessage = (message: Record<string, unknown>): CrawlerMessage | null => {
  const externalId = asString(message.message_id);
  if (!externalId) return null;

  const file = asRecord(message.file_inline);
  const reactions = normalizeReactions(message.reactions);
  const reactionsCount = Object.values(reactions).reduce(
    (total, count) => total + count,
    0,
  );

  return {
    platformKey: "shad",
    externalId,
    text: asString(message.text),
    publishedAt: unixSecondsToDate(message.time),
    raw: {
      native: sanitize(message),
      mediaType: asString(file.type) ?? asString(file.mime),
      mediaUrls: [],
      caption: null,
      viewsCount: asNumber(message.count_seen),
      likesCount: null,
      commentsCount: null,
      sharesCount: null,
      savesCount: null,
      reactionsCount,
      reactions,
      isEdited: message.is_edited === true,
      messageType: asString(message.type),
      time: asString(message.time),
    },
  };
};

const normalizeReactions = (value: unknown): Record<string, number> => {
  if (!Array.isArray(value)) return {};
  const result: Record<string, number> = {};
  for (const item of value) {
    const reaction = asRecord(item);
    const key =
      asString(reaction.emoji_char) ??
      (asString(reaction.reaction_id)
        ? `id:${asString(reaction.reaction_id)}`
        : null);
    const count = asNumber(reaction.reaction_count);
    if (key && count !== null) result[key] = (result[key] ?? 0) + count;
  }
  return result;
};

const sanitize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(
        ([key]) =>
          key !== "thumb_inline" && key !== "auth" && key !== "data_enc",
      )
      .map(([key, item]) => [key, sanitize(item)]),
  );
};

const toArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const compareMessageIds = (
  left: CrawlerMessage,
  right: CrawlerMessage,
): number => {
  if (/^\d+$/.test(left.externalId) && /^\d+$/.test(right.externalId)) {
    const a = BigInt(left.externalId);
    const b = BigInt(right.externalId);
    return a < b ? -1 : a > b ? 1 : 0;
  }
  return left.externalId.localeCompare(right.externalId);
};
