import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";

test("inbox filters search all accessible news, paginate and protect full-text details", async t => {
  process.env.DATABASE_DRIVER = "pglite"; process.env.PGLITE_DATA_DIR = "unused-inbox-test";
  process.env.BETTER_AUTH_SECRET = "inbox-test-only-secret-at-least-32-characters";
  const client = new PGlite(); globalThis.__mediaCommandPglite = client;
  const database = drizzle({ client, schema }); await migrate(database, { migrationsFolder: "./db/migrations" });
  const { auth } = await import("../src/server/auth"); const { handleApiRequest } = await import("../src/router");
  let actor = "owner";
  t.mock.method(auth.api, "getSession", async () => actor === "anonymous" ? null : { user: { id: actor, name: actor, email: `${actor}@example.test` }, session: { activeOrganizationId: actor === "other" ? "m2" : "m1" } });
  const request = (path = "") => handleApiRequest(new Request(`http://local.test/api/v1/articles${path}`));
  const data = async (path = "") => { const response = await request(path); assert.equal(response.status, 200, await response.clone().text()); return (await response.json()).data; };
  try {
    await database.insert(schema.user).values(["owner", "other"].map(id => ({ id, name: id, email: `${id}@example.test` })));
    await database.insert(schema.media).values(["m1", "m2"].map(id => ({ id, name: id, slug: id, createdAt: new Date() })));
    await database.insert(schema.membership).values(["owner", "other"].map((userId, i) => ({ id: userId, userId, organizationId: `m${i + 1}`, role: "owner", createdAt: new Date() })));
    await database.insert(schema.mediaCreationRequest).values(["m1", "m2"].map((mediaId, i) => ({ mediaId, requestedBy: i ? "other" : "owner", status: "approved" as const })));
    await database.insert(schema.source).values(["s1", "s2", "hidden"].map(id => ({ id, name: id, url: `https://${id}.example.test` })));
    await database.insert(schema.platformCategory).values({ id: "cat", key: "cat", nameFa: "اقتصاد", nameEn: "Economy", nameAr: "اقتصاد" });
    await database.insert(schema.sourceCategoryMapping).values({ id: "map", sourceId: "s2", rawName: "اقتصاد", platformCategoryId: "cat" });
    await database.insert(schema.mediaSourceSubscription).values([
      { id: "sub1", mediaId: "m1", sourceId: "s1", categoryMode: "all" },
      { id: "sub2", mediaId: "m1", sourceId: "s2", categoryMode: "selected", categoryIds: ["cat"] },
      { id: "sub-other", mediaId: "m2", sourceId: "s1", categoryMode: "all" },
    ]);
    for (const sourceId of ["s1", "s2", "hidden"]) {
      await database.insert(schema.crawlerDefinition).values({ id: `def-${sourceId}`, sourceId, adapterKey: "web" });
      await database.insert(schema.crawlerVersion).values({ id: `ver-${sourceId}`, definitionId: `def-${sourceId}`, version: 1, status: "active", config: {} });
      await database.insert(schema.crawlRun).values({ id: `run-${sourceId}`, sourceId, crawlerVersionId: `ver-${sourceId}`, correlationId: `inbox-test-${sourceId}` });
    }
    const now = Date.now();
    const records = Array.from({ length: 61 }, (_, i) => ({ id: `a${i}`, sourceId: "s1", crawlRunId: "run-s1", contentHash: `hash${i}`, canonicalUrl: `https://s1.example.test/${i}`,
      title: `خبر ${i}`, summary: i === 0 ? "نرخ رشد اقتصاد" : null, content: i === 60 ? "گزارش يک كسب‌وکار قدیمی و رشد اقتصاد <script>alert(1)</script>" : `متن کامل خبر ${i}`,
      categories: i % 2 ? ["سیاسی"] : ["اقتصاد"], status: i === 0 ? "quarantined" : "new", quarantineReason: i === 0 ? "متن کوتاه" : null,
      ingestedAt: new Date(now - i * 3_600_000), publishedAt: i === 0 ? null : new Date(now - (100 - i) * 3_600_000) }));
    await database.insert(schema.rawArticle).values(records);
    for (const [id, sourceId, categories] of [["permitted", "s2", ["اقتصاد"]], ["restricted", "s2", ["محرمانه"]], ["hidden-news", "hidden", ["پنهان"]], ["foreign", "s1", ["رسانه دیگر"]]] as const) {
      await database.insert(schema.rawArticle).values({ id, sourceId, crawlRunId: `run-${sourceId}`, contentHash: id, canonicalUrl: `https://${sourceId}.example.test/${id}`, title: id, categories: [...categories], content: "متن کامل اختصاصی" });
    }
    await database.insert(schema.mediaInboxItem).values([...records.map(row => row.id), "permitted", "restricted", "hidden-news"].map(rawArticleId => ({ id: `in-${rawArticleId}`, mediaId: "m1", rawArticleId })));
    await database.insert(schema.mediaInboxItem).values({ id: "in-foreign", mediaId: "m2", rawArticleId: "foreign" });
    const first = await data(); assert.equal(first.total, 62); assert.equal(first.articles.length, 20); assert.equal(first.pageCount, 4); assert.equal(first.stats.total, 62);
    assert.deepEqual(first.sources.map((row: { id: string }) => row.id), ["s1", "s2"]);
    assert.deepEqual(first.categories, ["اقتصاد", "سیاسی"]);
    const allIds = new Set<string>();
    for (let page = 1; page <= 4; page++) for (const row of (await data(`?page=${page}`)).articles) { assert.ok(!allIds.has(row.id)); allIds.add(row.id); }
    assert.equal(allIds.size, 62); assert.equal((await data("?page=999")).page, 4);
    const older = await data(`?query=${encodeURIComponent("یک کسب")}`); assert.equal(older.total, 1); assert.equal(older.articles[0].id, "a60");
    assert.equal((await data("?query=%25")).total, 0); assert.equal((await data("?query=_")).total, 0);
    assert.equal((await data("?sourceId=s2")).total, 1); assert.equal((await data("?sourceId=hidden")).total, 0);
    assert.equal((await data(`?sourceId=s2&category=${encodeURIComponent("اقتصاد")}&status=new&period=24h`)).total, 1);
    assert.equal((await data(`?category=${encodeURIComponent("سیاسی")}`)).total, 30);
    assert.equal((await data("?status=quarantined")).articles[0].id, "a0");
    assert.equal((await data("?period=24h&sourceId=s1")).total, 24);
    assert.equal((await data("?sort=oldest")).articles[0].id, "a60"); assert.equal((await data("?sort=published")).articles[0].id, "a60");
    const detail = await data("/a60"); assert.match(detail.content, /<script>/); assert.equal("contentHtml" in detail, false);
    for (const id of ["foreign", "restricted", "hidden-news", "missing"]) assert.equal((await request(`/${id}`)).status, 404);
    for (const query of ["?page=0", "?status=bad", "?period=bad", "?sort=bad", `?query=${"a".repeat(201)}`]) assert.equal((await request(query)).status, 400);
    actor = "other"; assert.equal((await request("/a60")).status, 404); assert.equal((await data("/foreign")).id, "foreign");
    actor = "anonymous"; assert.equal((await request("/a60")).status, 401);
    actor = "owner"; await database.update(schema.mediaSourceSubscription).set({ enabled: false }).where(eq(schema.mediaSourceSubscription.id, "sub1"));
    assert.equal((await request("/a60")).status, 404); assert.equal((await data()).total, 1);
  } finally { await client.close(); globalThis.__mediaCommandPglite = undefined; }
});
