import { launchSocialBrowser } from "../../../../../../browser-runtime";
export async function openTikTokChrome(headless = true) { return launchSocialBrowser("tiktok", "about:blank", headless, false); }
