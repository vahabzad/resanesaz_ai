export type RubikaPost = {
    msgId: string;
    text: string | null;
    reactionsText: string | null;
    reactions?: Array<{
        reaction: string | null;
        count: string | null;
    }>;
    metaText: string | null;
    time: string | null;
    viewCount: string | null;
    viewsCount?: number | null;
    isForwarded?: boolean;
    forwardedFromName?: string | null;
    originalViewCount?: string | null;
    originalViewsCount?: number | null;
    viewsCountEstimated?: boolean;
    viewEstimateSource?: {
        upperMessageId: string;
        upperViewsCount: number;
        lowerMessageId: string;
        lowerViewsCount: number;
    } | null;
    publishedDateText?: string | null;
    mediaType?: string | null;
    mediaUrls?: string[];
    publishedAt: string | null;
};
