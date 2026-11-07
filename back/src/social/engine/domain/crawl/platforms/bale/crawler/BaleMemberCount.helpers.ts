export interface BaleDisplayedCount {
  parsedCount: number;
  minimum: number;
  maximum: number;
  abbreviated: boolean;
}

const normalizeDigits = (value: string): string => value
  .replace(/[۰٠]/g, '0').replace(/[۱١]/g, '1').replace(/[۲٢]/g, '2')
  .replace(/[۳٣]/g, '3').replace(/[۴٤]/g, '4').replace(/[۵٥]/g, '5')
  .replace(/[۶٦]/g, '6').replace(/[۷٧]/g, '7').replace(/[۸٨]/g, '8')
  .replace(/[۹٩]/g, '9').replace(/[٫]/g, '.').replace(/[,\u066C]/g, '');

export const parseBaleDisplayedMemberCount = (value: string | null): BaleDisplayedCount | null => {
  if (!value) return null;
  const match = normalizeDigits(value).match(/([\d.]+)\s*([KkMm])?/);
  if (!match) return null;
  const multiplier = match[2]?.toLowerCase() === 'm' ? 1_000_000
    : match[2]?.toLowerCase() === 'k' ? 1_000 : 1;
  const numeric = Number.parseFloat(match[1]);
  if (!Number.isFinite(numeric)) return null;
  const decimals = match[1].split('.')[1]?.length ?? 0;
  const parsedCount = Math.round(numeric * multiplier);
  const halfStep = multiplier / (2 * (10 ** decimals));
  return {
    parsedCount,
    minimum: Math.max(0, Math.ceil(parsedCount - halfStep)),
    maximum: Math.ceil(parsedCount + halfStep),
    abbreviated: multiplier > 1,
  };
};

const readVarint = (bytes: Buffer, offset: number): { nextOffset: number; value: number } | null => {
  let value = 0;
  let multiplier = 1;
  for (let index = offset; index < Math.min(bytes.length, offset + 8); index++) {
    const byte = bytes[index];
    value += (byte & 0x7f) * multiplier;
    if (!Number.isSafeInteger(value)) return null;
    if ((byte & 0x80) === 0) return { nextOffset: index + 1, value };
    multiplier *= 128;
  }
  return null;
};

const readMemberCountCandidates = (bytes: Buffer): number[] => {
  const values = new Set<number>();
  for (let offset = 0; offset < bytes.length; offset++) {
    // Bale channel info encodes the audience metric as protobuf field 10,
    // containing a single field-1 varint: 52 <length> 08 <count>.
    if (bytes[offset] !== 0x52) continue;
    const length = readVarint(bytes, offset + 1);
    if (!length || bytes[length.nextOffset] !== 0x08) continue;
    const count = readVarint(bytes, length.nextOffset + 1);
    if (!count || count.nextOffset !== length.nextOffset + length.value) continue;
    values.add(count.value);
  }
  return [...values];
};

export const extractExactBaleMemberCount = (
  frames: Buffer[],
  membersText: string | null,
  identityValues: Array<string | null>,
): number | null => {
  const displayed = parseBaleDisplayedMemberCount(membersText);
  if (!displayed) return null;
  if (!displayed.abbreviated) return displayed.parsedCount;

  const identities = identityValues
    .map((value) => value?.trim().toLocaleLowerCase('en-US') ?? '')
    .filter(Boolean);
  const matches = new Set<number>();

  for (const frame of frames) {
    const frameText = frame.toString('utf8').toLocaleLowerCase('en-US');
    if (identities.length && !identities.some((identity) => frameText.includes(identity))) continue;
    for (const candidate of readMemberCountCandidates(frame)) {
      if (candidate >= displayed.minimum && candidate < displayed.maximum) matches.add(candidate);
    }
  }

  return matches.size === 1 ? [...matches][0] : null;
};
