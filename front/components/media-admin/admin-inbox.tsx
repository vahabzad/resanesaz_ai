"use client";
import { useCallback, useEffect, useState } from "react";
import { InboxView } from "@/components/inbox-view";
import { apiRequest } from "@/lib/api-client";
import type { InboxWorkspace } from "@/lib/contracts/inbox";
export function AdminInbox() {
  const [workspace, setWorkspace] = useState<InboxWorkspace | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => { try { const result = await apiRequest<InboxWorkspace>("/api/v1/articles"); setWorkspace(result); setError(""); } catch (cause) { setWorkspace(null); setError(cause instanceof Error ? cause.message : "دریافت خبرها انجام نشد."); } }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function receive() {
      try { const result = await apiRequest<InboxWorkspace>("/api/v1/articles", undefined, undefined, { signal: controller.signal }); if (!controller.signal.aborted) { setWorkspace(result); setError(""); } }
      catch (cause) { if (!controller.signal.aborted) { setWorkspace(null); setError(cause instanceof Error ? cause.message : "دریافت خبرها انجام نشد."); } }
    }
    void receive(); const timer = setInterval(() => void receive(), 30000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  if (error) return <section className="panel admin-empty" role="alert"><p>{error}</p><button className="secondary-button" onClick={() => void load()}>تلاش دوباره</button></section>;
  return workspace ? <InboxView workspace={workspace} /> : <p className="panel admin-empty" role="status">در حال دریافت اخبار ورودی…</p>;
}
