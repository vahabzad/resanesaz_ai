import type { SocialPlatform } from "./social-platforms.js";
export type SocialLoginState = {
  platform: SocialPlatform;
  status: "idle" | "opening" | "open" | "closing" | "closed" | "failed";
  startedAt: string | null;
  finishedAt: string | null;
  errorCode: string | null;
};
export type SocialSessionsWorkspace = { interactiveLoginEnabled: boolean; sessions: SocialLoginState[] };
