import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, createAccessControl, organization } from "better-auth/plugins";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { Pool } from "pg";
import * as schema from "./db/schema";
import { mediaAccess, mediaRoles } from "./src/server/permissions";

// Better Auth CLI cannot load modules guarded by `server-only`, so schema
// generation uses this isolated config. Keep plugin/schema options aligned
// with lib/server/auth.ts; runtime code must never import this file.
const cliPglite = process.env.DATABASE_DRIVER === "pglite"
  ? new PGlite(process.env.PGLITE_DATA_DIR ?? ".data")
  : null;
const cliPool = cliPglite ? null : new Pool({ connectionString: process.env.DATABASE_URL });

export const cliDb = cliPglite
  ? drizzlePglite({ client: cliPglite, schema })
  : drizzlePg({ client: cliPool!, schema });

const adminAccessControl = createAccessControl({ user: ["impersonate"], session: [] });
const platformSuperAdminRole = adminAccessControl.newRole({ user: ["impersonate"], session: [] });
const mediaAdminRole = adminAccessControl.newRole({ user: [], session: [] });

export async function closeCliDatabase() {
  if (cliPglite) await cliPglite.close();
  if (cliPool) await cliPool.end();
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(cliDb, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    autoSignIn: true,
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
      allowUserToCreateOrganization: process.env.ALLOW_SEED_MEDIA_CREATION === "true",
      schema: {
        organization: { modelName: "media" },
        member: { modelName: "membership" },
        invitation: { modelName: "mediaInvitation" },
      },
    }),
  ],
});
