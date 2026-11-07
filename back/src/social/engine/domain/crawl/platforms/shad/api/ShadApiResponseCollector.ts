import type { HTTPResponse, Page } from "puppeteer-core";
import { decryptShadApiPayload, transformShadV6Auth } from "./ShadApiCrypto";
import { isRecord, type ShadDecryptedApiResponse } from "./ShadApi.types";

export class ShadApiResponseCollector {
  private responses: ShadDecryptedApiResponse[] = [];
  private pending = new Set<Promise<void>>();
  private readonly onResponse = (response: HTTPResponse) => {
    if (!this.isShadApiResponse(response)) return;
    const capture = this.capture(response).finally(() =>
      this.pending.delete(capture),
    );
    this.pending.add(capture);
  };

  constructor(private readonly page: Page) {}

  attach(): void {
    this.page.on("response", this.onResponse);
  }

  detach(): void {
    this.page.off("response", this.onResponse);
  }

  reset(): void {
    this.responses = [];
  }

  async snapshot(): Promise<ShadDecryptedApiResponse[]> {
    await Promise.allSettled([...this.pending]);
    return [...this.responses];
  }

  private async capture(response: HTTPResponse): Promise<void> {
    try {
      const requestBody = this.parseRecord(response.request().postData());
      const responseBody = this.parseRecord(
        await response.text().catch(() => ""),
      );
      if (
        !requestBody ||
        !responseBody ||
        typeof responseBody.data_enc !== "string"
      )
        return;
      if (typeof requestBody.auth !== "string") return;

      const apiVersion = String(requestBody.api_version ?? "");
      const auth =
        apiVersion === "6"
          ? transformShadV6Auth(requestBody.auth)
          : requestBody.auth;
      const payload = decryptShadApiPayload(responseBody.data_enc, auth);
      if (!isRecord(payload) || !this.isChannelPayload(payload)) return;

      this.responses.push({
        capturedAt: new Date().toISOString(),
        url: response.url(),
        httpStatus: response.status(),
        apiVersion: apiVersion || null,
        payload,
      });
    } catch {
      // Shad also makes unrelated encrypted calls while the channel is open.
      // A single undecipherable response must not abort the crawl.
    }
  }

  private isChannelPayload(payload: Record<string, unknown>): boolean {
    const data = payload.data;
    if (!isRecord(data)) return false;
    return (
      isRecord(data.channel) ||
      Array.isArray(data.messages) ||
      Array.isArray(data.updated_messages)
    );
  }

  private isShadApiResponse(response: HTTPResponse): boolean {
    return (
      ["xhr", "fetch"].includes(response.request().resourceType()) &&
      /^https:\/\/[^/]*iranlms\.ir\/?/i.test(response.url())
    );
  }

  private parseRecord(
    value: string | undefined,
  ): Record<string, unknown> | null {
    if (!value) return null;
    try {
      const parsed: unknown = JSON.parse(value);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}
