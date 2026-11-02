export type CategoryMapping = { id: string; sourceId: string; sourceName: string; sourceUrl: string; rawName: string; categoryId: string | null; categoryName: string | null; mapped: boolean; revision: number; articleCount: number; mappedAt: string | null; lastSeenAt: string };
export type CategoryMappingSummary = { pending: number; mapped: number; total: number };
export type CategoryMappingWorkspace = { rows: CategoryMapping[]; summary: CategoryMappingSummary; page: number; pageCount: number; total: number; categories: Array<{ id: string; nameFa: string; nameEn: string; nameAr: string }> };
export type CategoryMappingHistory = { id: string; actor: string | null; createdAt: string; from: string | null; to: string | null };
