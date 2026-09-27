import "server-only";

import { eq } from "drizzle-orm";
import { media, membership } from "@/db/schema";
import type { DashboardContext, MediaRole } from "@/lib/contracts/context";
import { auth } from "@/lib/server/auth";
import { db } from "@/lib/server/database";

export async function getDashboardContext(requestHeaders: Headers): Promise<DashboardContext | null> {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;

  const rows = await db
    .select({
      id: media.id,
      name: media.name,
      slug: media.slug,
      logo: media.logo,
      role: membership.role,
    })
    .from(membership)
    .innerJoin(media, eq(membership.organizationId, media.id))
    .where(eq(membership.userId, session.user.id))
    .orderBy(media.name);

  const mediaList = rows.map((row) => ({ ...row, role: row.role as MediaRole }));
  if (!mediaList.length) return null;

  const activeOrganizationId = session.session.activeOrganizationId;
  const activeMedia = mediaList.find((item) => item.id === activeOrganizationId) ?? mediaList[0];

  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
    },
    media: mediaList,
    activeMedia,
  };
}
