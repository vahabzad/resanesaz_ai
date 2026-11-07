import type {
  CrawlerChannelCrawlResult,
  CrawlerChannelProfile,
  CrawlerMessage,
} from '../../../types/Crawler.types';
import { facebookProfileKey, normalizeFacebookProfileUrl } from './FacebookAddress';

type Row = Record<string, unknown>;
const row = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {};
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
export const facebookCount = (value: unknown): number | null => {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
};
const at = (value: unknown, ...keys: string[]): unknown =>
  keys.reduce<unknown>((current, key) => row(current)[key], value);

export function parseFacebookCountLabel(label: string | null): number | null {
  if (!label) return null;
  const normalized = label
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632));
  const match =
    /^\s*([\d,٬\s]+)\s+(?:followers?|following|دنبال[‌ ]?کننده|دنبال[‌ ]?شونده)\s*$/i.exec(
      normalized
    );
  return match ? facebookCount(match[1].replace(/[,٬\s]/g, '')) : null;
}

/** Walk only vendor data in memory. Viewer, comments, reshares and tracking are never output. */
function walk(value: unknown, callback: (item: Row) => void, depth = 0): void {
  if (!value || typeof value !== 'object' || depth > 60) return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, callback, depth + 1);
    return;
  }
  const item = row(value);
  callback(item);
  for (const [key, child] of Object.entries(item)) {
    if (
      /viewer|actor_provider|current_actor|attached_story|comment|tracking|story_bucket|notification|friend|plugins|translation/i.test(
        key
      )
    )
      continue;
    walk(child, callback, depth + 1);
  }
}

