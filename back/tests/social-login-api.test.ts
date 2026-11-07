import type { SocialPlatform } from "../contracts/src/social-platforms";
import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";

test("social login actions require platform authorization, trusted origin, fixed platform and an audit", async t => {
  process.env.DATABASE_DRIVER = "pglite";
  process.env.PGLITE_DATA_DIR = "unused-social-login-test";
  process.env.BETTER_AUTH_SECRET = "social-login-api-test-only-secret-32-characters";
  const client = new PGlite(); globalThis.__mediaCommandPglite = client;
  const database = drizzle({ client, schema }); await migrate(database, { migrationsFolder: "./db/migrations" });
  const { auth } = await import("../src/server/auth");
  const { handleApiRequest } = await import("../src/router");
  const { socialLoginManager } = await import("../src/social/login-manager");
  let actor: string | null = null, opened = 0, closed = 0;
  t.mock.method(auth.api, "getSession", async () => actor ? { user: { id: actor, name: actor, email: `${actor}@example.test` }, session: {} } : null);
  t.mock.method(socialLoginManager, "start", (platform: SocialPlatform) => { opened++; return { platform, status: "opening", startedAt: new Date().toISOString(), finishedAt: null, errorCode: null }; });
  t.mock.method(socialLoginManager, "close", async (platform: SocialPlatform) => { closed++; return { platform, status: "closed", startedAt: null, finishedAt: new Date().toISOString(), errorCode: null }; });
  const request = (path = "", method = "GET", body: unknown = {}, origin = "http://local.test") => handleApiRequest(new Request(`http://local.test/api/v1/platform/social-browser-sessions${path}`, { method, headers: { origin, "content-type": "application/json" }, body: method === "GET" ? undefined : JSON.stringify(body) }));
  try {
    await database.insert(schema.user).values(["super", "media-admin"].map(id => ({ id, name: id, email: `${id}@example.test` })));
    await database.insert(schema.platformAdmin).values({ userId: "super" });
    for (const candidate of [null, "media-admin"]) {
      actor = candidate;
      assert.equal((await request()).status, 403);
      assert.equal((await request("/bale/open", "POST")).status, 403);
      assert.equal((await request("/bale/close", "POST")).status, 403);
    }
    assert.equal(opened, 0); actor = "super";
    assert.equal((await request()).status, 200);
    assert.equal((await request("/bale/open", "POST", {}, "https://evil.test")).status, 403);
    assert.equal((await request("/unsupported/open", "POST")).status, 400);
    assert.equal((await request("/bale/open", "POST", { url: "https://evil.test" })).status, 400);
    assert.equal(opened, 0);
    assert.equal((await request("/bale/open", "POST")).status, 202); assert.equal(opened, 1);
    assert.equal((await request("/bale/close", "POST")).status, 202); assert.equal(closed, 1);
    const audit = await database.select().from(schema.auditEvent);
    assert.deepEqual(audit.map(row => row.action).sort(), ["platform.social_browser.login_close_requested", "platform.social_browser.login_open_requested"]);
    assert.ok(audit.every(row => row.actorUserId === "super" && row.targetId === "bale" && row.mediaId === null));
    const { withBrowserRuntime } = await import("../src/social/browser-runtime");
    const { enqueueDueSourceRuns } = await import("../src/server/crawl-jobs");
    await database.insert(schema.source).values({ id: "bale-source", name: "Bale", url: "https://ble.ir/example", adapterKey: "bale", enabled: true, status: "active" });
    await database.insert(schema.crawlerDefinition).values({ id: "bale-def", sourceId: "bale-source", adapterKey: "bale" });
    await database.insert(schema.crawlerVersion).values({ id: "bale-version", definitionId: "bale-def", version: 1, status: "active", config: {} });
    await withBrowserRuntime("bale", new AbortController().signal, async () => { assert.equal(await enqueueDueSourceRuns(), 0, "scheduler must leave the profile to its active login/crawl"); });
    assert.equal((await database.select().from(schema.crawlRun)).length, 0);
  } finally { await client.close(); globalThis.__mediaCommandPglite = undefined; }
});
