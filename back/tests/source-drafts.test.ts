import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";

test("source drafts are removable and private until atomic setup completion, including legacy pending rows", async t => {
  process.env.DATABASE_DRIVER = "pglite";
  process.env.PGLITE_DATA_DIR = "unused-source-drafts-test";
  process.env.BETTER_AUTH_SECRET = "source-drafts-test-only-secret-at-least-32-characters";
  const client = new PGlite(); globalThis.__mediaCommandPglite = client;
  const database = drizzle({ client, schema }); await migrate(database, { migrationsFolder: "./db/migrations" });
  const { auth } = await import("../src/server/auth");
  const { handleApiRequest } = await import("../src/router");
  let actor = "owner";
  t.mock.method(auth.api, "getSession", async () => actor === "anonymous" ? null : ({ user: { id: actor, name: actor, email: `${actor}@test.example` }, session: { activeOrganizationId: actor === "other" ? "m2" : "m1" } }));
  const request = (path: string, body?: unknown, method = body ? "POST" : "GET") => handleApiRequest(new Request(`http://local.test/api/v1${path}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));
  const data = async (response: Response, status = 200) => { assert.equal(response.status, status, await response.clone().text()); return (await response.json()).data; };
  const preferences = { editorialViewpoint: "رویکرد دقیق و مستقل رسانه", sourceSelections: [], socialPlatforms: [], setupCompleted: false, setupStep: 4 };
  try {
    await database.insert(schema.user).values(["owner", "other", "viewer", "super"].map(id => ({ id, name: id, email: `${id}@test.example` })));
    await database.insert(schema.platformAdmin).values({ userId: "super" });
    await database.insert(schema.media).values(["m1", "m2"].map(id => ({ id, name: id, slug: id, createdAt: new Date(), metadata: JSON.stringify({ setupPreferences: preferences }) })));
    await database.insert(schema.membership).values([["owner", "m1", "owner"], ["other", "m2", "owner"], ["viewer", "m1", "viewer"]].map(([userId, organizationId, role]) => ({ id: userId, userId, organizationId, role, createdAt: new Date() })));
    const first = await data(await request("/media/source-access-requests", { sourceType: "website", url: "https://one.example.test", categoryMode: "all", categoryIds: [] }), 201);
    assert.equal(first.status, "draft");
    const kept = await data(await request("/media/source-access-requests", { sourceType: "social", url: "https://social.example.test/channel" }), 201);
    await database.insert(schema.sourceAccessRequest).values({ id: "legacy", mediaId: "m1", requestedBy: "owner", sourceType: "website", name: "Legacy", url: "https://legacy.example.test", status: "pending" });
    const own = await data(await request("/media/source-access-requests"));
    assert.equal(own.find((row: { id: string }) => row.id === "legacy").status, "draft");
    actor = "super";
    assert.deepEqual(await data(await request("/platform/source-access-requests")), []);
    for (const action of ["reject", "queue_crawler", "grant_existing"]) assert.equal((await request(`/platform/source-access-requests/legacy`, { action }, "PATCH")).status, 409);
    assert.equal((await database.select().from(schema.source)).length, 0);
    actor = "other";
    assert.equal((await request(`/media/source-access-requests/${first.id}`, undefined, "DELETE")).status, 404);
    actor = "viewer";
    assert.equal((await request(`/media/source-access-requests/${first.id}`, undefined, "DELETE")).status, 403);
    actor = "anonymous";
    assert.equal((await request(`/media/source-access-requests/${first.id}`, undefined, "DELETE")).status, 401);
    actor = "owner";
    await data(await request(`/media/source-access-requests/${first.id}`, undefined, "DELETE"));
    await data(await request("/media/source-access-requests/legacy", undefined, "DELETE"));
    assert.deepEqual((await data(await request("/media/source-access-requests"))).map((row: { id: string }) => row.id), [kept.id]);
    await data(await request("/media/setup", { ...preferences, setupStep: 3 }, "PATCH"));
    actor = "super"; assert.deepEqual(await data(await request("/platform/source-access-requests")), []);
    actor = "owner";
    await data(await request("/media/setup", { ...preferences, setupCompleted: true }, "PATCH"));
    const after = await data(await request("/media/source-access-requests"));
    assert.equal(after[0].status, "pending");
    assert.equal((await request(`/media/source-access-requests/${kept.id}`, undefined, "DELETE")).status, 409);
    assert.equal((await request("/media/setup", preferences, "PATCH")).status, 409);
    await data(await request("/media/setup", { ...preferences, setupCompleted: true }, "PATCH"));
    actor = "super";
    const submitted = await data(await request("/platform/source-access-requests"));
    assert.deepEqual(submitted.map((row: { id: string }) => row.id), [kept.id]);
    assert.equal(submitted[0].mediaMetadata, undefined);
    assert.equal(submitted[0].mediaApproved, false);
    assert.equal((await request(`/platform/source-access-requests/${kept.id}`, { action: "reject" }, "PATCH")).status, 409);
    await data(await request("/platform/media-requests/m1", { action: "approve", expectedRevision: 1 }, "PATCH"));
    await data(await request(`/platform/source-access-requests/${kept.id}`, { action: "reject" }, "PATCH"));
    const withdrawn = await database.select().from(schema.sourceAccessRequest).where(eq(schema.sourceAccessRequest.status, "withdrawn"));
    assert.equal(withdrawn.length, 2);
    const events = await database.select().from(schema.auditEvent).where(eq(schema.auditEvent.action, "source_access_requests.submitted"));
    assert.equal(events.length, 1);
    // Completion and deletion serialize against the same Media lock.
    actor = "other";
    const racing = await data(await request("/media/source-access-requests", { sourceType: "social", url: "https://race.example.test" }), 201);
    const [removeResult, completeResult] = await Promise.all([
      request(`/media/source-access-requests/${racing.id}`, undefined, "DELETE"),
      request("/media/setup", { ...preferences, setupCompleted: true }, "PATCH"),
    ]);
    assert.equal(completeResult.status, 200);
    assert.ok([200, 409].includes(removeResult.status));
    const [row] = await database.select().from(schema.sourceAccessRequest).where(eq(schema.sourceAccessRequest.id, racing.id));
    assert.equal(row.status, removeResult.status === 200 ? "withdrawn" : "pending");
  } finally { await client.close(); globalThis.__mediaCommandPglite = undefined; }
});
