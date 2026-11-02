import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";

test("setup renames only the active media, persists through context, and requires organization update permission", async t => {
  process.env.DATABASE_DRIVER = "pglite";
  process.env.PGLITE_DATA_DIR = "unused-media-setup-test";
  process.env.BETTER_AUTH_SECRET = "media-setup-test-only-secret-at-least-32-characters";
  const client = new PGlite();
  globalThis.__mediaCommandPglite = client;
  const database = drizzle({ client, schema });
  await migrate(database, { migrationsFolder: "./db/migrations" });
  const { auth } = await import("../src/server/auth");
  const { handleApiRequest } = await import("../src/router");
  let actor = "owner";
  t.mock.method(auth.api, "getSession", async () => actor === "anonymous" ? null : ({ user: { id: actor, name: actor, email: `${actor}@test.example` }, session: { activeOrganizationId: "m1" } }));
  const preferences = { editorialViewpoint: "رویکرد دقیق و مستقل رسانه", sourceSelections: [], socialPlatforms: [], setupCompleted: false };
  const request = (path: string, body?: unknown) => handleApiRequest(new Request(`http://local.test/api/v1${path}`, { method: body ? "PATCH" : "GET", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));
  try {
    await database.insert(schema.user).values(["owner", "viewer"].map(id => ({ id, name: id, email: `${id}@test.example` })));
    await database.insert(schema.media).values(["m1", "m2"].map(id => ({ id, name: id, slug: id, createdAt: new Date(), metadata: JSON.stringify({ retained: true }) })));
    await database.insert(schema.membership).values(["owner", "viewer"].map(id => ({ id, userId: id, organizationId: "m1", role: id, createdAt: new Date() })));
    const response = await request("/media/setup", { ...preferences, name: "  نام تازهٔ رسانه  " });
    assert.equal(response.status, 200, await response.clone().text());
    assert.deepEqual((await response.json()).data, preferences);
    const context = (await (await request("/context")).json()).data;
    assert.equal(context.activeMedia.name, "نام تازهٔ رسانه");
    const [saved] = await database.select().from(schema.media).where(eq(schema.media.id, "m1"));
    assert.equal(saved.slug, "m1");
    assert.deepEqual(JSON.parse(saved.metadata!), { retained: true, setupPreferences: preferences });
    const [other] = await database.select().from(schema.media).where(eq(schema.media.id, "m2"));
    assert.equal(other.name, "m2");
    const events = await database.select().from(schema.auditEvent).where(eq(schema.auditEvent.mediaId, "m1"));
    assert.equal(events.length, 1);
    assert.equal(events[0].action, "media.setup_preferences.saved");
    for (const name of ["", " ", "x", "x".repeat(121)]) assert.equal((await request("/media/setup", { ...preferences, name })).status, 400);
    assert.equal((await request("/media/setup", preferences)).status, 200);
    for (const setupStep of [2, 3, 4]) {
      const next = { ...preferences, setupStep };
      assert.equal((await request("/media/setup", next)).status, 200);
      assert.deepEqual((await (await request("/media/setup")).json()).data, next);
    }
    // A client without the new progress field must not erase the saved resume step.
    assert.equal((await request("/media/setup", preferences)).status, 200);
    for (const setupStep of [0, 5, 2.5, "3"]) assert.equal((await request("/media/setup", { ...preferences, setupStep })).status, 400);
    assert.equal((await request("/media/setup", { ...preferences, setupStep: 2, sourceSelections: [{ sourceId: "missing", categoryMode: "all", categories: [] }] })).status, 409);
    assert.equal((await (await request("/media/setup")).json()).data.setupStep, 4);
    actor = "viewer";
    assert.equal((await request("/media/setup", { ...preferences, name: "تغییر غیرمجاز" })).status, 403);
    actor = "anonymous";
    assert.equal((await request("/media/setup", { ...preferences, name: "تغییر بدون نشست" })).status, 401);
    const [unchanged] = await database.select().from(schema.media).where(eq(schema.media.id, "m1"));
    assert.equal(unchanged.name, "نام تازهٔ رسانه");
  } finally {
    await client.close();
    globalThis.__mediaCommandPglite = undefined;
  }
});
