"use client";

import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { mediaAccess, mediaRoles } from "@/lib/server/permissions";

export const authClient = createAuthClient({
  plugins: [organizationClient({ ac: mediaAccess, roles: mediaRoles })],
});
