const maxLogoBytes = 1_000_000;

export class InvalidMediaLogoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMediaLogoError";
  }
}

function initials(name: string) {
  const value = name.trim().split(/\s+/).slice(0, 2).map((part) => part.slice(0, 1)).join("") || "ر";
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function generatedLogo(name: string) {
  const palette = ["#8f302d", "#235b68", "#54467d", "#4d6944", "#8a5b25"];
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  const background = palette[hash % palette.length];
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="48" fill="' + background + '"/><text x="128" y="158" text-anchor="middle" font-family="sans-serif" font-size="104" font-weight="700" fill="#fff">' + initials(name) + '</text></svg>';
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

function uploadedLogo(dataUrl: string) {
  const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || match[2].length % 4 !== 0) throw new InvalidMediaLogoError("فایل لوگو باید PNG، JPEG یا WebP معتبر باشد.");
  const [, format, encoded] = match;
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > maxLogoBytes) throw new InvalidMediaLogoError("حجم لوگو باید حداکثر یک مگابایت باشد.");
  const valid = format === "png"
    ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : format === "jpeg"
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!valid) throw new InvalidMediaLogoError("محتوای فایل با نوع تصویر انتخاب‌شده مطابقت ندارد.");
  return dataUrl;
}

export function resolveMediaLogo(name: string, mode: "generated" | "upload", dataUrl?: string) {
  if (mode === "generated") return generatedLogo(name);
  if (!dataUrl) throw new InvalidMediaLogoError("فایل لوگو را انتخاب کنید.");
  return uploadedLogo(dataUrl);
}
