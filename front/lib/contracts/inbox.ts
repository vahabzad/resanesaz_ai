export type InboxArticle = {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  summary: string | null;
  canonicalUrl: string;
  status: "new" | "quarantined";
  quarantineReason: string | null;
  publishedAt: string | null;
  ingestedAt: string;
};

export type InboxWorkspace = {
  articles: InboxArticle[];
  stats: {
    total: number;
    newCount: number;
    quarantined: number;
    sources: number;
  };
};
