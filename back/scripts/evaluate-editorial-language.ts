import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { rewriteWithCodex, type RewriteInput } from "../src/server/editorial-rewriter";

config({ path: ".env.local", quiet: true });

// Synthetic news only: this evaluation never queues or persists a newsroom story.
const samples = [
  {
    id: "education-context",
    title: "Demonstrators clash with riot police in France as education protests mount",
    content: "In this fictional newsroom test, demonstrators clashed with riot police in France on Tuesday as protests over education funding grew. Teachers and parents said proposed cuts to school budgets would worsen classroom conditions. They called for the proposal to be withdrawn. Officials said the proposal remained under discussion and no final decision had been made. The source does not provide an injury count, identify a city or establish whether the protests caused the clashes. It reports the growing protests and the clashes as events occurring at the same time.",
  },
  {
    id: "education-uncertain",
    title: "Education protests grow in France",
    content: "In this fictional newsroom test, demonstrations concerning education grew in France on Tuesday. The source does not specify whether the dispute concerns schools, universities, budgets, pay or examinations. Organizers said more participants joined the demonstrations. Officials said they would meet organizers later in the week. No participant count, location within France or cause of the dispute is provided. The account contains no report of violence or a change in government policy. The uncertainty about the subject of the dispute must be retained.",
  },
];

const results = [];
for (const sample of samples) {
  const input: RewriteInput = {
    sourceKey: sample.id, title: sample.title, content: sample.content, sourceName: "Synthetic newsroom fixture",
    policy: {
      platformConfigId: "evaluation", platformRevision: 1, sectionName: "Language quality evaluation", sectionRevision: 1,
      instructions: "Preserve source facts, uncertainty and attribution. Never invent facts or quotations. This is a fictional evaluation, not a report for publication.",
      faction: null, settings: { language: "fa", factionId: null, viewpointStrength: 0, humor: 0, formality: 70, sourceIds: [], categories: [] },
    },
  };
  const output = await rewriteWithCodex(input, AbortSignal.timeout(180000));
  results.push({ id: sample.id, source: { title: sample.title, content: sample.content }, output });
  console.log(JSON.stringify({ id: sample.id, title: output.title, lead: output.lead }));
}
await mkdir(".data", { recursive: true });
await writeFile(".data/editorial-language-evaluation.json", JSON.stringify({ evaluatedAt: new Date().toISOString(), results }, null, 2), "utf8");
