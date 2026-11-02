"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import type { MediaRequest } from "@/lib/contracts/media-requests";

export function useMediaRequest(mediaId: string) {
  const [state, setState] = useState<{ mediaId: string; request: MediaRequest | null; error: boolean }>({ mediaId, request: null, error: false });
  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      try { const request = await apiRequest<MediaRequest>("/api/v1/media/request", undefined, undefined, { signal: controller.signal }); if (!controller.signal.aborted) setState({ mediaId, request, error: false }); }
      catch { if (!controller.signal.aborted) setState({ mediaId, request: null, error: true }); }
    }
    void refresh(); const timer = setInterval(() => void refresh(), 15000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [mediaId]);
  return state.mediaId === mediaId ? state : { mediaId, request: null, error: false };
}
export function MediaRequestStatus({ request, error }: { request: MediaRequest | null; error: boolean }) {
  const message = error ? "دریافت وضعیت درخواست رسانه ناموفق بود؛ اتصال را بررسی کنید." : !request ? "در حال دریافت وضعیت درخواست رسانه…" : request.status === "approved" ? "درخواست رسانه تأیید شده است؛ سایت‌ساز در دسترس شماست." : request.status === "pending" ? "درخواست ایجاد رسانه در انتظار تأیید سوپر ادمین است. تا تأیید، سایت‌ساز و بررسی منابع متوقف می‌مانند." : request.status === "rejected" ? "درخواست ایجاد رسانه رد شده است؛ سایت‌ساز فعال نیست." : "درخواست رسانه هنوز برای بررسی نهایی ارسال نشده است.";
  return <section className={`media-request-status ${request?.status ?? "loading"}`} aria-live="polite"><b>وضعیت درخواست رسانه</b><p>{message}</p>{request?.reviewNote && <p>یادداشت سوپر ادمین: {request.reviewNote}</p>}</section>;
}
