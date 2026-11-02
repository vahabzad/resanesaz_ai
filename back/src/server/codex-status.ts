import { execFile, spawn } from "node:child_process";
import { access, constants, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { Codex, type CodexOptions } from "@openai/codex-sdk";
import type { CodexSdkStatus } from "@media/contracts/codex";

// Resolve only server configuration/PATH, never an executable supplied by API.
export async function resolveCodexExecutable(): Promise<string | null> {
  const configured = process.env.CODEX_EXECUTABLE;
  const names = process.platform === "win32" ? ["codex.exe"] : ["codex"];
  const candidates = configured ? [configured] : (process.env.PATH ?? "").split(delimiter).filter(Boolean).flatMap((directory) => names.map((name) => join(directory, name)));
  if (!configured) {
    // SDK's pinned native runtime is a fallback when no system CLI is present.
    const targets: Record<string, string> = { "linux-x64": "x86_64-unknown-linux-musl", "linux-arm64": "aarch64-unknown-linux-musl", "darwin-x64": "x86_64-apple-darwin", "darwin-arm64": "aarch64-apple-darwin", "win32-x64": "x86_64-pc-windows-msvc", "win32-arm64": "aarch64-pc-windows-msvc" };
    const target = targets[`${process.platform}-${process.arch}`];
    if (target) try {
      const require = createRequire(import.meta.url);
      const cliRequire = createRequire(require.resolve("@openai/codex/package.json"));
      const packagePath = cliRequire.resolve(`@openai/codex-${process.platform}-${process.arch}/package.json`);
      const root = join(dirname(packagePath), "vendor", target);
      candidates.push(join(root, "bin", names[0]), join(root, "codex", names[0]));
    } catch { /* Missing optional native package is reported as not configured. */ }
  }
  for (const candidate of candidates) {
    if (!isAbsolute(candidate)) continue;
    if (process.platform === "win32" && !candidate.toLowerCase().endsWith(".exe")) continue;
    try { await access(candidate, constants.X_OK); if ((await stat(candidate)).isFile()) return candidate; } catch { /* Try the next PATH directory. */ }
  }
  return null;
}

export async function createLocalCodex(options: Omit<CodexOptions, "codexPathOverride"> = {}): Promise<Codex> {
  const executable = await resolveCodexExecutable();
  if (!executable) throw new Error("CODEX_EXECUTABLE_NOT_FOUND");
  return new Codex({ ...options, codexPathOverride: executable });
}

type LoginProbe = { output: string; exitCode: number | null; failed: boolean };
export function interpretCodexLoginStatus(probe: LoginProbe): CodexSdkStatus {
  const common = { checkedAt: new Date().toISOString(), authenticationMode: null, inferenceVerified: false, model: null, modelSource: null };
  if (!probe.failed && probe.exitCode === 0 && /logged in using chatgpt/i.test(probe.output)) {
    return { ...common, status: "authenticated", authenticationMode: "chatgpt", message: "Codex محلی با ChatGPT وارد شده و SDK برای استفاده از همان اجرا تنظیم شده است. پاسخ‌دهی مدل هنوز آزموده نشده است." };
  }
  if (!probe.failed && probe.exitCode === 0 && /logged in using (an? )?api key/i.test(probe.output)) {
    return { ...common, status: "authenticated", authenticationMode: "api_key", message: "Codex محلی با کلید API وارد شده و SDK برای استفاده از همان اجرا تنظیم شده است. پاسخ‌دهی مدل هنوز آزموده نشده است." };
  }
  if (/not logged in/i.test(probe.output)) return { ...common, status: "disconnected", message: "Codex نصب است اما ورود انجام نشده. روی میزبان بک‌اند codex login یا codex login --device-auth را اجرا کنید." };
  return { ...common, status: "unknown", message: "بررسی ورود Codex ناموفق بود؛ دسترسی کاربر سرویس و تنظیم اجرای Codex را بررسی کنید." };
}

function probeLogin(executable: string): Promise<LoginProbe> {
  return new Promise((resolve) => {
    execFile(executable, ["login", "status"], { windowsHide: true, timeout: 5_000, maxBuffer: 16_384, encoding: "utf8" }, (error, stdout, stderr) => {
      // Raw CLI output may contain API-key fragments. Never log or return it.
      resolve({ output: `${stdout}\n${stderr}`, exitCode: error ? typeof error.code === "number" ? error.code : null : 0, failed: Boolean(error) });
    });
  });
}

let inFlight: Promise<CodexSdkStatus> | null = null;
let lastInferenceAt = 0;
export function recordCodexInferenceSuccess() { lastInferenceAt = Date.now(); }

// Inspect effective CLI configuration for the SDK's actual working directory.
// Never return the raw config: it can contain private provider settings.
export function publicCodexModel(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(value) ? value : null;
}

function probeConfiguredModel(executable: string): Promise<string | null> {
  return new Promise((resolveModel) => {
    const child = spawn(executable, ["app-server"], { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    let buffer = "";
    let bytes = 0;
    let done = false;
    const finish = (model: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill();
      resolveModel(model);
    };
    const timer = setTimeout(() => finish(null), 5_000);
    child.on("error", () => finish(null));
    child.on("exit", () => finish(null));
    child.stdin.on("error", () => finish(null));
    const send = (value: unknown) => { if (!done) child.stdin.write(`${JSON.stringify(value)}\n`); };
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) return finish(null);
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 1) {
          if (message.error) return finish(null);
          send({ method: "initialized", params: {} });
          send({ id: 2, method: "config/read", params: { includeLayers: false, cwd: resolve(".data/crawler-analysis") } });
        } else if (message.id === 2) {
          finish(publicCodexModel(message.result?.config?.model));
        }
      }
    });
    send({ id: 1, method: "initialize", params: { clientInfo: { name: "media-crawler-model-status", version: "0.1.0" } } });
  });
}

export async function getCodexSdkStatus(): Promise<CodexSdkStatus> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const executable = await resolveCodexExecutable();
    const configuredModel = publicCodexModel(process.env.CRAWLER_CODEX_MODEL);
    if (!executable) return { status: "not_configured" as const, authenticationMode: null, inferenceVerified: false, model: configuredModel, modelSource: configuredModel ? "crawler_config" as const : null, message: "اجرای Codex در میزبان بک‌اند پیدا نشد. Codex CLI را نصب یا CODEX_EXECUTABLE را تنظیم کنید.", checkedAt: new Date().toISOString() };
    new Codex({ codexPathOverride: executable });
    const [login, model] = await Promise.all([probeLogin(executable), configuredModel ? Promise.resolve(configuredModel) : probeConfiguredModel(executable)]);
    const status: CodexSdkStatus = { ...interpretCodexLoginStatus(login), model, modelSource: model ? configuredModel ? "crawler_config" : "codex_config" : null };
    if (status.status === "authenticated" && Date.now() - lastInferenceAt < 5 * 60_000) return { ...status, status: "connected" as const, inferenceVerified: true, message: "ورود معتبر است و Codex در پنج دقیقهٔ اخیر برای ساخت کراولر پاسخ معتبر داده است." };
    return status;
  })();
  try { return await inFlight; } finally { inFlight = null; }
}
