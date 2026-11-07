import { config } from "dotenv";
config({ path: ".env.local" });
import { isSocialPlatform } from "../src/social/platforms";
import { runSocialCrawler } from "../src/social/crawler";

const [platform, url] = process.argv.slice(2);
if (!platform || !isSocialPlatform(platform) || !url) throw new Error("Usage: npm run social:check -- aparat https://www.aparat.com/username");
try {
  const result = await runSocialCrawler(platform, url, new AbortController().signal, event => { console.info(event.message); });
  console.info(JSON.stringify({ platform, discovered: result.discovered, extracted: result.articles.length, failed: result.failed, withDate: result.articles.filter(article => article.publishedAt).length, withImage: result.articles.filter(article => article.imageUrl).length }));
  if (result.failed) process.exitCode = 1;
} catch (error) {
  // Browser errors can contain session URLs. Print only a known error code.
  const code = error && typeof error === "object" && "code" in error && /^[A-Z_]{1,80}$/.test(String(error.code)) ? String(error.code) : "SOCIAL_CHECK_FAILED";
  console.error(code); process.exitCode = 1;
}
