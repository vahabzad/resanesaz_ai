import { z } from "zod";
import type { EditorialRenditions } from "../../contracts/src/editorial";
import type { SocialOutputSettings } from "@media/contracts/editorial-settings";
import { buildSocialOutput } from "./editorial-social-output";

const text = (min: number, max: number) => z.string().trim().min(min).max(max).refine(v => !/<\/?[a-z][^>]*>/i.test(v), "متن بدون HTML لازم است");
const image = z.string().max(2048).url().refine(v => /^https?:\/\//i.test(v)).nullable();
export const renditionInput = z.object({
  social: z.object({ text: text(3, 2000), imageUrl: image }).strict(),
  webCard: z.object({ title: text(3, 200), summary: text(0, 500), imageUrl: image }).strict(),
}).strict();
function clip(value: string, size: number) {
  if (value.length <= size) return value;
  const cut = value.slice(0, size - 1); const last = cut.lastIndexOf(" ");
  return `${cut.slice(0, last > size / 2 ? last : cut.length)}…`;
}
export function buildRenditions(version: { title: string; lead: string; body: string; imageUrl: string | null }, custom?: z.infer<typeof renditionInput>, socialSettings?: SocialOutputSettings, generatedSocialText?: string): EditorialRenditions {
  const summary = version.lead || version.body.split(/\n\s*\n/)[0];
  return {
    social: custom?.social ?? buildSocialOutput(version, socialSettings, generatedSocialText),
    webCard: custom?.webCard ?? { title: clip(version.title, 200), summary: clip(summary, 500), imageUrl: version.imageUrl },
    webFull: { title: version.title, lead: version.lead, body: version.body, imageUrl: version.imageUrl },
  };
}
