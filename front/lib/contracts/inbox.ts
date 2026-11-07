export type InboxArticle = {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  summary: string | null;
  categories: string[];
  canonicalUrl: string;
  status: "new" | "quarantined";
  quarantineReason: string | null;
  publishedAt: string | null;
  ingestedAt: string;
};

export type InboxArticleDetail = InboxArticle & { content: string | null; author: string | null };

export type InboxWorkspace = {
  articles: InboxArticle[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  sources: { id: string; name: string }[];
  categories: string[];
  stats: {
    total: number;
    newCount: number;
    quarantined: number;
    sources: number;
  };
};
