import { and, count, desc, eq } from "drizzle-orm";
import type { CreatePlatformMediaAdmin, PlatformMediaAdmin } from "@media/contracts/platform-admins";
import { account, mediaAdmin, membership, user } from "@/db/schema";
import { recordAuditEvent } from "@/src/server/audit";
import { auth } from "@/src/server/auth";
import { db } from "@/src/server/database";

export class PlatformMediaAdminError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) {
    super(message);
    this.name = "PlatformMediaAdminError";
  }
}

export async function listPlatformMediaAdmins(): Promise<PlatformMediaAdmin[]> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: mediaAdmin.createdAt,
      mediaCount: count(membership.id),
    })
    .from(mediaAdmin)
    .innerJoin(user, eq(user.id, mediaAdmin.userId))
    .leftJoin(membership, eq(membership.userId, mediaAdmin.userId))
    .groupBy(mediaAdmin.userId, mediaAdmin.createdAt, user.id, user.name, user.email)
    .orderBy(desc(mediaAdmin.createdAt), desc(mediaAdmin.userId));

  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function createPlatformMediaAdmin(
  input: CreatePlatformMediaAdmin,
  actorUserId: string,
  correlationId: string,
): Promise<PlatformMediaAdmin> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.initialPassword;
  if (name.length < 2 || name.length > 120 || !email || password.length < 12 || password.length > 128) {
    throw new PlatformMediaAdminError("نام، ایمیل یا گذرواژهٔ اولیه معتبر نیست.", 400);
  }

  const context = await auth.$context;
  if (await context.internalAdapter.findUserByEmail(email)) {
    throw new PlatformMediaAdminError("حسابی با این ایمیل از قبل وجود دارد.", 409);
  }

  const passwordHash = await context.password.hash(password);
  const createdUser = await context.internalAdapter.createUser(
    { name, email, image: null, emailVerified: false },
    { method: "email-password" },
  );

  try {
    await context.internalAdapter.linkAccount({
      accountId: createdUser.id,
      providerId: "credential",
      userId: createdUser.id,
      password: passwordHash,
    });

    const createdAt = new Date();
    await db.transaction(async (tx) => {
      await tx.insert(mediaAdmin).values({ userId: createdUser.id, createdBy: actorUserId, createdAt });
      await recordAuditEvent({
        actorUserId,
        action: "platform.media_admin.created",
        targetType: "media_admin",
        targetId: createdUser.id,
        correlationId,
        metadata: { email, name },
      }, tx);
    });

    return { id: createdUser.id, name, email, createdAt: createdAt.toISOString(), mediaCount: 0 };
  } catch (error) {
    await context.internalAdapter.deleteUser(createdUser.id).catch(() => undefined);
    throw error;
  }
}

export async function updatePlatformMediaAdmin(
  userId: string,
  input: { name: string; email: string; initialPassword?: string },
  actorUserId: string,
  correlationId: string,
): Promise<PlatformMediaAdmin> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 2 || name.length > 120 || !email || (input.initialPassword !== undefined && (input.initialPassword.length < 12 || input.initialPassword.length > 128))) {
    throw new PlatformMediaAdminError("نام، ایمیل یا گذرواژه معتبر نیست.", 400);
  }
  const [target] = await db.select({ id: user.id, createdAt: mediaAdmin.createdAt, email: user.email })
    .from(mediaAdmin).innerJoin(user, eq(user.id, mediaAdmin.userId)).where(eq(user.id, userId)).limit(1);
  if (!target) throw new PlatformMediaAdminError("ادمین پیدا نشد.", 404);
  if (email !== target.email) {
    const context = await auth.$context;
    const duplicate = await context.internalAdapter.findUserByEmail(email);
    if (duplicate && duplicate.user.id !== userId) throw new PlatformMediaAdminError("حسابی با این ایمیل از قبل وجود دارد.", 409);
  }
  const context = await auth.$context;
  await context.internalAdapter.updateUser(userId, { name, email, ...(email !== target.email ? { emailVerified: false } : {}) });
  if (input.initialPassword) {
    const password = await context.password.hash(input.initialPassword);
    const [credential] = await db.select({ id: account.id }).from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential"))).limit(1);
    if (!credential) throw new PlatformMediaAdminError("اطلاعات ورود ادمین پیدا نشد.", 404);
    await context.internalAdapter.updateAccount(credential.id, { password });
    await context.internalAdapter.deleteUserSessions(userId);
  }
  await recordAuditEvent({ actorUserId, action: "platform.media_admin.updated", targetType: "media_admin", targetId: userId, correlationId, metadata: { email, name, passwordReset: Boolean(input.initialPassword) } });
  const [membershipCount] = await db.select({ value: count(membership.id) }).from(membership).where(eq(membership.userId, userId));
  return { id: userId, name, email, createdAt: target.createdAt.toISOString(), mediaCount: membershipCount.value };
}

export async function deletePlatformMediaAdmin(userId: string, actorUserId: string, correlationId: string) {
  const [target] = await db.select({ email: user.email }).from(mediaAdmin)
    .innerJoin(user, eq(user.id, mediaAdmin.userId)).where(eq(user.id, userId)).limit(1);
  if (!target) throw new PlatformMediaAdminError("ادمین پیدا نشد.", 404);
  const [mediaMembershipCount] = await db.select({ value: count(membership.id) }).from(membership).where(eq(membership.userId, userId));
  if (mediaMembershipCount.value > 0) throw new PlatformMediaAdminError("این ادمین هنوز عضو رسانه است؛ پیش از حذف، عضویت‌های رسانه‌ای او را منتقل یا حذف کنید.", 409);
  await recordAuditEvent({ actorUserId, action: "platform.media_admin.deleted", targetType: "media_admin", targetId: userId, correlationId, metadata: { email: target.email } });
  const context = await auth.$context;
  await context.internalAdapter.deleteUser(userId);
}
