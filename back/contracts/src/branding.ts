export type LogoArtwork = {
  background: string;
  shapes: Array<{ path: string; fill: string; stroke: string; strokeWidth: number }>;
};
export type LogoRequest = { name: string; instructions: string; primaryColor: string; secondaryColor: string; backgroundColor: string; identity: string };
export type LogoDraft = { request: LogoRequest; artwork: LogoArtwork; approved: boolean };
export type BrandIdentity = { description: string; colorRules: string; typography: string; imagery: string; layout: string; restrictions: string; referenceUrl: string };
export type LogoPreview = { request: LogoRequest; artwork: LogoArtwork; dataUrl: string };

export function identityRequestText(identity?: BrandIdentity) {
  if (!identity) return "";
  return JSON.stringify(Object.fromEntries((["description", "colorRules", "typography", "imagery", "layout", "restrictions", "referenceUrl"] as const).map(key => [key, identity[key].trim()])));
}

export function sameLogoRequest(a: LogoRequest, b: LogoRequest) {
  return (Object.keys(b) as Array<keyof LogoRequest>).every(key => a[key] === b[key]);
}

function escape(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

// Only fixed SVG elements are emitted; model output is never SVG/HTML source.
export function renderLogoArtwork(artwork: LogoArtwork) {
  const shapes = artwork.shapes.map(shape => `<path d="${escape(shape.path)}" fill="${escape(shape.fill)}" stroke="${escape(shape.stroke)}" stroke-width="${Number(shape.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
  return "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="24" fill="${escape(artwork.background)}"/>${shapes}</svg>`);
}
