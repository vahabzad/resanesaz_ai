import { headers } from "next/headers";

type ApiEnvelope<T> = {
  data?: T;
  error?: { code: string; message: string };
};

const internalBackendUrl = process.env.BACKEND_INTERNAL_URL ?? process.env.BACKEND_URL ?? "http://127.0.0.1:4000";

export async function backendGet<T>(path: string): Promise<T | null> {
  const requestHeaders = await headers();
  const response = await fetch(new URL(path, internalBackendUrl), {
    cache: "no-store",
    headers: {
      cookie: requestHeaders.get("cookie") ?? "",
      "x-request-id": requestHeaders.get("x-request-id") ?? crypto.randomUUID(),
    },
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Backend request failed with ${response.status}`);
  const envelope = await response.json() as ApiEnvelope<T>;
  if (envelope.data === undefined) throw new Error(envelope.error?.message ?? "Backend response did not contain data.");
  return envelope.data;
}
