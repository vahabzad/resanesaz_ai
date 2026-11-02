import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";
import { editorialPromptPresets } from "../contracts/src/editorial-prompt-presets";
import type { ManagedSection } from "../contracts/src/editorial-settings";

test("suggested and user-edited prompts save and reload without replacing language or other editors", async t => {
  process.env.DATABASE_DRIVER = "pglite"; process.env.PGLITE_DATA_DIR = "unused-editorial-preset-test"; process.env.BETTER_AUTH_SECRET = "editorial-preset-test-only-secret-at-least-32-characters";
  const client = new PGlite(); globalThis.__mediaCommandPglite = client;
  const database = drizzle({ client, schema }); await migrate(database, { migrationsFolder: "./db/migrations" });
  const { auth } = await import("../src/server/auth"); const { handleApiRequest } = await import("../src/router");
  t.mock.method(auth.api, "getSession", async () => ({ user: { id: "owner", name: "Owner", email: "owner@test.example" }, session: { activeOrganizationId: "m1" } }));
  const request = (path: string, body?: unknown, method = body ? "POST" : "GET") => handleApiRequest(new Request(`http://local.test/api/v1${path}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));
  const read = async (response: Response) => { assert.ok(response.status === 200 || response.status === 201, await response.clone().text()); return (await response.json()).data; };
  try {
    await database.insert(schema.user).values({ id: "owner", name: "Owner", email: "owner@test.example" });
    await database.insert(schema.media).values({ id: "m1", name: "Media", slug: "m1", createdAt: new Date() });
    await database.insert(schema.membership).values({ id: "owner", userId: "owner", organizationId: "m1", role: "owner", createdAt: new Date() });
    const saved: ManagedSection[] = [];
    for (const preset of editorialPromptPresets) {
      const row = await read(await request("/editorial/sections", { name: `سردبیر راه‌اندازی · ${preset.title}`, settings: { language: "ar", instructions: preset.instructions, socialInstructions: preset.socialInstructions, factionId: null, viewpointStrength: 0, humor: 0, formality: 50, sourceIds: [], sourceUrls: [], categories: [] }, autoEnabled: false }));
      assert.equal(row.settings.instructions, preset.instructions); assert.equal(row.settings.socialInstructions, preset.socialInstructions); assert.equal(row.settings.language, "ar");
      saved.push(row);
    }
    const first = saved[0];
    const personal = { instructions: "این دستور کاملاً شخصی من است؛ خبر را دقیق و ساده بازنویسی کن و نسبت‌دادن ادعاها به منابع را حفظ کن.", socialInstructions: "برای شبکهٔ اجتماعی یک متن کوتاه و مستقل با حفظ نام‌ها، عددها و انتساب منبع بنویس؛ هیچ اطلاعات تازه‌ای اضافه نکن." };
    await read(await request(`/editorial/sections/${first.id}`, { name: first.name, expectedRevision: first.revision, archived: false, settings: { ...first.settings, ...personal }, autoEnabled: false }, "PATCH"));
    const reloaded = await read(await request("/editorial"));
    const edited = reloaded.sections.find((row: { id: string }) => row.id === first.id);
    assert.equal(edited.settings.instructions, personal.instructions); assert.equal(edited.settings.socialInstructions, personal.socialInstructions); assert.equal(edited.settings.language, "ar");
    assert.equal(reloaded.sections.find((row: { id: string }) => row.id === saved[1].id).settings.instructions, editorialPromptPresets[1].instructions);
  } finally { await client.close(); globalThis.__mediaCommandPglite = undefined; }
});
