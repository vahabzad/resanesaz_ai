export function normalizeTikTokProfileUrl(value: string): string {
  const input = value.trim();
  const fail = () => {
    throw new Error('Enter a TikTok username or direct HTTPS profile URL');
  };
  let username: string;
  if (/^https?:\/\//i.test(input)) {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      return fail();
    }
    if (
      url.protocol !== 'https:' ||
      !['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.port
    )
      return fail();
    const match = /^\/@([A-Za-z0-9_.]+)\/?$/.exec(url.pathname);
    if (!match) return fail();
    username = match[1];
  } else username = input.replace(/^@/, '');
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.]{0,23}$/.test(username) || username.endsWith('.'))
    return fail();
  return `https://www.tiktok.com/@${username.toLowerCase()}`;
}
