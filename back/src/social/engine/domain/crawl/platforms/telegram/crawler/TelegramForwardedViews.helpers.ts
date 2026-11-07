export type TelegramViewCandidate = {
  timestamp: number;
  isForwarded: boolean;
  viewsCount: number | null;
};

export type TelegramNormalizedViews = {
  displayedViewsCount: number | null;
  effectiveViewsCount: number | null;
  viewsEstimationMethod: 'telegram-displayed' | 'adjacent-native-average' | 'adjacent-native-fallback' | 'unavailable';
};

export const normalizeTelegramViews = <T extends TelegramViewCandidate>(messages: T[]): Array<T & TelegramNormalizedViews> =>
  messages.map((message, index) => {
    const displayedViewsCount = message.viewsCount;
    if (!message.isForwarded) {
      return { ...message, displayedViewsCount, effectiveViewsCount: displayedViewsCount, viewsEstimationMethod: 'telegram-displayed' };
    }

    const before = messages.slice(0, index).reverse().find((candidate) => !candidate.isForwarded && candidate.viewsCount !== null);
    const after = messages.slice(index + 1).find((candidate) => !candidate.isForwarded && candidate.viewsCount !== null);
    const neighbors = [before?.viewsCount, after?.viewsCount].filter((value): value is number => value !== null && value !== undefined);

    if (neighbors.length === 2) {
      return {
        ...message,
        displayedViewsCount,
        effectiveViewsCount: Math.round((neighbors[0] + neighbors[1]) / 2),
        viewsEstimationMethod: 'adjacent-native-average',
      };
    }
    if (neighbors.length === 1) {
      return { ...message, displayedViewsCount, effectiveViewsCount: neighbors[0], viewsEstimationMethod: 'adjacent-native-fallback' };
    }
    return { ...message, displayedViewsCount, effectiveViewsCount: null, viewsEstimationMethod: 'unavailable' };
  });

