/// <reference lib="dom" />

/** Only membership controls; channel avatars, story previews and call banners are excluded. */
export const isTelegramMembershipControl = (element: Element): boolean => {
  if (element.closest('.bubble, .avatar, .chat-info, [class*="story" i], [class*="stories" i], [class*="call" i], [class*="live" i], [class*="videochat" i]')) return false;
  return element.matches('.chat-join') || Boolean(element.closest('.chat-input, .chat-utils'));
};

export const TELEGRAM_JOIN_LABELS = [
  'join',
  'join channel',
  'join group',
  'subscribe',
  'عضویت',
  'عضویت در کانال',
  'عضویت در گروه',
  'پیوستن',
  'پیوستن به کانال',
  'پیوستن به گروه',
  'انضمام',
  'الانضمام',
  'rejoindre',
  'beitreten',
  'unirse',
  'katıl',
] as const;

export const TELEGRAM_JOIN_CONFIRMATION_LABELS = [
  'you joined this channel',
] as const;

export const normalizeTelegramActionLabel = (value: string): string => value
  .replace(/[\u200c\u200d\u200e\u200f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/[!…]+$/g, '')
  .toLocaleLowerCase('en-US');

const NORMALIZED_TELEGRAM_JOIN_LABELS = new Set(TELEGRAM_JOIN_LABELS.map(normalizeTelegramActionLabel));

export const isTelegramJoinActionLabel = (value: string): boolean =>
  NORMALIZED_TELEGRAM_JOIN_LABELS.has(normalizeTelegramActionLabel(value));

const NORMALIZED_TELEGRAM_JOIN_CONFIRMATION_LABELS = new Set(
  TELEGRAM_JOIN_CONFIRMATION_LABELS.map(normalizeTelegramActionLabel)
);

export const isTelegramJoinConfirmationLabel = (value: string): boolean =>
  NORMALIZED_TELEGRAM_JOIN_CONFIRMATION_LABELS.has(normalizeTelegramActionLabel(value));
