export type ApiErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR";

export function correlationId(request: Request) {
  const incoming = request.headers.get("x-request-id");
  return incoming && /^[a-zA-Z0-9_.:-]{8,100}$/.test(incoming) ? incoming : crypto.randomUUID();
}
export function apiSuccess<T>(data: T, requestId: string, status = 200) {
  return Response.json(
    { contractVersion: "1", data, meta: { correlationId: requestId } },
    { status, headers: { "x-request-id": requestId, "cache-control": "no-store" } },
  );
}

export function apiError(code: ApiErrorCode, message: string, requestId: string, status: number) {
  return Response.json(
    { contractVersion: "1", error: { code, message }, meta: { correlationId: requestId } },
    { status, headers: { "x-request-id": requestId, "cache-control": "no-store" } },
  );
}
