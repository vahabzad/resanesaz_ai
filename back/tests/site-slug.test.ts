import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";

test("site slugs are globally unique, including concurrent creates and archived sites", async t => {
  process.env.DATABASE_DRIVER = "pglite";
  process.env.PGLITE_DATA_DIR = "unused-site-slug-test";
  process.env.BETTER_AUTH_SECRET = "site-slug-test-only-secret-at-least-32-characters";
  const client = new PGlite();
  globalThis.__mediaCommandPglite = client;
  const database = drizzle({ client, schema });
  await migrate(database, { migrationsFolder: "./db/migrations" });
  const { auth } = await import("../src/server/auth");
  const { handleApiRequest } = await import("../src/router");
  let activeMediaId = "m1";
  t.mock.method(auth.api, "getSession", async () => ({ user: { id: "owner", name: "Owner", email: "owner@test.example" }, session: { activeOrganizationId: activeMediaId } }));
  const spec = { title: "رسانهٔ آزمون", tagline: "", language: "fa", accent: "#b62434", layout: "lead", footer: "", blocks: [{ id: "latest", title: "آخرین خبرها", sectionIds: [], limit: 8 }] };
  const create = (slug: string) => handleApiRequest(new Request("http://local.test/api/v1/sites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "رسانهٔ آزمون", slug, spec }) }));
  const expectConflict = async (response: Response) => {
    assert.equal(response.status, 409, await response.clone().text());
    assert.match((await response.json()).error.message, /شناسهٔ نشانی قبلاً استفاده شده/);
  };
  try {
    await database.insert(schema.user).values({ id: "owner", name: "Owner", email: "owner@test.example" });
    await database.insert(schema.media).values(["m1", "m2"].map(id => ({ id, name: id, slug: id, createdAt: new Date() })));
    await database.insert(schema.membership).values(["m1", "m2"].map(id => ({ id, userId: "owner", organizationId: id, role: "owner", createdAt: new Date() })));
    assert.equal((await create("shared-slug")).status, 201);
    await expectConflict(await create("shared-slug"));
    activeMediaId = "m2";
    await expectConflict(await create("shared-slug"));
    await database.update(schema.mediaSite).set({ status: "archived" }).where(eq(schema.mediaSite.slug, "shared-slug"));
    await expectConflict(await create("shared-slug"));
    const concurrent = await Promise.all([create("concurrent-slug"), create("concurrent-slug")]);
    assert.deepEqual(concurrent.map(response => response.status).sort(), [201, 409]);
    await expectConflict(concurrent.find(response => response.status === 409)!);
    const rows = await database.select().from(schema.mediaSite);
    assert.equal(rows.length, 2);
    assert.equal(rows.find(row => row.slug === "shared-slug")!.mediaId, "m1");
    const events = await database.select().from(schema.auditEvent).where(eq(schema.auditEvent.action, "site.created"));
    assert.equal(events.length, 2);
  } finally {
    await client.close();
    globalThis.__mediaCommandPglite = undefined;
  }
});
