import assert from "node:assert/strict";
import test from "node:test";
import { apiError, apiSuccess, correlationId } from "../lib/api-response";

test("accepts a safe incoming request id and replaces malformed values", () => {
  const safe = "request:phase1-123";
  assert.equal(correlationId(new Request("http://local.test", { headers: { "x-request-id": safe } })), safe);

  const generated = correlationId(new Request("http://local.test", { headers: { "x-request-id": "bad value" } }));
  assert.match(generated, /^[0-9a-f-]{36}$/);
});

test("success envelopes expose the contract version and disable caching", async () => {
  const response = apiSuccess({ activeMediaId: "media_1" }, "request-123");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-request-id"), "request-123");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    contractVersion: "1",
    data: { activeMediaId: "media_1" },
    meta: { correlationId: "request-123" },
  });
});

test("error envelopes remain stable and machine-readable", async () => {
  const response = apiError("FORBIDDEN", "دسترسی ندارید.", "request-403", 403);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    contractVersion: "1",
    error: { code: "FORBIDDEN", message: "دسترسی ندارید." },
    meta: { correlationId: "request-403" },
  });
});
