"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ImpersonationBanner() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function returnToSuperAdmin() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/platform/impersonation/stop", { method: "POST", cache: "no-store" });
      if (!response.ok) throw new Error("بازگشت به حساب سوپر ادمین انجام نشد.");
      router.replace("/platform/admins");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "بازگشت انجام نشد.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="impersonation-banner" role="status">
      <span>در حال مشاهدهٔ سامانه با دسترسی ادمین هستید. نشست سوپر ادمین محفوظ است.</span>
      {error && <span role="alert">{error}</span>}
      <button type="button" onClick={() => void returnToSuperAdmin()} disabled={pending}>{pending ? "در حال بازگشت…" : "بازگشت به سوپر ادمین"}</button>
    </div>
  );
}
