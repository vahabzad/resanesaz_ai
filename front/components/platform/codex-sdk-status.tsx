"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import type { CodexSdkStatus } from "@/lib/contracts/codex";

const labels: Record<CodexSdkStatus["status"], string> = {
  connected: "متصل", authenticated: "وارد شده", disconnected: "نیازمند ورود", not_configured: "راه‌اندازی نشده", unknown: "وضعیت نامشخص",
};

export function CodexSdkConnectionStatus() {
  const [result, setResult] = useState<CodexSdkStatus | null>(null);
  const [pending, setPending] = useState(true);
  const [open, setOpen] = useState(false);
  const mounted = useRef(false);
  const checking = useRef(false);
  const check = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    try {
      const status = await apiRequest<CodexSdkStatus>("/api/v1/platform/codex/status");
      if (mounted.current) setResult(status);
    } catch {
      if (mounted.current) setResult({ status: "unknown", authenticationMode: null, inferenceVerified: false, model: null, modelSource: null, message: "وضعیت اتصال قابل دریافت نیست. اتصال به بک‌اند و دسترسی حساب را بررسی کنید.", checkedAt: new Date().toISOString() });
    } finally {
      checking.current = false;
      if (mounted.current) setPending(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const initialCheck = setTimeout(() => void check(), 0);
    const timer = setInterval(() => void check(), 30_000);
    return () => { mounted.current = false; clearTimeout(initialCheck); clearInterval(timer); };
  }, [check]);
  const status = result?.status ?? "unknown";
  return <div className="codex-status-wrap" onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
    <button className={`codex-status-button ${status}`} aria-expanded={open} aria-controls="codex-status-details" onClick={() => setOpen((value) => !value)}>
      <span className="codex-status-dot" aria-hidden="true" /><span><b dir="ltr">Codex SDK</b><small role="status">{!result && pending ? "در حال بررسی…" : status === "authenticated" && result?.authenticationMode === "chatgpt" ? "وارد شده با ChatGPT" : labels[status]}</small>{result && <small>مدل: <bdi dir="ltr">{result.model ?? "نامشخص"}</bdi></small>}</span><ChevronDown size={13} />
    </button>
    {open && <div className="codex-status-details" id="codex-status-details"><b>وضعیت اتصال Codex SDK</b><p>{result?.message ?? "در حال دریافت وضعیت از بک‌اند…"}</p>{result && <><small>مدل کراولرساز: <bdi dir="ltr">{result.model ?? "نام مدل قابل تشخیص نیست"}</bdi></small>{result.modelSource && <small>{result.modelSource === "crawler_config" ? "از تنظیم اختصاصی کراولرساز" : "از تنظیمات مؤثر Codex میزبان بک‌اند"}</small>}<small>آخرین بررسی: {new Date(result.checkedAt).toLocaleTimeString("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</small></>}<button disabled={pending} onClick={() => { setPending(true); void check(); }}><RefreshCw size={13} className={pending ? "spin" : ""} />{pending ? "در حال بررسی…" : "بررسی دوباره"}</button></div>}
  </div>;
}
