import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";

test("admin social requests persist the chosen network and canonical URL with authorization and duplicate protection", async t => {
  process.env.DATABASE_DRIVER = "pglite";
  process.env.PGLITE_DATA_DIR = "unused-social-source-input-test";
  process.env.BETTER_AUTH_SECRET = "social-source-input-test-secret-32-characters";
  const client = new PGlite(); globalThis.__mediaCommandPglite = client;
  const database = drizzle({ client, schema });
  await migrate(database, { migrationsFolder: "./db/migrations" });
  const { auth } = await import("../src/server/auth");
  const { handleApiRequest } = await import("../src/router");
  let actor = "owner";
  t.mock.method(auth.api, "getSession", async () => ({ user: { id: actor, name: actor, email: `${actor}@example.test` }, session: { activeOrganizationId: actor === "other" ? "m2" : "m1" } }));
  const request = (body?: unknown, id = "", method = body ? "POST" : "GET") => handleApiRequest(new Request(`http://local.test/api/v1/media/source-access-requests${id ? `/${id}` : ""}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));
  try {
    await database.insert(schema.user).values(["owner", "other", "viewer"].map(id => ({ id, name: id, email: `${id}@example.test` })));
    await database.insert(schema.media).values(["m1", "m2"].map(id => ({ id, name: id, slug: id, createdAt: new Date() })));
    await database.insert(schema.membership).values([["owner", "m1", "owner"], ["other", "m2", "owner"], ["viewer", "m1", "viewer"]].map(([userId, organizationId, role]) => ({ id: userId, userId, organizationId, role, createdAt: new Date() })));
    const body = { sourceType: "social", platform: "instagram", url: "@sample_news" };
    const created = await request(body); assert.equal(created.status, 201);
    const row = (await created.json()).data;
    assert.equal(row.url, "https://www.instagram.com/sample_news"); assert.equal(row.platform, "instagram");
    assert.equal((await request({ ...body, url: row.url })).status, 409);
    assert.equal((await request({ ...body, url: "https://t.me/other_channel" })).status, 400);
    assert.equal((await request({ sourceType: "social", url: "@no_network" })).status, 400);
    assert.equal((await request({ ...body, platform: "unsupported" })).status, 400);
    assert.equal((await request({ sourceType: "website", platform: "instagram", url: "https://example.test", categoryMode: "all" })).status, 400);
    assert.equal((await request({ sourceType: "social", url: "https://t.me/legacy_channel" })).status, 201, "existing URL-only clients remain compatible");
    const edited = await request({ sourceType: "social", platform: "rubino", url: "@new_page" }, row.id, "PATCH");
    assert.equal(edited.status, 200); assert.equal((await edited.json()).data.url, "https://rubino.ir/new_page");
    const reloaded = (await (await request()).json()).data;
    assert.equal(reloaded.find((item: { id: string }) => item.id === row.id).platform, "rubino");
    actor = "viewer"; assert.equal((await request(body)).status, 403);
    actor = "other"; assert.equal((await request(body, row.id, "PATCH")).status, 404);
    assert.equal((await request(body)).status, 201, "the same public source is allowed in another media");
    assert.equal((await database.select().from(schema.crawlRun)).length, 0, "submitting a request does not start crawling");
  } finally { await client.close(); globalThis.__mediaCommandPglite = undefined; }
});
