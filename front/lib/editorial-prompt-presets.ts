export { editorialPromptPresets } from "../../back/contracts/src/editorial-prompt-presets";
export type { EditorialPromptPair, EditorialPromptPreset } from "../../back/contracts/src/editorial-prompt-presets";

export function editorialPromptError(instructions?: string, socialInstructions?: string) {
  if (!instructions || instructions.trim().length < 20 || instructions.length > 10000) return "پرامپت خبر باید بین ۲۰ تا ۱۰٬۰۰۰ نویسه باشد؛ متن خودتان را بنویسید یا یک الگو اعمال کنید.";
  if (!socialInstructions || socialInstructions.trim().length < 20 || socialInstructions.length > 5000) return "پرامپت شبکهٔ اجتماعی باید بین ۲۰ تا ۵٬۰۰۰ نویسه باشد؛ این متن را هم تکمیل کنید.";
  return "";
}
