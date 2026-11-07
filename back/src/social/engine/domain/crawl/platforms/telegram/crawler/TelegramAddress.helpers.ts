import { ErrorResult } from '../../../../../helper/error.tool';

export interface TelegramWebChannelAddress {
  username: string;
  url: string;
}

export function resolveTelegramWebChannelAddress(address: string): TelegramWebChannelAddress {
  const trimmed = address.trim();
  const usernameMatch = trimmed.match(/^@?([A-Za-z0-9_]+)$/);
  if (usernameMatch) {
    const username = usernameMatch[1];
    return { username, url: `https://web.telegram.org/k/#@${username}` };
  }

  try {
    const url = new URL(trimmed);
    const hashMatch = url.hash.match(/^#@([A-Za-z0-9_]+)$/);
    if (url.hostname === 'web.telegram.org' && hashMatch) {
      const username = hashMatch[1];
      return { username, url: `https://web.telegram.org/k/#@${username}` };
    }
  } catch { /* validated below */ }

  throw ErrorResult.badRequest(
    'Telegram channel address must be a username or a full https://web.telegram.org/k/#@username URL'
  );
}
