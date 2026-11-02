import { z } from "zod";
import * as cheerio from "cheerio";

const selector = z.string().trim().min(1).max(300);
export const recipeSchema = z.object({
  contractVersion: z.literal("2"),
  linkSelector: selector,
  pathPrefixes: z.array(z.string().min(2).max(200)).max(12),
  titleSelectors: z.array(selector).min(1).max(6),
  bodySelectors: z.array(selector).min(1).max(8),
  removeSelectors: z.array(selector).max(12),
  categorySelectors: z.array(selector).max(8).optional(),
}).strict();
// New model output must explicitly address categories; stored v2 recipes
// without this field retain their generic category extraction fallback.
export const generatedRecipeSchema = recipeSchema.extend({ categorySelectors: z.array(selector).max(8) });
export type CrawlerRecipe = z.infer<typeof recipeSchema>;

export function parseRecipe(value: unknown): CrawlerRecipe {
  const recipe = recipeSchema.parse(value);
  if (recipe.pathPrefixes.some((prefix) => !prefix.startsWith("/") || prefix.startsWith("//"))) throw new Error("INVALID_RECIPE");
  if (!recipe.pathPrefixes.length && recipe.linkSelector.trim() === "a[href]") throw new Error("INVALID_RECIPE");
  const $ = cheerio.load("<html><body></body></html>");
  for (const css of [recipe.linkSelector, ...recipe.titleSelectors, ...recipe.bodySelectors, ...recipe.removeSelectors, ...recipe.categorySelectors ?? []]) {
    // No code, XPath, remote imports or regular expressions are executable recipes.
    if (/[{};\u0000-\u001f]/.test(css)) throw new Error("INVALID_RECIPE");
    try { $(css); } catch { throw new Error("INVALID_RECIPE"); }
  }
  for (const css of recipe.bodySelectors) if ($(css).is("html,body")) throw new Error("INVALID_RECIPE");
  for (const css of recipe.categorySelectors ?? []) if (["*", "html", "body", "nav", "header", "footer", "a", "a[href]"].includes(css.toLowerCase())) throw new Error("INVALID_RECIPE");
  return recipe;
}
