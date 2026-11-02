import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, createAccessControl, organization } from "better-auth/plugins";
import * as schema from "@/db/schema";
import { db } from "@/src/server/database";
import { mediaAccess, mediaRoles } from "@/src/server/permissions";

function required(name: "BETTER_AUTH_SECRET") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function configuredOrigins(value: string | undefined) {
  if (!value) return [];

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => new URL(origin).origin);
}

const baseURL = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";
const adminAccessControl = createAccessControl({ user: ["impersonate"], session: [] });
const platformSuperAdminRole = adminAccessControl.newRole({ user: ["impersonate"], session: [] });
const mediaAdminRole = adminAccessControl.newRole({ user: [], session: [] });

export const auth = betterAuth({
  appName: "اتاق فرمان رسانه",
  baseURL,
  trustedOrigins: Array.from(new Set([
    new URL(baseURL).origin,
    ...configuredOrigins(process.env.BETTER_AUTH_TRUSTED_ORIGINS),
  ])),
  secret: required("BETTER_AUTH_SECRET"),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    autoSignIn: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: false },
  },
  advanced: {
    cookiePrefix: "media_command",
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  plugins: [
    admin({
      ac: adminAccessControl,
      roles: { admin: platformSuperAdminRole, user: mediaAdminRole },
      adminRoles: ["admin"],
      defaultRole: "user",
      impersonationSessionDuration: 60 * 60,
    }),
    organization({
      ac: mediaAccess,
      roles: mediaRoles,
      allowUserToCreateOrganization: false,
      schema: {
        organization: { modelName: "media" },
        member: { modelName: "membership" },
        invitation: { modelName: "mediaInvitation" },
      },
    }),
  ],
});
