export type PlatformArticleFilters = { query: string; sourceId: string; category: string; status: string };
export type PlatformArticlesWorkspace = {
  articles: Array<{
    id: string; sourceId: string; sourceName: string; title: string; canonicalUrl: string;
    categories: string[]; status: string; quarantineReason: string | null;
    publishedAt: string | null; ingestedAt: string;
  }>;
  total: number; page: number; pageSize: number; pageCount: number;
  sources: Array<{ id: string; name: string }>;
  categories: string[];
};
export type ArticleDeletionPreview = {
  token: string; articleCount: number; inboxCount: number; cutoff: string;
  mode: "all" | "filtered"; filters: PlatformArticleFilters;
};
export type PlatformArticleDetail = PlatformArticlesWorkspace["articles"][number] & {
  summary: string | null; content: string | null; imageUrl: string | null;
  inlineImageUrls: string[]; author: string | null; crawlRunId: string;
};
