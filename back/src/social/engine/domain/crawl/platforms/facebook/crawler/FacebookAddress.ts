const reserved = new Set([
  'search',
  'login',
  'checkpoint',
  'groups',
  'watch',
  'reel',
  'reels',
  'photo',
  'photos',
  'profile.php',
  'permalink.php',
  'story.php',
  'home.php',
  'help',
  'settings',
  'messages',
  'notifications',
  'share',
  'sharer.php',
  'marketplace',
  'gaming',
  'friends',
  'events',
]);

export function normalizeFacebookProfileUrl(address: string): string {
  const input = address.trim();
  let username = input.replace(/^@/, '');
  if (/^https?:\/\//i.test(input)) {
    const url = new URL(input);
    if (
      url.protocol !== 'https:' ||
      !['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com'].includes(
        url.hostname
      ) ||
      url.username ||
      url.password ||
      url.port
    ) {
      throw new Error('Facebook page must use an HTTPS facebook.com URL');
    }
    if (url.pathname === '/profile.php' && /^\d+$/.test(url.searchParams.get('id') ?? '')) {
      return `https://www.facebook.com/profile.php?id=${url.searchParams.get('id')}`;
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 1)
      throw new Error('Use a direct Facebook page URL, not a search or post link');
    username = parts[0];
  }
  if (!/^[a-zA-Z0-9.]{1,100}$/.test(username) || reserved.has(username.toLowerCase())) {
    throw new Error('Use a public Facebook page username or direct page URL');
  }
  return `https://www.facebook.com/${username}`;
}

export function facebookProfileKey(address: string): string {
  const url = new URL(normalizeFacebookProfileUrl(address));
  return (url.searchParams.get('id') ?? url.pathname.slice(1)).toLowerCase();
}
