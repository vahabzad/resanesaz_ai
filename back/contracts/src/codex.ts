export type CodexSdkStatus = {
  status: "connected" | "authenticated" | "disconnected" | "not_configured" | "unknown";
  authenticationMode: "chatgpt" | "api_key" | null;
  inferenceVerified: boolean;
  model: string | null;
  modelSource: "crawler_config" | "codex_config" | null;
  message: string;
  checkedAt: string;
};
