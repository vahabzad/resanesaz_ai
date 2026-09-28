import "server-only";

export function crawlerGeneratorExecutionEnabled() {
  return process.env.CRAWLER_GENERATOR_EXECUTION_ENABLED === "true";
}
