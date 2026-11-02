import { config } from "dotenv";
import { eq } from "drizzle-orm";

config({ path: ".env.local" });

function requiredEnvironmentValue(key: string) {
  const value = process.env[key];
  if (!value?.trim()) throw new Error("متغیرهای bootstrap سوپر ادمین باید در محیط امن تنظیم شوند.");
  return value;
}

const name = requiredEnvironmentValue("BOOTSTRAP_SUPER_ADMIN_NAME").trim();
const email = requiredEnvironmentValue("BOOTSTRAP_SUPER_ADMIN_EMAIL").trim().toLowerCase();
const password = requiredEnvironmentValue("BOOTSTRAP_SUPER_ADMIN_PASSWORD");

if (password.length < 12 || password.length > 128) {
  throw new Error("گذرواژهٔ سوپر ادمین باید بین ۱۲ تا ۱۲۸ نویسه باشد.");
}

async function bootstrapSuperAdmin() {
  const [{ auth, cliDb, closeCliDatabase }, schema] = await Promise.all([
    import("../auth.cli"),
    import("../db/schema"),
  ]);

  try {
    const [existingAdmin] = await cliDb
      .select({ userId: schema.platformAdmin.userId })
      .from(schema.platformAdmin)
      .limit(1);

    if (existingAdmin) {
      const [matchingAdmin] = await cliDb
        .select({ userId: schema.platformAdmin.userId })
        .from(schema.platformAdmin)
        .innerJoin(schema.user, eq(schema.user.id, schema.platformAdmin.userId))
        .where(eq(schema.user.email, email))
        .limit(1);
      if (matchingAdmin) {
        console.log("سوپر ادمین از قبل bootstrap شده است.");
        return;
      }
      throw new Error("سوپر ادمین دیگری وجود دارد؛ bootstrap نصب اولیه مجاز نیست.");
    }

    const [anyUser] = await cliDb.select({ id: schema.user.id }).from(schema.user).limit(1);
    if (anyUser) throw new Error("bootstrap فقط روی دیتابیس بدون کاربر مجاز است.");

    const result = await auth.api.signUpEmail({ body: { name, email, password } });
    if (!result.user?.id) throw new Error("ساخت حساب سوپر ادمین ناموفق بود.");

    try {
      await cliDb.update(schema.user).set({ role: "admin" }).where(eq(schema.user.id, result.user.id));
      await cliDb.insert(schema.platformAdmin).values({ userId: result.user.id });
    } catch (error) {
      await cliDb.delete(schema.user).where(eq(schema.user.id, result.user.id));
      throw error;
    }

    console.log("اولین سوپر ادمین ساخته شد؛ رسانه یا دادهٔ نمونه‌ای ایجاد نشد.");
  } finally {
    await closeCliDatabase();
  }
}

bootstrapSuperAdmin().catch((error) => {
  console.error(error instanceof Error ? error.message : "Bootstrap ناموفق بود.");
  process.exitCode = 1;
});
