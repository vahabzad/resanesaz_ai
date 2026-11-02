export function crawlOutcome(input: { web: boolean; discovered: number; extracted: number; failed: number }) {
  if (input.web && input.extracted === 0) return {
    status: "failed" as const,
    sourceStatus: "failed" as const,
    errorCode: input.discovered ? "ALL_EXTRACTIONS_FAILED" : "NO_ARTICLE_LINKS",
  };
  return {
    status: "succeeded" as const,
    sourceStatus: input.failed ? "degraded" as const : "active" as const,
    errorCode: input.failed ? "PARTIAL_EXTRACTION" : null,
  };
}
