import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";

test("site brief categories come from the active platform catalog, available to admins before creating media", async t => {
  process.env.DATABASE_DRIVER = "pglite";
  process.env.PGLITE_DATA_DIR = "unused-site-category-test";
  process.env.BETTER_AUTH_SECRET = "site-category-test-only-secret-at-least-32-characters";
  const client = new PGlite();
  globalThis.__mediaCommandPglite = client;
  const database = drizzle({ client, schema });
  await migrate(database, { migrationsFolder: "./db/migrations" });
  const { auth } = await import("../src/server/auth");
  const { handleApiRequest } = await import("../src/router");
  let actor = "owner";
  t.mock.method(auth.api, "getSession", async () => actor === "anonymous" ? null : ({ user: { id: actor, name: actor, email: `${actor}@test.example` }, session: {} }));
  const request = (path: string, body?: unknown, method = body ? "POST" : "GET") => handleApiRequest(new Request(`http://local.test/api/v1${path}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));
  const brief = { mediaTopics: ["عمومی"], targetAudience: ["عموم مردم"], languages: ["فارسی"], categories: ["نام جعلی"], categoryIds: ["test-active"], contentTypes: ["خبر"], homepageFocus: ["آخرین اخبار"], features: ["جستجو"], additionalNotes: "", design: { style: "مدرن", referenceWebsite: "", contentDensity: "متعادل", colorScheme: "روشن", primaryColor: "#b62434", secondaryColor: "#ef4444", backgroundColor: "#ffffff", logoMode: "text-only", visualIdentity: "هویت بصری مشخص ندارم", fontPreference: "Vazirmatn" } };
  const spec = { title: "رسانهٔ آزمون", tagline: "", language: "fa", accent: "#b62434", layout: "lead", footer: "", blocks: [{ id: "latest", title: "آخرین خبرها", sectionIds: [], limit: 8 }], designBrief: brief };
  const input = { name: "رسانهٔ آزمون", slug: "catalog-site", spec };
  try {
    await database.insert(schema.user).values(["owner", "outsider"].map(id => ({ id, name: id, email: `${id}@test.example` })));
    await database.insert(schema.mediaAdmin).values({ userId: "owner" });
    await database.insert(schema.platformCategory).values([
      { id: "test-active", key: "test-active", nameFa: "دستهٔ فعال", nameEn: "Active", nameAr: "نشط", active: true },
      { id: "test-inactive", key: "test-inactive", nameFa: "دستهٔ غیرفعال", nameEn: "Inactive", nameAr: "غير نشط", active: false },
    ]);
    const catalog = await request("/media/source-categories");
    assert.equal(catalog.status, 200);
    const categories = (await catalog.json()).data;
    assert.ok(categories.some((category: { id: string }) => category.id === "test-active"));
    assert.ok(!categories.some((category: { id: string }) => category.id === "test-inactive"));
    actor = "outsider";
    assert.equal((await request("/media/source-categories")).status, 403);
    actor = "anonymous";
    assert.equal((await request("/media/source-categories")).status, 401);
    actor = "owner";
    await database.insert(schema.media).values({ id: "m1", name: "Media", slug: "m1", createdAt: new Date() });
    await database.insert(schema.membership).values({ id: "owner", userId: "owner", organizationId: "m1", role: "owner", createdAt: new Date() });
    for (const categoryIds of [["missing"], ["test-inactive"], []]) {
      assert.equal((await request("/sites", { ...input, spec: { ...spec, designBrief: { ...brief, categoryIds } } })).status, 400);
    }
    const response = await request("/sites", input);
    assert.equal(response.status, 201, await response.clone().text());
    const { id } = (await response.json()).data;
    const [saved] = await database.select().from(schema.mediaSite).where(eq(schema.mediaSite.id, id));
    assert.deepEqual(saved.spec.designBrief!.categoryIds, ["test-active"]);
    assert.deepEqual(saved.spec.designBrief!.categories, ["دستهٔ فعال"]);
    const { categoryIds: _ids, ...legacyBrief } = brief;
    void _ids;
    assert.equal((await request("/sites", { ...input, slug: "unlisted-category", spec: { ...spec, designBrief: legacyBrief } })).status, 400);
    await database.update(schema.platformCategory).set({ active: false }).where(eq(schema.platformCategory.id, "test-active"));
    assert.equal((await request(`/sites/${id}`, { ...input, expectedRevision: 1 }, "PATCH")).status, 400);
    const [unchanged] = await database.select().from(schema.mediaSite).where(eq(schema.mediaSite.id, id));
    assert.equal(unchanged.revision, 1);
  } finally {
    await client.close();
    globalThis.__mediaCommandPglite = undefined;
  }
});
