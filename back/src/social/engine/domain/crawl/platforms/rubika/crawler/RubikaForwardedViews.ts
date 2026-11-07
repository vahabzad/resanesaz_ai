import type { RubikaPost } from './RubikaPost.types';

/**
 * Rubika shows the source channel's view count on forwarded cards. That number
 * is not comparable with the surrounding posts of the channel being crawled.
 * Estimate it from the closest original post on either side instead.
 */
export const estimateForwardedPostViews = (posts: RubikaPost[]): RubikaPost[] => {
  return posts.map((post, index) => {
    if (!post.isForwarded) {
      return post;
    }

    const upperPost = findOriginalPost(posts, index, -1);
    const lowerPost = findOriginalPost(posts, index, 1);
    const upperViews = upperPost?.viewsCount ?? null;
    const lowerViews = lowerPost?.viewsCount ?? null;
    const hasBothNeighbors = upperViews !== null && lowerViews !== null;
    const estimatedViews = hasBothNeighbors
      ? Math.round((upperViews + lowerViews) / 2)
      : null;

    return {
      ...post,
      originalViewCount: post.originalViewCount ?? post.viewCount,
      originalViewsCount: post.originalViewsCount ?? post.viewsCount ?? null,
      // Never fall back to the forwarded card's own/source-channel count.
      viewCount: estimatedViews === null ? null : String(estimatedViews),
      viewsCount: estimatedViews,
      viewsCountEstimated: estimatedViews !== null,
      viewEstimateSource: hasBothNeighbors && upperPost && lowerPost
        ? {
            upperMessageId: upperPost.msgId,
            upperViewsCount: upperViews,
            lowerMessageId: lowerPost.msgId,
            lowerViewsCount: lowerViews,
          }
        : null,
    };
  });
};

const findOriginalPost = (
  posts: RubikaPost[],
  startIndex: number,
  direction: -1 | 1
): RubikaPost | null => {
  for (let index = startIndex + direction; index >= 0 && index < posts.length; index += direction) {
    const candidate = posts[index];
    if (!candidate.isForwarded && candidate.viewsCount !== null && candidate.viewsCount !== undefined) {
      return candidate;
    }
  }

  return null;
};
