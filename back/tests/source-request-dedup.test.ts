import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { sourceRequestKey } from "../contracts/src/media-setup";

test("source duplicate detection is scoped to a media, canonical and safe under concurrent submissions", async t => {
  process.env.DATABASE_DRIVER = "pglite";
  process.env.PGLITE_DATA_DIR = "unused-source-dedup-test";
  process.env.BETTER_AUTH_SECRET = "source-dedup-test-only-secret-at-least-32-characters";
  const client = new PGlite(); globalThis.__mediaCommandPglite = client;
  const database = drizzle({ client, schema }); await migrate(database, { migrationsFolder: "./db/migrations" });
  const { auth } = await import("../src/server/auth");
  const { handleApiRequest } = await import("../src/router");
  let actor = "owner";
  t.mock.method(auth.api, "getSession", async () => ({ user: { id: actor, name: actor, email: `${actor}@test.example` }, session: { activeOrganizationId: actor === "other" ? "m2" : "m1" } }));
  const request = (path: string, body?: unknown, method = body ? "POST" : "GET") => handleApiRequest(new Request(`http://local.test/api/v1${path}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));
  const create = (url: string) => request("/media/source-access-requests", { sourceType: "website", url, categoryMode: "all", categoryIds: [] });
  const preferences = { editorialViewpoint: "رویکرد دقیق و مستقل رسانه", sourceSelections: [], socialPlatforms: [], setupCompleted: false, setupStep: 4 };
  try {
    assert.equal(sourceRequestKey("https://WWW.YJC.ir:443/#news"), sourceRequestKey("https://yjc.ir"));
    assert.equal(sourceRequestKey("https://example.test/news/?b=2&a=1"), sourceRequestKey("https://www.example.test/news?a=1&b=2#story"));
    assert.notEqual(sourceRequestKey("https://example.test/News"), sourceRequestKey("https://example.test/news"));
    assert.notEqual(sourceRequestKey("https://example.test/?page=1"), sourceRequestKey("https://example.test/?page=2"));
    await database.insert(schema.user).values(["owner", "other"].map(id => ({ id, name: id, email: `${id}@test.example` })));
    await database.insert(schema.media).values(["m1", "m2"].map(id => ({ id, name: id, slug: id, createdAt: new Date(), metadata: JSON.stringify({ setupPreferences: preferences }) })));
    await database.insert(schema.membership).values([["owner", "m1"], ["other", "m2"]].map(([userId, organizationId]) => ({ id: userId, userId, organizationId, role: "owner", createdAt: new Date() })));
    const first = await create("https://www.yjc.ir/");
    assert.equal(first.status, 201);
    const id = (await first.json()).data.id;
    for (const url of ["https://www.yjc.ir/", "https://yjc.ir", "https://YJC.ir/#top"]) {
      const duplicate = await create(url);
      assert.equal(duplicate.status, 409, await duplicate.clone().text());
      assert.match((await duplicate.json()).error.message, /قبلاً به همین رسانه/);
    }
    assert.equal((await request("/media/source-access-requests", { sourceType: "social", url: "https://yjc.ir/" })).status, 409);
    actor = "other";
    assert.equal((await create("https://yjc.ir/")).status, 201);
    actor = "owner";
    const concurrent = await Promise.all([create("https://www.aljazeera.com/"), create("https://aljazeera.com")]);
    assert.deepEqual(concurrent.map(response => response.status).sort(), [201, 409]);
    assert.equal((await database.select().from(schema.sourceAccessRequest).where(eq(schema.sourceAccessRequest.mediaId, "m1"))).length, 2);
    assert.equal((await request(`/media/source-access-requests/${id}`, undefined, "DELETE")).status, 200);
    assert.equal((await create("https://yjc.ir")).status, 201);
    // Legacy duplicates remain editable; they cannot be forwarded during completion.
    await database.insert(schema.sourceAccessRequest).values({ id: "legacy-duplicate", mediaId: "m1", requestedBy: "owner", sourceType: "website", name: "Legacy", url: "https://www.yjc.ir/", status: "pending" });
    assert.equal((await request("/media/setup", { ...preferences, setupCompleted: true }, "PATCH")).status, 409);
    assert.equal((await (await request("/media/setup")).json()).data.setupCompleted, false);
    assert.equal((await request("/media/source-access-requests/legacy-duplicate", undefined, "DELETE")).status, 200);
    assert.equal((await request("/media/setup", { ...preferences, setupCompleted: true }, "PATCH")).status, 200);
    assert.equal((await create("https://yjc.ir/")).status, 409);
  } finally { await client.close(); globalThis.__mediaCommandPglite = undefined; }
});
