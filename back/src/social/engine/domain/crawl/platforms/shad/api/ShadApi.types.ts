export interface ShadDecryptedApiResponse {
  capturedAt: string;
  url: string;
  httpStatus: number;
  apiVersion: string | null;
  payload: Record<string, unknown>;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
