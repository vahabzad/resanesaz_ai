import { config } from "dotenv";
config({ path: ".env.local" });
import { isSocialPlatform, browserHome } from "../src/social/platforms";
import { withBrowserRuntime, launchSocialBrowser } from "../src/social/browser-runtime";

const platform = process.argv[2];
if (!platform || !isSocialPlatform(platform)) throw new Error("Usage: npm run social:login -- telegram (or another supported platform key)");
const signal = AbortSignal.timeout(20 * 60_000);
console.info("ورود را در پنجرهٔ مرورگر کامل کنید؛ سپس تمام پنجره‌های این پروفایل را ببندید. بازشدن مرورگر به معنی تأیید ورود نیست.");
await withBrowserRuntime(platform, signal, async () => {
  const { browser } = await launchSocialBrowser(platform, browserHome[platform], false);
  await new Promise<void>(resolve => browser.once("disconnected", resolve));
}, true);
