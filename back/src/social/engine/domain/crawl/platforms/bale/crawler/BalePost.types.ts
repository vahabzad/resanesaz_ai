export interface BalePost {
  msgId: string;
  text: string | null;
  publishedAt: string | null;
  time: string | null;
  viewCount: string | null;
  viewsCount: number | null;
  commentCount: string | null;
  commentsCount: number | null;
  metricsAvailable: boolean;
  reactions: Array<{ reaction: string | null; count: string | null }>;
  reactionsAvailable: boolean;
  mediaType: string | null;
  mediaUrls: string[];
  isForwarded: boolean;
}
