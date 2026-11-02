import { z } from "zod";
import { defaultSocialOutput, type SocialOutputSettings } from "@media/contracts/editorial-settings";

const plain = (max: number) => z.string().trim().max(max).refine(value => !/<\/?[a-z][^>]*>/i.test(value), "متن ثابت باید بدون HTML باشد");
export const socialOutputSchema = z.object({
  format: z.enum(["title_lead", "lead", "title_body", "title"]),
  maxLength: z.number().int().min(100).max(2000),
  includeImage: z.boolean(), prefix: plain(100), suffix: plain(300),
}).strict().refine(value => value.prefix.length + value.suffix.length + (value.prefix ? 2 : 0) + (value.suffix ? 2 : 0) <= value.maxLength - 20, "برای متن خبر دست‌کم ۲۰ نویسه جا بگذارید؛ متن ثابت را کوتاه یا سقف طول را بیشتر کنید");

function clip(value: string, max: number) {
  if (value.length <= max) return value;
  let cut = value.slice(0, max - 1);
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
  const boundary = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("\n"));
  return `${(boundary > max / 2 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

export function buildSocialOutput(version: { title: string; lead: string; body: string; imageUrl: string | null }, settings: SocialOutputSettings = defaultSocialOutput, generatedText?: string) {
  const summary = version.lead || version.body.split(/\n\s*\n/)[0];
  const content = settings.format === "title" ? version.title : settings.format === "lead" ? summary : `${version.title}\n\n${settings.format === "title_body" ? version.body : summary}`;
  const reserved = settings.prefix.length + settings.suffix.length + (settings.prefix ? 2 : 0) + (settings.suffix ? 2 : 0);
  return { text: [settings.prefix, clip(generatedText?.trim() || content, settings.maxLength - reserved), settings.suffix].filter(Boolean).join("\n\n"), imageUrl: settings.includeImage ? version.imageUrl : null };
}
