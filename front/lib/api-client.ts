export async function apiRequest<T>(path: string, body?: unknown, method?: "POST" | "PATCH" | "DELETE", options?: { signal?: AbortSignal }): Promise<T> {
  const response = await fetch(path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: options?.signal,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? "انجام درخواست ناموفق بود.");
  return result.data as T;
}
