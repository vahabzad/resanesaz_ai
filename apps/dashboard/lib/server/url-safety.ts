import "server-only";

import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { Agent, request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { isPrivateOrReservedIp } from "@/lib/security/network";

export class UnsafeSourceUrlError extends Error {
  constructor(message = "Source URL is not allowed.") {
    super(message);
    this.name = "UnsafeSourceUrlError";
  }
}

async function resolvePublicHttpsUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeSourceUrlError("Source URL is invalid.");
  }

  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new UnsafeSourceUrlError();
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".local")) throw new UnsafeSourceUrlError();

  if (isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) throw new UnsafeSourceUrlError();
    return { url, addresses: [{ address: hostname, family: isIP(hostname) }] as LookupAddress[] };
  }

  let addresses: LookupAddress[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeSourceUrlError("Source host could not be resolved.");
  }

  if (!addresses.length || addresses.some(({ address }) => isPrivateOrReservedIp(address))) {
    throw new UnsafeSourceUrlError();
  }

  return { url, addresses };
}

export async function assertPublicHttpsUrl(input: string) {
  return (await resolvePublicHttpsUrl(input)).url;
}

function pinnedHttpsGet(url: URL, addresses: LookupAddress[], timeoutMs: number, maxBytes: number) {
  return new Promise<{ status: number; location: string | null; body: string }>((resolve, reject) => {
    const pinned = addresses[0];
    const agent = new Agent({
      keepAlive: false,
      lookup(_hostname, options, callback) {
        if (options.all) callback(null, addresses);
        else callback(null, pinned.address, pinned.family);
      },
    });
    const request = httpsRequest(url, {
      agent,
      method: "GET",
      headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9" },
    }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location ?? null;
      if (status >= 300 && status < 400) {
        response.resume();
        resolve({ status, location, body: "" });
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`UPSTREAM_${status}`));
        return;
      }

      const contentLength = Number(response.headers["content-length"] ?? 0);
      if (contentLength > maxBytes) {
        response.destroy(new Error("RESPONSE_TOO_LARGE"));
        return;
      }

      const chunks: Buffer[] = [];
      let received = 0;
      response.on("data", (chunk: Buffer) => {
        received += chunk.byteLength;
        if (received > maxBytes) response.destroy(new Error("RESPONSE_TOO_LARGE"));
        else chunks.push(chunk);
      });
      response.on("end", () => resolve({ status, location, body: Buffer.concat(chunks).toString("utf8") }));
      response.on("error", reject);
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error("UPSTREAM_TIMEOUT")));
    request.on("error", reject);
    request.on("close", () => agent.destroy());
    request.end();
  });
}

export async function fetchPublicXml(input: string, options?: { timeoutMs?: number; maxBytes?: number }) {
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const maxBytes = options?.maxBytes ?? 2_000_000;
  let current = input;

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const { url: safeUrl, addresses } = await resolvePublicHttpsUrl(current);
    const response = await pinnedHttpsGet(safeUrl, addresses, timeoutMs, maxBytes);

    if (response.status >= 300 && response.status < 400) {
      const location = response.location;
      if (!location || redirects === 3) throw new Error("REDIRECT_LIMIT");
      current = new URL(location, safeUrl).toString();
      continue;
    }
    if (!response.body) throw new Error("EMPTY_RESPONSE");
    return { body: response.body, finalUrl: safeUrl.toString() };
  }

  throw new Error("REDIRECT_LIMIT");
}
