import { and, eq, inArray } from "drizzle-orm";
import type { MediaSetupPreferences } from "@media/contracts/media-setup";
import { sourceRequestKey } from "@media/contracts/media-setup";
import { media, mediaCreationRequest, sourceAccessRequest } from "@/db/schema";
import { recordAuditEvent } from "@/src/server/audit";
import { db } from "@/src/server/database";
import { getSourcesWorkspace } from "@/src/server/sources";

export class MediaSetupError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) {
    super(message);
    this.name = "MediaSetupError";
  }
}

function readMetadata(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export async function getMediaSetupPreferences(mediaId: string): Promise<MediaSetupPreferences> {
  const [row] = await db.select({ metadata: media.metadata }).from(media).where(eq(media.id, mediaId)).limit(1);
  const saved = readMetadata(row?.metadata ?? null).setupPreferences;
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return { editorialViewpoint: "", sourceSelections: [], socialPlatforms: [], setupCompleted: false };
  const value = saved as Partial<MediaSetupPreferences>;
  return {
    editorialViewpoint: typeof value.editorialViewpoint === "string" ? value.editorialViewpoint : "",
    sourceSelections: Array.isArray(value.sourceSelections) ? value.sourceSelections : [],
    socialPlatforms: Array.isArray(value.socialPlatforms) ? value.socialPlatforms.filter((item): item is "bale" | "telegram" => item === "bale" || item === "telegram") : [],
    setupCompleted: value.setupCompleted === true,
    ...(Number.isInteger(value.setupStep) && value.setupStep! >= 1 && value.setupStep! <= 4 ? { setupStep: value.setupStep } : {}),
  };
}

export async function saveMediaSetupPreferences(
  mediaId: string,
  actorUserId: string,
  correlationId: string,
  preferences: MediaSetupPreferences,
  name?: string,
) {
  const workspace = await getSourcesWorkspace(mediaId);
  const available = new Map(workspace.availableSources.map((source) => [source.id, new Set(source.categories)]));
  for (const selection of preferences.sourceSelections) {
    const categories = available.get(selection.sourceId);
    if (!categories) throw new MediaSetupError("یکی از منابع انتخاب‌شده دیگر در کاتالوگ قابل‌درخواست نیست.", 409);
    if (selection.categoryMode === "selected" && (!selection.categories.length || selection.categories.some((category) => !categories.has(category)))) {
      throw new MediaSetupError("دسته‌بندی انتخاب‌شده برای این منبع در کاتالوگ وجود ندارد.", 409);
    }
    if (selection.categoryMode === "all" && selection.categories.length) throw new MediaSetupError("برای انتخاب همهٔ دسته‌ها، فهرست دسته‌بندی باید خالی باشد.", 400);
  }

  let savedPreferences = preferences;
  await db.transaction(async tx => {
    const [row] = await tx.select({ metadata: media.metadata }).from(media).where(eq(media.id, mediaId)).for("update").limit(1);
    if (!row) throw new MediaSetupError("رسانه پیدا نشد.", 404);
    const previousMetadata = readMetadata(row.metadata);
    const previous = previousMetadata.setupPreferences as Partial<MediaSetupPreferences> | undefined;
    if (previous?.setupCompleted && !preferences.setupCompleted) throw new MediaSetupError("راه‌اندازی رسانه نهایی شده است و نمی‌توان آن را به پیش‌نویس برگرداند.", 409);
    if (preferences.setupStep === undefined && Number.isInteger(previous?.setupStep) && previous!.setupStep! >= 1 && previous!.setupStep! <= 4) savedPreferences = { ...preferences, setupStep: previous!.setupStep };
    const metadata = { ...previousMetadata, setupPreferences: savedPreferences };
    await tx.update(media).set({ metadata: JSON.stringify(metadata), ...(name !== undefined ? { name } : {}) }).where(eq(media.id, mediaId));
    if (savedPreferences.setupCompleted) {
      const created = await tx.insert(mediaCreationRequest).values({ mediaId, requestedBy: actorUserId }).onConflictDoNothing().returning();
      if (created.length) await recordAuditEvent({ mediaId, actorUserId, correlationId, action: "media.request.submitted", targetType: "media", targetId: mediaId }, tx);
      const drafts = await tx.select({ url: sourceAccessRequest.url }).from(sourceAccessRequest).where(and(eq(sourceAccessRequest.mediaId, mediaId), eq(sourceAccessRequest.kind, "source_access"), inArray(sourceAccessRequest.status, ["draft", "pending"])));
      if (new Set(drafts.map(row => sourceRequestKey(row.url))).size !== drafts.length) throw new MediaSetupError("فهرست منابع دارای لینک تکراری است؛ ابتدا موارد اضافه را از مرحلهٔ منابع حذف کنید.", 409);
      const submitted = await tx.update(sourceAccessRequest).set({ status: "pending" }).where(and(eq(sourceAccessRequest.mediaId, mediaId), eq(sourceAccessRequest.kind, "source_access"), inArray(sourceAccessRequest.status, ["draft", "pending"]))).returning();
      if (submitted.length && !previous?.setupCompleted) await recordAuditEvent({ mediaId, actorUserId, action: "source_access_requests.submitted", targetType: "media", targetId: mediaId, correlationId, metadata: { requestCount: submitted.length } }, tx);
    }
    await recordAuditEvent({
      mediaId,
      actorUserId,
      action: "media.setup_preferences.saved",
      targetType: "media",
      targetId: mediaId,
      correlationId,
      metadata: { sourceCount: preferences.sourceSelections.length, socialPlatforms: preferences.socialPlatforms, setupCompleted: preferences.setupCompleted, setupStep: savedPreferences.setupStep, ...(name !== undefined ? { name } : {}) },
    }, tx);
  });
  return savedPreferences;
}
