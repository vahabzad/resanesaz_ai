import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";

config({ path: ".env.local" });

const email = "sara@didban.local";
const password = "MediaDemo-2026!";

async function seed() {
  const [{ auth, cliDb, closeCliDatabase }, schema] = await Promise.all([
    import("../auth.cli"),
    import("../db/schema"),
  ]);

  try {
    const existingUsers = await cliDb.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email)).limit(1);

    if (!existingUsers[0]) {
      const result = await auth.api.signUpEmail({
        body: { name: "سارا احمدی", email, password },
      });
      if (!result.user?.id) throw new Error("Seed user could not be created.");
    }

    const [seedUser] = await cliDb.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email)).limit(1);
    if (!seedUser) throw new Error("Seed user is missing after sign-up.");

    const mediaSeeds = [
      { id: "media_didban_farda", name: "دیدبان فردا", slug: "didban-farda" },
      { id: "media_nabz_fanavari", name: "نبض فناوری", slug: "nabz-fanavari" },
    ];

    for (const item of mediaSeeds) {
      await cliDb.insert(schema.media).values({ ...item, createdAt: new Date() }).onConflictDoNothing();
      await cliDb.insert(schema.membership).values({
        id: `membership_${item.id}_${seedUser.id}`,
        organizationId: item.id,
        userId: seedUser.id,
        role: "owner",
        createdAt: new Date(),
      }).onConflictDoNothing();
    }

    const existingSeedAudit = await cliDb
      .select({ id: schema.auditEvent.id })
      .from(schema.auditEvent)
      .where(eq(schema.auditEvent.correlationId, "seed:phase-one"))
      .limit(1);

    if (!existingSeedAudit[0]) {
      await cliDb.insert(schema.auditEvent).values({
        id: randomUUID(),
        mediaId: mediaSeeds[0].id,
        actorUserId: seedUser.id,
        action: "system.seed.completed",
        targetType: "workspace",
        correlationId: "seed:phase-one",
        metadata: { mediaCount: mediaSeeds.length },
      });
    }

    console.log(`Seed complete: ${email} / ${mediaSeeds.length} media workspaces`);
  } finally {
    await closeCliDatabase();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
