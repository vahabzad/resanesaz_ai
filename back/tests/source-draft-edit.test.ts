import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";

test("editing a source draft persists its own categories and URL, protects other media and stops after submission", async t => {
  process.env.DATABASE_DRIVER = "pglite"; process.env.PGLITE_DATA_DIR = "unused-source-edit-test"; process.env.BETTER_AUTH_SECRET = "source-edit-test-only-secret-at-least-32-characters";
  const client = new PGlite(); globalThis.__mediaCommandPglite = client;
  const database = drizzle({ client, schema }); await migrate(database, { migrationsFolder: "./db/migrations" });
  const { auth } = await import("../src/server/auth"); const { handleApiRequest } = await import("../src/router");
  let actor = "owner";
  t.mock.method(auth.api, "getSession", async () => actor === "anonymous" ? null : ({ user: { id: actor, name: actor, email: `${actor}@test.example` }, session: { activeOrganizationId: actor === "other" ? "m2" : "m1" } }));
  const request = (path: string, body?: unknown, method = body ? "POST" : "GET") => handleApiRequest(new Request(`http://local.test/api/v1${path}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));
  const data = async (response: Response, status = 200) => { assert.equal(response.status, status, await response.clone().text()); return (await response.json()).data; };
  const preferences = { editorialViewpoint: "رویکرد دقیق و مستقل رسانه", sourceSelections: [], socialPlatforms: [], setupCompleted: false, setupStep: 4 };
  const original = { sourceType: "website", url: "https://www.aljazeera.com/", categoryMode: "selected", categoryIds: ["cat1"] };
  try {
    await database.insert(schema.user).values(["owner", "other", "viewer"].map(id => ({ id, name: id, email: `${id}@test.example` })));
    await database.insert(schema.media).values(["m1", "m2"].map(id => ({ id, name: id, slug: id, createdAt: new Date(), metadata: JSON.stringify({ setupPreferences: preferences }) })));
    await database.insert(schema.membership).values([["owner", "m1", "owner"], ["other", "m2", "owner"], ["viewer", "m1", "viewer"]].map(([userId, organizationId, role]) => ({ id: userId, userId, organizationId, role, createdAt: new Date() })));
    await database.insert(schema.platformCategory).values(["cat1", "cat2", "inactive"].map(id => ({ id, key: id, nameFa: `دستهٔ ${id}`, nameEn: id, nameAr: id, active: id !== "inactive" })));
    const created = await data(await request("/media/source-access-requests", original), 201);
    const second = await data(await request("/media/source-access-requests", { ...original, url: "https://yjc.ir/" }), 201);
    const path = `/media/source-access-requests/${created.id}`;
    actor = "other"; assert.equal((await request(path, original, "PATCH")).status, 404);
    actor = "viewer"; assert.equal((await request(path, original, "PATCH")).status, 403);
    actor = "anonymous"; assert.equal((await request(path, original, "PATCH")).status, 401);
    actor = "owner";
    for (const categoryIds of [[], ["missing"], ["inactive"]]) assert.equal((await request(path, { ...original, categoryIds }, "PATCH")).status, 400);
    assert.equal((await request(path, { ...original, url: "https://www.yjc.ir" }, "PATCH")).status, 409);
    const saved = await data(await request(path, { ...original, categoryIds: ["cat1", "cat2"] }, "PATCH"));
    assert.equal(saved.id, created.id); assert.equal(saved.status, "draft");
    const reloaded = await data(await request("/media/source-access-requests"));
    assert.deepEqual(reloaded.find((row: { id: string }) => row.id === created.id).categoryIds, ["cat1", "cat2"]);
    assert.deepEqual(reloaded.find((row: { id: string }) => row.id === second.id).categoryIds, ["cat1"]);
    await database.insert(schema.editorialSection).values(["m1", "m2"].map(mediaId => ({ id: `section-${mediaId}`, mediaId, name: "سردبیر راه‌اندازی · تست", settings: { language: "fa" as const, factionId: null, viewpointStrength: 0, humor: 0, formality: 70, sourceIds: [], sourceUrls: [original.url], categories: [] } })));
    const newUrl = "https://www.aljazeera.com/news/";
    await data(await request(path, { ...original, url: newUrl, categoryMode: "all", categoryIds: [] }, "PATCH"));
    const sections = await database.select().from(schema.editorialSection);
    assert.deepEqual(sections.find(row => row.mediaId === "m1")!.settings.sourceUrls, [newUrl]);
    assert.equal(sections.find(row => row.mediaId === "m1")!.revision, 2);
    assert.deepEqual(sections.find(row => row.mediaId === "m2")!.settings.sourceUrls, [original.url]);
    const social = await data(await request(path, { sourceType: "social", url: "https://social.example.test/channel" }, "PATCH"));
    assert.equal(social.categoryMode, null); assert.deepEqual(social.categoryIds, []);
    assert.equal((await request(path, { sourceType: "social", url: "https://social.example.test/channel", categoryMode: "all" }, "PATCH")).status, 400);
    const [editResult, completed] = await Promise.all([
      request(path, { ...original, categoryIds: ["cat2"] }, "PATCH"),
      request("/media/setup", { ...preferences, setupCompleted: true }, "PATCH"),
    ]);
    assert.equal(completed.status, 200); assert.ok([200, 409].includes(editResult.status));
    assert.equal((await request(path, original, "PATCH")).status, 409);
    const [final] = await database.select().from(schema.sourceAccessRequest).where(eq(schema.sourceAccessRequest.id, created.id));
    assert.equal(final.status, "pending");
    const audits = await database.select().from(schema.auditEvent).where(eq(schema.auditEvent.action, "source_access_request.draft_updated"));
    assert.ok(audits.length >= 3);
  } finally { await client.close(); globalThis.__mediaCommandPglite = undefined; }
});
