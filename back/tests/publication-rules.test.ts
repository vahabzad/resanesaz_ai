import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";

test("publication policy: scoped rules, approval cutoff, routing, primary arbitration, dependencies, revision and withdrawal", async t => {
  process.env.DATABASE_DRIVER = "pglite"; process.env.PGLITE_DATA_DIR = "unused-rules-test"; process.env.BETTER_AUTH_SECRET = "rules-test-fixture-only-at-least-32-characters";
  const client = new PGlite(); globalThis.__mediaCommandPglite = client;
  const database = drizzle({ client, schema }); await migrate(database, { migrationsFolder: "./db/migrations" });
  const { auth } = await import("../src/server/auth"); const { handleApiRequest } = await import("../src/router");
  const { runPublicationRulesCycle } = await import("../src/server/publication-rules"); const { runWebPublicationCycle } = await import("../src/server/web-publications");
  let user = "owner";
  t.mock.method(auth.api, "getSession", async () => ({ user: { id: user, name: user, email: `${user}@test.example` }, session: { activeOrganizationId: user === "other" ? "m2" : "m1" } }));
  const request = (path: string, body?: unknown, method = body === undefined ? "GET" : "POST") => handleApiRequest(new Request(`http://local.test/api/v1${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }));
  const value = async (r: Response, status = 200) => { assert.equal(r.status, status, await r.clone().text()); return (await r.json()).data; };
  const settings = { factionId: null, viewpointStrength: 0, humor: 0, formality: 70, sourceIds: [], categories: [] };
  try {
    await database.insert(schema.user).values(["owner", "other", "viewer"].map(id => ({ id, name: id, email: `${id}@test.example` })));
    await database.insert(schema.media).values(["m1", "m2"].map(id => ({ id, name: id, slug: id, createdAt: new Date() })));
    await database.insert(schema.mediaCreationRequest).values(["m1", "m2"].map(mediaId => ({ mediaId, status: "approved" as const })));
    await database.insert(schema.membership).values([["owner", "m1", "owner"], ["other", "m2", "owner"], ["viewer", "m1", "viewer"]].map(([userId, organizationId, role]) => ({ id: userId, userId, organizationId, role, createdAt: new Date() })));
    await database.insert(schema.editorialSection).values(["neutral", "economy", "sport"].map(id => ({ id, mediaId: "m1", name: id, settings })));
    await database.insert(schema.editorialSection).values({ id: "foreign", mediaId: "m2", name: "foreign", settings });
    await database.insert(schema.editorialPolicy).values({ id: "policy", mediaId: "m1", instructions: "Fixture" });
    await database.insert(schema.editorialPolicy).values({ id: "english", mediaId: "m1", instructions: "Fixture", settingsSnapshot: { platformConfigId: "fixture", platformRevision: 1, instructions: "Fixture", sectionName: "neutral", sectionRevision: 1, settings: { ...settings, language: "en" }, faction: null } });
    const cutoff = "2026-10-01T00:00:00.000Z";
    async function story(id: string, sectionId = "neutral", secondarySectionIds: string[] = ["economy"], policyId = "policy", approved = "2026-10-02T00:00:00.000Z") {
      await database.insert(schema.editorialStory).values({ id, mediaId: "m1", status: "approved" });
      await database.insert(schema.articleVersion).values({ id: `v-${id}`, mediaId: "m1", storyId: id, revision: 1, sectionId, secondarySectionIds, policyId, title: `Title ${id}`, lead: `Lead ${id}`, body: `Full body ${id} `.repeat(30) });
      await database.insert(schema.editorialApproval).values({ id: `approval-${id}`, mediaId: "m1", versionId: `v-${id}`, decision: "approved", note: "Fixture", createdAt: new Date(approved) });
    }
    const spec = { title: "آزمون توزیع", tagline: "آزمایشی", language: "fa", accent: "#a82937", layout: "lead", footer: "آزمون", blocks: [{ id: "latest", title: "تازه‌ها", sectionIds: [], limit: 6 }] };
    async function site(slug: string) { const created = await value(await request("/sites", { name: slug, slug, spec }), 201); await value(await request(`/sites/${created.id}/lifecycle`, { expectedRevision: 1, action: "activate" })); return created.id as string; }
    const first = await site("primary-site"); const second = await site("secondary-site"); const third = await site("summary-site");
    const rule = { name: "اقتصاد از بی‌طرف", siteId: first, enabled: true, settings: { serviceIds: ["neutral"], sectionIds: ["economy"], language: "fa", mode: "automatic", role: "primary", approvedSince: cutoff } };
    await story("eligible"); await story("old", "neutral", ["economy"], "policy", "2026-09-01T00:00:00.000Z"); await story("wrong-section", "neutral", ["sport"]); await story("wrong-service", "sport", ["economy"]); await story("wrong-language", "neutral", ["economy"], "english");
    const preview = await value(await request("/publication-rules/preview", rule)); assert.equal(preview.total, 1); assert.equal(preview.samples[0].versionId, "v-eligible"); assert.equal((await database.select().from(schema.webPublicationJob)).length, 0);
    user = "viewer"; assert.equal((await request("/publication-rules", rule)).status, 403); user = "other"; assert.equal((await request("/publication-rules/preview", rule)).status, 404); user = "owner";
    assert.equal((await request("/publication-rules", { ...rule, settings: { ...rule.settings, serviceIds: ["foreign"] } })).status, 409);
    const created = await value(await request("/publication-rules", rule), 201);
    const cycles = await Promise.all([runPublicationRulesCycle(), runPublicationRulesCycle()]); assert.equal(cycles.reduce((sum, r) => sum + r.queued, 0), 1);
    assert.equal((await value(await request("/publication-rules/preview", rule))).alreadyRegistered, 1);
    // Editing a rule cancels its own queued work but cannot cancel a manual destination.
    const manual = await value(await request("/publications", { siteId: second, versionId: "v-eligible", role: "republication" }), 202);
    await value(await request(`/publication-rules/${created.id}`, { ...rule, enabled: false, expectedRevision: 1 }, "PATCH"));
    assert.equal((await request(`/publication-rules/${created.id}`, { ...rule, expectedRevision: 1 }, "PATCH")).status, 409);
    assert.equal((await database.select().from(schema.webPublicationJob).where(eq(schema.webPublicationJob.id, manual.id)))[0].status, "queued");
    assert.equal((await database.select().from(schema.webPublicationJob).where(eq(schema.webPublicationJob.ruleId, created.id)))[0].status, "cancelled");
    await value(await request(`/publication-rules/${created.id}`, { ...rule, expectedRevision: 2 }, "PATCH")); assert.equal((await runPublicationRulesCycle()).queued, 0);
    // Rule restoration preserves the cutoff and does not resurrect a cancelled version.
    const stored = (await value(await request("/publication-rules"))).rules[0]; assert.equal(stored.settings.approvedSince, cutoff);
    await value(await request(`/publications/${(await database.select().from(schema.webPublicationJob).where(eq(schema.webPublicationJob.ruleId, created.id)))[0].id}/retry`, {}));
    await runWebPublicationCycle();
    const primary = await value(await request("/public/sites/primary-site/stories/eligible")); const copy = await value(await request("/public/sites/secondary-site/stories/eligible"));
    assert.equal(primary.articles[0].seo.noindex, false); assert.equal(copy.articles[0].seo.noindex, true); assert.equal(copy.articles[0].seo.primaryPath, primary.articles[0].seo.canonicalPath);
    assert.equal((await request("/publications", { siteId: third, versionId: "v-eligible", role: "primary" })).status, 409);
    const defaultCopy = await value(await request("/publications", { siteId: third, versionId: "v-eligible" }), 202); assert.equal((await database.select().from(schema.webPublicationJob).where(eq(schema.webPublicationJob.id, defaultCopy.id)))[0].snapshot.delivery?.role, "republication");
    const panel = await value(await request("/publications/distribution/v-eligible")); assert.equal(panel.sites.length, 3); assert.equal(panel.sites.find((s: { id: string }) => s.id === first).published.role, "primary");
    // Summary can precede its primary request, never exposes full content and doesn't consume attempts while waiting.
    await story("dependency"); const summary = await value(await request("/publications", { siteId: third, versionId: "v-dependency", role: "summary" }), 202);
    await runWebPublicationCycle(); let dependency = (await database.select().from(schema.webPublicationJob).where(eq(schema.webPublicationJob.id, summary.id)))[0]; assert.equal(dependency.attempts, 0); assert.equal(dependency.errorCode, "WAITING_PRIMARY");
    await value(await request("/publications", { siteId: first, versionId: "v-dependency", role: "primary" }), 202); await runWebPublicationCycle(); await runWebPublicationCycle(new Date(Date.now() + 60000));
    const summaryPage = await value(await request("/public/sites/summary-site/stories/dependency")); assert.equal(summaryPage.articles[0].seo.role, "summary"); assert.equal(summaryPage.articles[0].webFull.body.includes("Full body"), false); assert.equal(summaryPage.articles[0].seo.primaryPath, "/s/primary-site/news/dependency");
    // The first publication date and URL survive an approved revision.
    const originalDate = primary.articles[0].publishedAt;
    await database.update(schema.editorialStory).set({ revision: 2 }).where(eq(schema.editorialStory.id, "eligible"));
    await database.insert(schema.articleVersion).values({ id: "v-eligible-2", mediaId: "m1", storyId: "eligible", revision: 2, sectionId: "neutral", policyId: "policy", title: "Revision two", lead: "New lead", body: "New approved body" });
    await database.insert(schema.editorialApproval).values({ id: "approval-two", mediaId: "m1", versionId: "v-eligible-2", decision: "approved", note: "New review" });
    await value(await request("/publications", { siteId: first, versionId: "v-eligible-2", role: "primary" }), 202); await runWebPublicationCycle(new Date(Date.now() + 1000));
    const updated = await value(await request("/public/sites/primary-site/stories/eligible")); assert.equal(updated.articles[0].publishedAt, originalDate); assert.notEqual(updated.articles[0].seo.modifiedAt, originalDate);
    // Withdrawal uses an exact version and retains history; cancelled jobs don't reappear.
    assert.equal((await request(`/sites/${first}/stories/eligible/withdraw`, { versionId: "v-eligible" })).status, 409);
    await value(await request(`/sites/${first}/stories/eligible/withdraw`, { versionId: "v-eligible-2" })); assert.equal((await request("/public/sites/primary-site/stories/eligible")).status, 404);
    assert.equal((await value(await request("/public/sites/primary-site/sitemap"))).articles.some((a: { path: string }) => a.path.endsWith("/eligible")), false);
    assert.equal((await value(await request("/public/sites/secondary-site/sitemap"))).articles.length, 0);
    assert.equal((await runPublicationRulesCycle()).queued, 0);
    // Default new activation excludes the existing approval history.
    const fresh = await value(await request("/publication-rules", { ...rule, name: "از اکنون", siteId: second, startNow: true, settings: { ...rule.settings, role: "republication" } }), 201);
    const freshRule = (await value(await request("/publication-rules"))).rules.find((r: { id: string }) => r.id === fresh.id); assert.ok(Date.parse(freshRule.settings.approvedSince) > Date.parse(cutoff));
    assert.equal((await value(await request("/publication-rules/preview", { ...rule, siteId: second, settings: freshRule.settings }))).total, 0);
    // More than one batch progresses: previously registered versions cannot starve the next page.
    await database.update(schema.publicationRule).set({ enabled: false });
    for (let i = 0; i < 24; i++) await story(`batch-${i}`);
    await value(await request("/publication-rules", { ...rule, name: "صفحه‌های بعد", siteId: first }), 201);
    assert.equal((await runPublicationRulesCycle()).queued, 20); assert.ok((await runPublicationRulesCycle()).queued >= 4);
    // Revoked owner permission prevents future automatic jobs.
    await story("revoked"); await database.update(schema.membership).set({ role: "viewer" }).where(eq(schema.membership.id, "owner")); assert.equal((await runPublicationRulesCycle()).queued, 0);
    user = "other"; assert.equal((await value(await request("/publication-rules"))).rules.length, 0); assert.equal((await request("/publications/distribution/v-eligible-2")).status, 404);
    const exact = await database.select().from(schema.siteArticle).where(and(eq(schema.siteArticle.siteId, first), eq(schema.siteArticle.storyId, "eligible"))); assert.equal(exact.length, 1);
  } finally { await client.close(); }
});
