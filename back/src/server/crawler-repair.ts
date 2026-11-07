import type { CrawlerRecipe } from "./crawler-recipe";
import type { SampleResult } from "./crawler-validation";

export function repairPlan(samples: SampleResult[], discoveryMissing: string[] = []) {
  const issues = samples.flatMap(sample => sample.diagnostics?.issues ?? []);
  const onlyCategories = issues.length > 0 && !discoveryMissing.length && samples.filter(sample => !sample.passed).every(sample => sample.errorCode === "SAMPLE_CATEGORY_MISSING") && issues.every(issue => issue.stage === "category");
  const blocked = samples.filter(sample => !sample.passed && (!sample.diagnostics || sample.diagnostics.issues.some(issue => !issue.repairable))).map(sample => ({ url: sample.url, errorCode: sample.errorCode }));
  return { onlyCategories, editableFields: onlyCategories ? ["categorySelectors"] : ["linkSelector", "pathPrefixes", "titleSelectors", "bodySelectors", "removeSelectors", "categorySelectors"], preserveSuccessfulSelectors: true, issues: issues.slice(0, 40), blocked: blocked.slice(0, 30), discoveryMissing: discoveryMissing.slice(0, 30) };
}
export function targetedRecipe(proposed: CrawlerRecipe, previous: CrawlerRecipe | undefined, plan: ReturnType<typeof repairPlan>) {
  return plan.onlyCategories && previous ? { ...previous, categorySelectors: proposed.categorySelectors } : proposed;
}
export function recipeFingerprint(recipe: CrawlerRecipe) {
  return JSON.stringify([recipe.linkSelector, recipe.pathPrefixes, recipe.titleSelectors, recipe.bodySelectors, recipe.removeSelectors, recipe.categorySelectors ?? []]);
}
