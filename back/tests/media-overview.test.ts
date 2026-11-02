import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";

test("admin overview: truthful request/site state, new source requests and inbox restricted to granted sources", async t => {
  process.env.DATABASE_DRIVER = "pglite"; process.env.PGLITE_DATA_DIR = "unused-overview-test"; process.env.BETTER_AUTH_SECRET = "overview-test-only-secret-at-least-32-characters";
  const client = new PGlite(); globalThis.__mediaCommandPglite = client;
  const database = drizzle({ client, schema }); await migrate(database, { migrationsFolder: "./db/migrations" });
  const { auth } = await import("../src/server/auth"); const { handleApiRequest } = await import("../src/router");
  let actor: string | null = "owner";
  t.mock.method(auth.api, "getSession", async () => actor ? { user: { id: actor, name: actor, email: `${actor}@test.example` }, session: { activeOrganizationId: actor === "other" ? "m2" : "m1" } } : null);
  const request = (path: string, body?: unknown, method = body ? "POST" : "GET") => handleApiRequest(new Request(`http://local.test/api/v1${path}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));
  const data = async (response: Response, status = 200) => { assert.equal(response.status, status, await response.clone().text()); return (await response.json()).data; };
  const spec = { title: "Test site", tagline: "", language: "fa" as const, accent: "#bb3344", layout: "lead" as const, footer: "", blocks: [{ id: "news", title: "خبرها", sectionIds: [], limit: 5 }] };
  try {
    await database.insert(schema.user).values(["owner", "other", "super"].map(id => ({ id, name: id, email: `${id}@test.example` })));
    await database.insert(schema.platformAdmin).values({ userId: "super" });
    await database.insert(schema.media).values(["m1", "m2"].map(id => ({ id, name: id, slug: id, createdAt: new Date(), metadata: JSON.stringify({ setupPreferences: { setupCompleted: true } }) })));
    await database.insert(schema.membership).values([["owner", "m1"], ["other", "m2"]].map(([userId, organizationId]) => ({ id: userId, userId, organizationId, role: "owner", createdAt: new Date() })));
    await database.insert(schema.mediaCreationRequest).values([{ mediaId: "m1", status: "pending" }, { mediaId: "m2", status: "approved" }]);
    await database.insert(schema.mediaSite).values({ id: "site", name: "My site", slug: "my-site", mediaId: "m1", spec });
    for (const id of ["s1", "s2"]) {
      await database.insert(schema.source).values({ id, name: id, url: `https://${id}.test/`, adapterKey: "web" });
      await database.insert(schema.crawlerDefinition).values({ id: `d-${id}`, sourceId: id, adapterKey: "web" });
      await database.insert(schema.crawlerVersion).values({ id: `v-${id}`, definitionId: `d-${id}`, version: 1, config: {} });
      await database.insert(schema.crawlRun).values({ id: `r-${id}`, sourceId: id, crawlerVersionId: `v-${id}`, correlationId: id });
      await database.insert(schema.rawArticle).values({ id: `a-${id}`, sourceId: id, crawlRunId: `r-${id}`, title: id, canonicalUrl: `https://${id}.test/news`, contentHash: id });
      await database.insert(schema.mediaInboxItem).values({ id: `i-${id}`, mediaId: "m1", rawArticleId: `a-${id}` });
    }
    await database.insert(schema.mediaSourceSubscription).values({ id: "foreign", mediaId: "m2", sourceId: "s2" });
    await data(await request("/media/source-access-requests", { sourceType: "website", url: "https://s1.test/", categoryMode: "all", categoryIds: [] }), 201);
    let overview = await data(await request("/media/overview"));
    assert.equal(overview.canReadInbox, false); assert.equal(overview.request.status, "pending"); assert.equal(overview.sites[0].status, "waiting_approval"); assert.equal(overview.sites[0].publicPath, null);
    assert.equal(overview.sources.length, 1); assert.equal(overview.sources[0].accessGranted, false);
    await data(await request("/articles"), 403);
    actor = "super"; await data(await request("/platform/media-requests/m1", { action: "approve", expectedRevision: 1 }, "PATCH")); actor = "owner";
    overview = await data(await request("/media/overview")); assert.equal(overview.sites[0].status, "not_started"); assert.equal(overview.canReadInbox, false);
    await database.insert(schema.mediaSourceSubscription).values({ id: "granted", mediaId: "m1", sourceId: "s1" });
    overview = await data(await request("/media/overview")); assert.equal(overview.canReadInbox, true); assert.equal(overview.sources.length, 1); assert.equal(overview.sources[0].accessGranted, true);
    const inbox = await data(await request("/articles")); assert.deepEqual(inbox.articles.map((row: { id: string }) => row.id), ["a-s1"]); assert.equal(inbox.stats.total, 1); assert.equal(inbox.stats.sources, 1);
    await database.update(schema.source).set({ mediaDeliveryEnabled: false }).where(eq(schema.source.id, "s1"));
    assert.equal((await data(await request("/media/overview"))).canReadInbox, false); await data(await request("/articles"), 403);
    await database.update(schema.source).set({ mediaDeliveryEnabled: true }).where(eq(schema.source.id, "s1"));
    await database.update(schema.mediaSite).set({ status: "live", liveSpec: spec }).where(eq(schema.mediaSite.id, "site"));
    overview = await data(await request("/media/overview")); assert.equal(overview.sites[0].status, "live"); assert.equal(overview.sites[0].publicPath, "/s/my-site");
    actor = "other"; overview = await data(await request("/media/overview?mediaId=m1")); assert.equal(overview.mediaId, "m2"); assert.equal(overview.sites.length, 0); assert.equal(overview.sources.length, 1); assert.equal(overview.sources[0].url, "https://s2.test/");
    actor = null; assert.equal((await request("/media/overview")).status, 401);
  } finally { await client.close(); }
});
