import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";

test("source mappings: authorization, atomic quick creation, revisions, history and canonical editorial input", async t => {
  process.env.DATABASE_DRIVER = "pglite"; process.env.PGLITE_DATA_DIR = "unused-category-test";
  process.env.BETTER_AUTH_SECRET = "test-only-category-mapping-secret-32-characters";
  const client = new PGlite(); globalThis.__mediaCommandPglite = client;
  const database = drizzle({ client, schema });
  await migrate(database, { migrationsFolder: "./db/migrations" });
  const { auth } = await import("../src/server/auth");
  const { handleApiRequest } = await import("../src/router");
  const { registerSourceCategories } = await import("../src/server/category-mappings");
  const { getSectionCandidates, editorialInputOptions } = await import("../src/server/editorial-settings");
  const { enqueueEditorialJob } = await import("../src/server/editorial-jobs");
  const { createEditorialStory } = await import("../src/server/editorial");
  let actor: string | null = "super";
  t.mock.method(auth.api, "getSession", async () => actor ? { user: { id: actor, name: actor, email: `${actor}@test.example` }, session: { activeOrganizationId: "m" } } : null);
  const request = (suffix = "", body?: unknown) => handleApiRequest(new Request(`http://local.test/api/v1/platform/category-mappings${suffix}`, { method: body ? "PATCH" : "GET", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));
  const data = async (response: Response, status = 200) => { assert.equal(response.status, status, await response.clone().text()); return (await response.json()).data; };
  const editor = { mediaId: "m", actorUserId: "owner", correlationId: "test" };
  try {
    await database.insert(schema.user).values(["super", "owner"].map(id => ({ id, name: id, email: `${id}@test.example` })));
    await database.insert(schema.platformAdmin).values({ userId: "super" });
    await database.insert(schema.media).values({ id: "m", name: "Media", slug: "m", createdAt: new Date() });
    await database.insert(schema.membership).values({ id: "member", userId: "owner", organizationId: "m", role: "owner", createdAt: new Date() });
    await database.insert(schema.platformEditorialConfig).values({ id: "cfg", revision: 1, instructions: "Preserve verified facts and attribution in the output.", factions: [] });
    for (const id of ["s1", "s2"]) {
      await database.insert(schema.source).values({ id, name: id, url: `https://${id}.test`, adapterKey: "web" });
      await database.insert(schema.crawlerDefinition).values({ id: `d-${id}`, sourceId: id, adapterKey: "web" });
      await database.insert(schema.crawlerVersion).values({ id: `v-${id}`, definitionId: `d-${id}`, version: 1, config: {} });
      await database.insert(schema.crawlRun).values({ id: `r-${id}`, sourceId: id, crawlerVersionId: `v-${id}`, correlationId: `test-${id}` });
      await database.insert(schema.rawArticle).values({ id: `a-${id}`, sourceId: id, crawlRunId: `r-${id}`, title: id, content: "متن کامل و معتبر خبر برای آزمایش تحریریه. ".repeat(8), canonicalUrl: `https://${id}.test/article`, categories: [" اقتصادی "], contentHash: id });
      await database.insert(schema.mediaInboxItem).values({ id: `i-${id}`, mediaId: "m", rawArticleId: `a-${id}` });
      await registerSourceCategories(id, [" اقتصادی ", "اقتصادی"]);
    }
    const settings = { factionId: null, viewpointStrength: 0, humor: 0, formality: 70, sourceIds: [], categories: ["اقتصاد"] };
    await database.insert(schema.editorialSection).values({ id: "section", mediaId: "m", name: "Economy", settings });
    for (const candidate of [null, "owner"]) { actor = candidate; assert.equal((await request()).status, 403); }
    actor = "super";
    let workspace = await data(await request());
    assert.deepEqual(workspace.summary, { total: 2, mapped: 0, pending: 2 });
    const first = workspace.rows.find((row: { sourceId: string }) => row.sourceId === "s1");
    const second = workspace.rows.find((row: { sourceId: string }) => row.sourceId === "s2");
    assert.equal(first.articleCount, 1);
    assert.equal((await getSectionCandidates("m", "section")).length, 0);
    await assert.rejects(enqueueEditorialJob(editor, "section", "a-s1"), /معادل/);
    await assert.rejects(createEditorialStory(editor, { rawArticleId: "a-s1", sectionId: "section" }), /معادل/);
    const names = { nameFa: "اقتصاد", nameEn: "Economy", nameAr: "اقتصاد" };
    const saved = await data(await request(`/${first.id}`, { expectedRevision: 1, newCategory: names }));
    assert.equal(saved.revision, 2);
    assert.equal(saved.categoryName, "اقتصاد");
    assert.deepEqual((await getSectionCandidates("m", "section")).map(row => row.id), ["a-s1"]);
    assert.ok((await editorialInputOptions("m")).categories.includes("اقتصاد"));
    const job = await enqueueEditorialJob(editor, "section", "a-s1"); assert.ok(job.id);
    await registerSourceCategories("s1", ["اقتصادی"]);
    workspace = await data(await request("?status=mapped&q=اقتصاد"));
    assert.equal(workspace.rows.length, 1); assert.equal(workspace.rows[0].revision, 2);
    const before = (await database.select().from(schema.platformCategory)).length;
    await data(await request(`/${first.id}`, { expectedRevision: 1, newCategory: { ...names, nameFa: "نباید ساخته شود" } }), 409);
    assert.equal((await database.select().from(schema.platformCategory)).length, before);
    const reused = await data(await request(`/${second.id}`, { expectedRevision: 1, newCategory: names }));
    assert.equal(reused.categoryId, saved.categoryId);
    assert.equal((await database.select().from(schema.platformCategory)).length, before);
    assert.equal((await getSectionCandidates("m", "section")).length, 2);
    await data(await request(`/${first.id}`, { expectedRevision: 2, categoryId: "missing" }), 400);
    const other = await database.select().from(schema.platformCategory).then(rows => rows.find(row => row.id !== saved.categoryId)!);
    await data(await request(`/${first.id}`, { expectedRevision: 2, categoryId: other.id }));
    const history = await data(await request(`/${first.id}/history`));
    assert.equal(history.length, 2); assert.equal(history[0].from, "اقتصاد"); assert.equal(history[0].to, other.nameFa);
    await database.update(schema.platformCategory).set({ active: false }).where(eq(schema.platformCategory.id, saved.categoryId));
    assert.equal((await data(await request("/summary"))).pending, 1);
    await data(await request(`/${second.id}`, { expectedRevision: 2, categoryId: saved.categoryId }), 400);
    await registerSourceCategories("s1", []);
    await registerSourceCategories("s1", ["دسته تازه"]);
    assert.equal((await data(await request("/summary"))).pending, 3);
    assert.equal((await data(await request("?status=all&q=%"))).total, 0);
    for (const raw of await database.select().from(schema.rawArticle)) { assert.equal(raw.status, "new"); assert.deepEqual(raw.categories, [" اقتصادی "]); }
  } finally { await client.close(); }
});
