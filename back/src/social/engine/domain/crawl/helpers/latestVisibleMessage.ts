const timestampOf = (value: Date | string | number | null | undefined): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value === 'string' && value.trim()) return new Date(value).getTime();
  return Number.NaN;
};

const compareNumericIds = (left: string, right: string): number => {
  if (!/^\d+$/.test(left) || !/^\d+$/.test(right)) return 0;
  const leftId = BigInt(left);
  const rightId = BigInt(right);
  return leftId === rightId ? 0 : leftId > rightId ? 1 : -1;
};

export const pickLatestVisibleItem = <T>(
  items: readonly T[],
  getPublishedAt: (item: T) => Date | string | number | null | undefined,
  getExternalId: (item: T) => string,
): T | null => items.reduce<T | null>((latest, item) => {
  if (!latest) return item;
  const latestTimestamp = timestampOf(getPublishedAt(latest));
  const itemTimestamp = timestampOf(getPublishedAt(item));
  if (Number.isFinite(latestTimestamp) && Number.isFinite(itemTimestamp)) {
    if (itemTimestamp !== latestTimestamp) return itemTimestamp > latestTimestamp ? item : latest;
  } else if (Number.isFinite(itemTimestamp)) {
    return item;
  } else if (Number.isFinite(latestTimestamp)) {
    return latest;
  }

  const idComparison = compareNumericIds(getExternalId(item), getExternalId(latest));
  return idComparison >= 0 ? item : latest;
}, null);
