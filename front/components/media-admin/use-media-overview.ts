"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaOverview } from "@/lib/contracts/media-overview";
import { apiRequest } from "@/lib/api-client";
export function useMediaOverview(mediaId: string) {
  const [saved, setSaved] = useState<MediaOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++sequence.current; setLoading(true);
    try {
      const result = await apiRequest<MediaOverview>("/api/v1/media/overview");
      if (current === sequence.current && result.mediaId === mediaId) { setSaved(result); setError(""); }
    } catch (cause) { if (current === sequence.current) setError(cause instanceof Error ? cause.message : "دریافت وضعیت رسانه ناموفق بود."); throw cause; }
    finally { if (current === sequence.current) setLoading(false); }
  }, [mediaId]);
  useEffect(() => {
    const controller = new AbortController();
    async function receive() {
      const current = ++sequence.current;
      try { const result = await apiRequest<MediaOverview>("/api/v1/media/overview", undefined, undefined, { signal: controller.signal }); if (!controller.signal.aborted && current === sequence.current && result.mediaId === mediaId) { setSaved(result); setError(""); } }
      catch (cause) { if (!controller.signal.aborted && current === sequence.current) setError(cause instanceof Error ? cause.message : "دریافت وضعیت رسانه ناموفق بود."); }
      finally { if (!controller.signal.aborted && current === sequence.current) setLoading(false); }
    }
    void receive(); const timer = setInterval(() => void receive(), 30000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [mediaId]);
  return { overview: saved?.mediaId === mediaId ? saved : null, error, loading, refresh };
}