export function parseFacebookResponseText(body: string): unknown[] {
  const clean = body.replace(/^\s*for\s*\(;;\);\s*/, '');
  try {
    return [JSON.parse(clean)];
  } catch {
    /* GraphQL can return newline-delimited incremental payloads. */
  }
  return clean
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

export class FacebookPageCollector {
  private readonly key: string;
  private targetId: string | null = null;
  private profile: CrawlerChannelProfile | null = null;
  private readonly messages = new Map<string, CrawlerMessage>();
  timelineSeen = false;
  hasNextPage: boolean | null = null;
  constructor(
    readonly address: string,
    private readonly maxPosts = 100
  ) {
    this.key = facebookProfileKey(address);
  }

  private matches(url: unknown): boolean {
    if (typeof url !== 'string') return false;
    try {
      return (
        facebookProfileKey(
          url.split('?')[0] === 'https://www.facebook.com/profile.php' ? url : url.split('?')[0]
        ) === this.key
      );
    } catch {
      return false;
    }
  }

  ingest(payload: unknown): void {
    // Resolve the requested page by its own public URL, never by the logged-in viewer.
    walk(payload, (item) => {
      if (this.matches(item.url ?? item.profile_url) && text(item.id) && text(item.name)) {
        this.targetId = String(item.id);
        const old = this.profile;
        const raw = {
          ...old?.raw,
          pageId: this.targetId,
          username: this.key,
          verified:
            typeof item.show_verified_badge_on_profile === 'boolean'
              ? item.show_verified_badge_on_profile
              : typeof item.is_verified === 'boolean'
                ? item.is_verified
                : (old?.raw?.verified ?? null),
          followersCount:
            facebookCount(
              item.followers_count ?? item.follower_count ?? at(item, 'subscribers', 'count')
            ) ??
            old?.raw?.followersCount ??
            null,
          followingCount: facebookCount(item.following_count) ?? old?.raw?.followingCount ?? null,
          postsCount: facebookCount(item.posts_count) ?? old?.raw?.postsCount ?? null,
        };
        this.profile = {
          platformKey: 'facebook',
          address: normalizeFacebookProfileUrl(this.address),
          title: text(item.name),
          description: text(at(item, 'bio', 'text')) ?? old?.description ?? null,
          avatarUrl:
            text(at(item, 'profile_picture', 'uri')) ??
            text(at(item, 'profile_picture_for_sticky_bar', 'uri')) ??
            old?.avatarUrl ??
            null,
          raw,
        };
      }
    });
    if (!this.targetId) return;
    walk(payload, (item) => {
      if (String(item.id) === this.targetId) {
        const connection = row(item.timeline_list_feed_units ?? item.timeline_feed_units);
        if (Array.isArray(connection.edges)) {
          this.timelineSeen = true;
          const hasNext = at(connection, 'page_info', 'has_next_page');
          if (typeof hasNext === 'boolean') this.hasNextPage = hasNext;
          for (const edge of connection.edges) this.addStory(row(row(edge).node));
        }
      }
      // Incremental responses may carry an individual edge without the parent connection.
      if (item.__typename === 'Story' && item.post_id && item.creation_time) this.addStory(item);
    });
  }

  mergeProfileDetails(details: {
    description?: string | null;
    followersCount?: number | null;
    followingCount?: number | null;
    followersDisplay?: string | null;
  }): void {
    if (!this.profile) return;
    this.profile = {
      ...this.profile,
      description: this.profile.description ?? details.description ?? null,
      raw: {
        ...this.profile.raw,
        followersCount: this.profile.raw?.followersCount ?? details.followersCount ?? null,
        followingCount: this.profile.raw?.followingCount ?? details.followingCount ?? null,
        followersDisplay: details.followersDisplay ?? null,
      },
    };
  }

  private addStory(story: Row): void {
    const content = row(at(story, 'comet_sections', 'content', 'story'));
    const actors = story.actors ?? content.actors;
    const actor = row(Array.isArray(actors) ? actors[0] : null);
    if (String(actor.id) !== this.targetId) return;
    const externalId = text(story.post_id ?? content.post_id);
    if (!externalId || !/^(?:\d+|pfbid[A-Za-z0-9]+)$/.test(externalId)) return;
    if (!this.messages.has(externalId) && this.messages.size >= this.maxPosts) return;
    const seconds = facebookCount(
      story.creation_time ?? at(story, 'comet_sections', 'timestamp', 'story', 'creation_time')
    );
    const ufiStory = row(
      at(story, 'comet_sections', 'feedback', 'story', 'story_ufi_container', 'story')
    );
    const feedback = row(at(ufiStory, 'feedback_context', 'feedback_target_with_context'));
    const summary = row(at(feedback, 'comet_ufi_summary_and_actions_renderer', 'feedback'));
    const actionFeedback = (
      Array.isArray(summary.adaptive_ufi_action_renderers)
        ? summary.adaptive_ufi_action_renderers
        : []
    ).map((item) => row(row(item).feedback));
    const findCount = (...paths: string[][]): number | null => {
      for (const source of [summary, ...actionFeedback, feedback, row(story.feedback)]) {
        for (const path of paths) {
          const value = facebookCount(at(source, ...path));
          if (value !== null) return value;
        }
      }
      return null;
    };
    const reactions: Record<string, number> = {};
    const reactionEdges = at(summary, 'top_reactions', 'edges');
    for (const edge of Array.isArray(reactionEdges) ? reactionEdges : []) {
      const kind =
        text(at(edge, 'node', 'reaction_type')) ??
        text(at(edge, 'node', 'id')) ??
        text(at(edge, 'node', 'localized_name'));
      const count = facebookCount(row(edge).reaction_count);
      if (kind && count !== null) reactions[kind] = count;
    }
    const mediaUrls: string[] = [];
    let mediaType = 'text';
    // Only attachments of the original post; do not count a reshared story's metrics or author.
    let videoViews: number | null = null;
    walk([story.attachments, content.attachments], (item) => {
      if (item.__typename === 'Video') mediaType = 'video';
      if (item.__typename === 'Photo' && mediaType !== 'video') mediaType = 'photo';
      if (item.__typename === 'Video')
        videoViews = facebookCount(item.video_view_count ?? item.view_count) ?? videoViews;
      for (const value of [
        at(item, 'photo_image', 'uri'),
        at(item, 'image', 'uri'),
        at(item, 'preferred_thumbnail', 'image', 'uri'),
      ]) {
        if (typeof value === 'string' && /^https:\/\//.test(value)) mediaUrls.push(value);
      }
    });
    const previous = this.messages.get(externalId);
    const messageText =
      text(at(content, 'message', 'text')) ??
      text(at(content, 'comet_sections', 'message', 'story', 'message', 'text')) ??
      text(at(story, 'message', 'text'));
    const raw: Row = {
      pageId: this.targetId,
      authorId: this.targetId,
      mediaType,
      mediaUrls: [...new Set(mediaUrls)],
      permalink:
        text(story.permalink_url) ??
        text(ufiStory.permalink_url) ??
        `${normalizeFacebookProfileUrl(this.address)}/posts/${externalId}`,
      reactionsCount: findCount(['reaction_count', 'count'], ['reactors', 'count']),
      likesCount: null,
      commentsCount: findCount(
        ['comment_rendering_instance', 'comments', 'total_count'],
        ['comments', 'total_count']
      ),
      sharesCount: findCount(['share_count', 'count']),
      viewsCount: facebookCount(ufiStory.view_count ?? story.video_view_count) ?? videoViews,
      reactions,
    };
    // Later partial fragments cannot erase an already captured public field.
    if (previous)
      for (const [key, value] of Object.entries(raw))
        if (
          value === null ||
          (Array.isArray(value) && !value.length) ||
          (key === 'reactions' && !Object.keys(row(value)).length)
        )
          raw[key] = previous.raw?.[key] ?? value;
    this.messages.set(externalId, {
      platformKey: 'facebook',
      externalId,
      text: messageText ?? previous?.text ?? null,
      publishedAt:
        seconds === null ? (previous?.publishedAt ?? null) : new Date(seconds * 1000).toISOString(),
      raw,
    });
  }

  snapshot(): CrawlerChannelCrawlResult {
    return {
      profile: this.profile ? { ...this.profile, raw: { ...this.profile.raw } } : null,
      messages: [...this.messages.values()]
        .sort(
          (a, b) =>
            Date.parse(String(b.publishedAt ?? '')) - Date.parse(String(a.publishedAt ?? ''))
        )
        .map((item) => ({ ...item, raw: { ...item.raw } })),
    };
  }
}
