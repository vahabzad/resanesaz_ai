import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";

test("admin article management paginates and deletes an exact source/category cohort with audited Inbox cascade", async (t) => {
  process.env.DATABASE_DRIVER = "pglite";
  process.env.PGLITE_DATA_DIR = "unused-in-memory-test";
  process.env.BETTER_AUTH_SECRET = "test-only-articles-auth-secret-32-characters";
  const client = new PGlite();
  globalThis.__mediaCommandPglite = client;
  const database = drizzle({ client, schema });
  await migrate(database, { migrationsFolder: "./db/migrations" });
  const { auth } = await import("../src/server/auth");
  const { handleApiRequest } = await import("../src/router");
  let actor: string | null = null;
  t.mock.method(auth.api, "getSession", async () => actor ? { user: { id: actor }, session: {} } : null);
  const request = (path = "articles", body?: unknown) => handleApiRequest(new Request(`http://local.test/api/v1/platform/${path}`, {
    method: body === undefined ? "GET" : "POST", headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  const json = async (response: Response) => { assert.equal(response.status, 200); return (await response.json()).data; };
  const filters = { query: "", sourceId: "", category: "", status: "" };
  try {
    await database.insert(schema.user).values([{ id: "admin", name: "Admin", email: "admin@example.test" }, { id: "owner", name: "Owner", email: "owner@example.test" }, { id: "other-admin", name: "Other", email: "other@example.test" }]);
    await database.insert(schema.platformAdmin).values([{ userId: "admin" }, { userId: "other-admin" }]);
    await database.insert(schema.media).values([{ id: "m1", name: "One", slug: "one", createdAt: new Date() }, { id: "m2", name: "Two", slug: "two", createdAt: new Date() }]);
    await database.insert(schema.membership).values({ id: "membership", userId: "owner", organizationId: "m1", role: "owner", createdAt: new Date() });
    await database.insert(schema.source).values([{ id: "a", name: "A", url: "https://a.example.test", adapterKey: "web" }, { id: "b", name: "B", url: "https://b.example.test", adapterKey: "web" }]);
    await database.insert(schema.crawlerDefinition).values([{ id: "def-a", sourceId: "a", adapterKey: "web" }, { id: "def-b", sourceId: "b", adapterKey: "web" }]);
    await database.insert(schema.crawlerVersion).values([{ id: "v-a", definitionId: "def-a", version: 1, status: "active", config: {} }, { id: "v-b", definitionId: "def-b", version: 1, status: "active", config: {} }]);
    await database.insert(schema.crawlRun).values([{ id: "run-a", sourceId: "a", crawlerVersionId: "v-a", correlationId: "a" }, { id: "run-b", sourceId: "b", crawlerVersionId: "v-b", correlationId: "b" }]);
    await database.insert(schema.mediaSourceSubscription).values({ id: "subscription", mediaId: "m1", sourceId: "a" });
    await database.insert(schema.rawArticle).values(Array.from({ length: 14 }, (_, index) => ({
      id: `article-${index}`, sourceId: index < 12 ? "a" : "b", crawlRunId: index < 12 ? "run-a" : "run-b",
      title: index === 11 ? "100% news" : `Article ${index}`, canonicalUrl: `https://a.example.test/news/${index}`, contentHash: `hash-${index}`,
      categories: index % 2 === 0 ? ["Sports"] : ["Politics"], status: index === 0 ? "quarantined" : "new",
      ingestedAt: new Date("2026-01-01T00:00:00Z"),
    })));
    await database.insert(schema.mediaInboxItem).values(Array.from({ length: 14 }, (_, index) => ["m1", "m2"].map((mediaId) => ({ id: `${mediaId}-${index}`, mediaId, rawArticleId: `article-${index}` }))).flat());
    for (const candidate of [null, "owner"]) {
      actor = candidate;
      assert.equal((await request()).status, 403);
      assert.equal((await request("articles/article-0")).status, 403);
      assert.equal((await request("articles/delete-preview", { mode: "all", filters })).status, 403);
      assert.equal((await request("articles/delete", { token: "invalid", confirmed: true })).status, 403);
    }
    actor = "admin";
    await database.update(schema.rawArticle).set({ content: "Stored body <script>must remain text</script>", contentHtml: '<img src="http://127.0.0.1/private"><script>unsafe()</script>', imageUrl: "javascript:unsafe()" }).where(eq(schema.rawArticle.id, "article-0"));
    const detail = await json(await request("articles/article-0"));
    assert.equal(detail.content, "Stored body <script>must remain text</script>");
    assert.equal(detail.imageUrl, null);
    assert.deepEqual(detail.inlineImageUrls, []);
    assert.equal("contentHtml" in detail, false);
    assert.equal((await request("articles/missing")).status, 404);
    const first = await json(await request("articles?pageSize=10"));
    assert.equal(first.total, 14); assert.equal(first.articles.length, 10); assert.equal(first.pageCount, 2);
    assert.deepEqual(first.categories, ["Politics", "Sports"]);
    const last = await json(await request("articles?pageSize=10&page=999"));
    assert.equal(last.page, 2); assert.equal(last.articles.length, 4);
    assert.equal(new Set([...first.articles, ...last.articles].map((item: { id: string }) => item.id)).size, 14);
    const targeted = await json(await request("articles?sourceId=a&category=Sports"));
    assert.equal(targeted.total, 6);
    assert.equal((await json(await request("articles?status=quarantined"))).total, 1);
    assert.equal((await json(await request("articles?query=%25"))).total, 1);
    assert.equal((await json(await request("articles?category=Sports%27%20OR%201%3D1"))).total, 0);
    assert.equal((await request("articles?page=0")).status, 400);
    assert.equal((await request("articles?pageSize=999")).status, 400);
    assert.equal((await request("articles/delete", { confirmed: true })).status, 400);
    const preview = await json(await request("articles/delete-preview", { mode: "filtered", filters: { ...filters, sourceId: "a", category: "Sports" } }));
    assert.equal(preview.articleCount, 6); assert.equal(preview.inboxCount, 12);
    const pieces = preview.token.split(".");
    const tampered = JSON.parse(Buffer.from(pieces[0], "base64url").toString());
    tampered.filters = filters;
    assert.equal((await request("articles/delete", { token: Buffer.from(JSON.stringify(tampered)).toString("base64url") + "." + pieces[1], confirmed: true })).status, 409);
    actor = "other-admin";
    assert.equal((await request("articles/delete", { token: preview.token, confirmed: true })).status, 409);
    actor = "admin";
    const now = Date.now();
    const dateMock = t.mock.method(Date, "now", () => now + 11 * 60_000);
    assert.equal((await request("articles/delete", { token: preview.token, confirmed: true })).status, 409);
    dateMock.mock.restore();
    await database.insert(schema.rawArticle).values({ id: "fresh", sourceId: "a", crawlRunId: "run-a", title: "Fresh", canonicalUrl: "https://a.example.test/fresh", contentHash: "fresh", categories: ["Sports"], ingestedAt: new Date(Date.parse(preview.cutoff) + 60_000) });
    const deleted = await json(await request("articles/delete", { token: preview.token, confirmed: true }));
    assert.deepEqual(deleted, { deletedArticles: 6, deletedInboxItems: 12 });
    assert.equal((await database.select().from(schema.rawArticle)).length, 9);
    assert.equal((await database.select().from(schema.mediaInboxItem)).length, 16);
    assert.equal((await database.select().from(schema.source)).length, 2);
    assert.equal((await database.select().from(schema.crawlRun)).length, 2);
    assert.equal((await database.select().from(schema.mediaSourceSubscription)).length, 1);
    assert.equal((await json(await request("articles?sourceId=b"))).total, 2);
    assert.equal((await json(await request("articles?sourceId=a&category=Sports"))).total, 1);
    const replay = await json(await request("articles/delete", { token: preview.token, confirmed: true }));
    assert.equal(replay.deletedArticles, 0);
    const all = await json(await request("articles/delete-preview", { mode: "all", filters: { ...filters, sourceId: "missing" } }));
    assert.equal(all.articleCount, 8); // Future-ingested fixture remains beyond this preview's cutoff.
    const deletedAll = await json(await request("articles/delete", { token: all.token, confirmed: true }));
    assert.deepEqual(deletedAll, { deletedArticles: 8, deletedInboxItems: 16 });
    assert.equal((await database.select().from(schema.rawArticle)).length, 1);
    const audits = await database.select().from(schema.auditEvent).where(eq(schema.auditEvent.action, "platform.articles.deleted"));
    assert.equal(audits.length, 3);
    assert.equal(audits[0].actorUserId, "admin");
    assert.equal(audits[0].mediaId, null);
    assert.equal(audits[0].metadata.deletedArticles, 6);
  } finally { await client.close(); globalThis.__mediaCommandPglite = undefined; }
});
