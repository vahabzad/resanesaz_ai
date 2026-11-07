export type CrawlerResourceLifecycle = 'process' | 'cycle';

export interface PlatformDefinition {
    key: string;
    title: string;
    crawlerKey: string;
    crawlerResourceLifecycle?: CrawlerResourceLifecycle;
    messageTrackingWindowHours: number | null;
    crawlerIntervalMinutes: number;
    fastCrawlerIntervalMinutes: number | null;
    image: string;
    channelInput: {
        label: string;
        placeholder: string;
        helpText: string;
        example: string;
    };
}

export type PlatformKey = string;

