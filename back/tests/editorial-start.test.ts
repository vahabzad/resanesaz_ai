import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";

test("automatic editorial start persists, includes boundary, respects scope and cancels excluded late work", async t => {
  process.env.DATABASE_DRIVER = "pglite"; process.env.PGLITE_DATA_DIR = "unused-start-test"; process.env.BETTER_AUTH_SECRET = "editorial-start-test-only-secret-at-least-32";
  const client = new PGlite(); globalThis.__mediaCommandPglite = client;
  const database = drizzle({ client, schema }); await migrate(database, { migrationsFolder: "./db/migrations" });
  const { auth } = await import("../src/server/auth");
  const { handleApiRequest } = await import("../src/router");
  const { getSectionCandidates } = await import("../src/server/editorial-settings");
  const { enqueueEditorialJob, scheduleEditorialJobs, runEditorialWorkerCycle, changeEditorialJob } = await import("../src/server/editorial-jobs");
  let user = "editor";
  t.mock.method(auth.api, "getSession", async () => ({ user: { id: user, name: user, email: `${user}@test.example` }, session: { activeOrganizationId: user === "other" ? "m2" : "m1" } }));
  const actor = { mediaId: "m1", actorUserId: "editor", correlationId: "test" };
  const request = (path: string, body?: unknown, method = "POST") => handleApiRequest(new Request(`http://local.test/api/v1/editorial${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }));
  const data = async (response: Response, status = 200) => { assert.equal(response.status, status, await response.clone().text()); return (await response.json()).data; };
  try {
    await database.insert(schema.user).values(["editor", "other", "viewer"].map(id => ({ id, name: id, email: `${id}@test.example` })));
    await database.insert(schema.media).values(["m1", "m2"].map(id => ({ id, name: id, slug: id, createdAt: new Date() })));
    await database.insert(schema.membership).values([["editor", "m1", "editor"], ["other", "m2", "owner"], ["viewer", "m1", "viewer"]].map(([userId, organizationId, role]) => ({ id: userId, userId, organizationId, role, createdAt: new Date() })));
    // Saved editor settings must work without a separate platform configuration.
    assert.equal((await database.select().from(schema.platformEditorialConfig)).length, 0);
    await database.insert(schema.source).values({ id: "src", name: "Source", url: "https://source.test", adapterKey: "web" });
    await database.insert(schema.crawlerDefinition).values({ id: "def", sourceId: "src", adapterKey: "web" });
    await database.insert(schema.crawlerVersion).values({ id: "cv", definitionId: "def", version: 1, config: {} });
    await database.insert(schema.crawlRun).values({ id: "run", sourceId: "src", crawlerVersionId: "cv", correlationId: "test" });
    const body = "خبر نمونه با متن کامل و اطلاعات قابل بررسی برای تحریریه. ".repeat(8);
    const cutoff = "2026-10-14T00:00:00+03:30";
    const times = { old: "2026-10-13T20:29:59Z", boundary: "2026-10-13T20:30:00Z", newer: "2026-10-14T02:00:00Z", foreign: "2026-10-14T03:00:00Z" };
    await database.insert(schema.rawArticle).values(Object.entries(times).map(([id, time]) => ({ id, sourceId: "src", crawlRunId: "run", title: `Headline ${id}`, content: body, canonicalUrl: `https://source.test/${id}`, categories: ["News"], contentHash: id, ingestedAt: new Date(time), publishedAt: new Date("2020-01-01") })));
    await database.insert(schema.mediaInboxItem).values(Object.keys(times).map(id => ({ id: `i-${id}`, mediaId: id === "foreign" ? "m2" : "m1", rawArticleId: id })));
    const settings = { autoFreshness: { maxAgeHours: null, unknownDatePolicy: "received" as const, resumeMode: "continue" as const }, instructions: "Use the saved newsroom instructions and preserve all verified facts.", socialInstructions: "Use the saved social instructions and preserve attribution.", language: "fa", factionId: null, viewpointStrength: 0, humor: 0, formality: 70, sourceIds: ["src"], categories: ["News"] };
    let section = await data(await request("/sections", { name: "Start test", settings: { ...settings, autoReceivedSince: cutoff }, autoEnabled: true, autoBatchSize: 10 }), 201);
    const patch = (overrides: Record<string, unknown> = {}) => request(`/sections/${section.id}`, { name: section.name, settings: section.settings, autoEnabled: true, autoBatchSize: 10, expectedRevision: section.revision, archived: false, ...overrides }, "PATCH");
    assert.deepEqual((await getSectionCandidates("m1", section.id, true)).map(a => a.id), ["newer", "boundary"]);
    assert.equal((await getSectionCandidates("m1", section.id)).length, 3); // Manual selection remains unrestricted.
    await assert.rejects(enqueueEditorialJob(actor, section.id, "old", "automatic"), /نقطهٔ شروع/);
    assert.equal(await scheduleEditorialJobs(), 2);
    assert.equal(await scheduleEditorialJobs(), 0);
    const manual = await enqueueEditorialJob(actor, section.id, "old");
    // Narrow the range while a worker is waiting for a response. Its output must be discarded.
    let rewriteCalled = false;
    await runEditorialWorkerCycle(async input => {
      rewriteCalled = true;
      assert.equal(input.policy.platformConfigId, "builtin-default");
      assert.equal(input.policy.instructions, settings.instructions);
      assert.equal(input.policy.settings.socialInstructions, settings.socialInstructions);
      assert.equal(input.policy.settings.language, settings.language);
      section = await data(await patch({ startAutoNow: true }));
      return { title: "عنوان تحریرشده", lead: "لید", body, sourceKeys: [input.sourceKey], reviewRequired: false };
    });
    assert.equal(rewriteCalled, true);
    assert.equal((await database.select().from(schema.editorialStory)).length, 0);
    const jobs = await database.select().from(schema.editorialJob);
    assert.equal(jobs.filter(j => j.trigger === "automatic" && j.status === "cancelled" && j.errorCode === "AUTO_START_CHANGED").length, 2);
    assert.equal(jobs.find(j => j.id === manual.id)?.status, "queued");
    const savedStart = section.settings.autoReceivedSince;
    assert.ok(Number.isFinite(Date.parse(savedStart)));
    // Omission by an older client, disabling, stop/resume and a fresh workspace read preserve the anchor.
    section = await data(await patch({ settings, autoEnabled: false }));
    assert.equal(section.settings.autoReceivedSince, savedStart);
    section = await data(await request(`/sections/${section.id}/stop`, { expectedRevision: section.revision }));
    section = await data(await request(`/sections/${section.id}/resume`, { expectedRevision: section.revision }));
    const workspace = await data(await request("", undefined, "GET"));
    assert.equal(workspace.sections.find((s: { id: string }) => s.id === section.id).settings.autoReceivedSince, savedStart);
    assert.equal((await getSectionCandidates("m1", section.id, true)).length, 0);
    // Clearing the start explicitly retains historical idempotency; cancelled jobs require a manual retry.
    section = await data(await patch({ settings: { ...settings, autoReceivedSince: null } }));
    assert.equal((await getSectionCandidates("m1", section.id, true)).length, 0);
    assert.equal((await enqueueEditorialJob(actor, section.id, "boundary", "automatic")).duplicate, true);
    await changeEditorialJob(actor, jobs.find(j => j.inputKey === "boundary")!.id, "retry");
    assert.equal((await database.select().from(schema.editorialJob).where(eq(schema.editorialJob.inputKey, "boundary")))[0].trigger, "manual");
    // Invalid dates, stale revisions and unauthorized users cannot change the anchor.
    for (const date of ["2026-02-30T00:00:00Z", "2026-10-14T00:00", "nonsense"]) {
      assert.equal((await patch({ settings: { ...settings, autoReceivedSince: date } })).status, 400);
    }
    assert.equal((await patch({ expectedRevision: 1, startAutoNow: true })).status, 409);
    user = "viewer"; assert.equal((await patch({ startAutoNow: true })).status, 403);
    user = "other"; assert.equal((await patch({ startAutoNow: true })).status, 404);
    user = "editor";
    const legacy = await data(await request("/sections", { name: "Legacy", settings }), 201);
    assert.equal(legacy.settings.autoReceivedSince, null);
    assert.equal((await getSectionCandidates("m1", legacy.id, true)).length, 3);
    const before = Date.now();
    const fresh = await data(await request("/sections", { name: "Fresh", settings, startAutoNow: true, autoEnabled: true }), 201);
    assert.ok(Date.parse(fresh.settings.autoReceivedSince) >= before);
    assert.ok(Date.parse(fresh.settings.autoReceivedSince) <= Date.now());
    await database.insert(schema.rawArticle).values({ id: "arrived-after-start", sourceId: "src", crawlRunId: "run", title: "New arrival", content: body, canonicalUrl: "https://source.test/arrival", categories: ["News"], contentHash: "arrived-after-start", ingestedAt: new Date(Date.parse(fresh.settings.autoReceivedSince) + 1) });
    await database.insert(schema.mediaInboxItem).values({ id: "new-inbox", mediaId: "m1", rawArticleId: "arrived-after-start" });
    assert.deepEqual((await getSectionCandidates("m1", fresh.id, true)).map(a => a.id), ["arrived-after-start"]);
    const future = await data(await request("/sections", { name: "Future", settings: { ...settings, autoReceivedSince: "2099-01-01T00:00:00Z" }, autoEnabled: true }), 201);
    assert.equal((await getSectionCandidates("m1", future.id, true)).length, 0);
    assert.equal(await scheduleEditorialJobs(), 2); // The new input once in each active eligible service.
  } finally { await client.close(); }
});
