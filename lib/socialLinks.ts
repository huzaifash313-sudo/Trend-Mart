/** Normalize social handles / build profile URLs for storefront badges. */

export function normalizeInstagramHandle(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  const fromUrl = t.match(/instagram\.com\/([^/?#]+)/i);
  if (fromUrl?.[1]) return fromUrl[1].replace(/^@/, "");
  return t.replace(/^@/, "").replace(/\/+$/, "");
}

export function instagramProfileUrl(handle: string): string {
  const h = normalizeInstagramHandle(handle);
  return h ? `https://instagram.com/${h}` : "";
}

/** Accept @user, user, or tiktok.com/@user / vm.tiktok.com links → bare username. */
export function normalizeTikTokHandle(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  const fromUrl = t.match(/tiktok\.com\/@?([^/?#]+)/i);
  if (fromUrl?.[1]) return fromUrl[1].replace(/^@/, "");
  return t.replace(/^@/, "").replace(/\/+$/, "");
}

export function tikTokProfileUrl(handle: string): string {
  const h = normalizeTikTokHandle(handle);
  return h ? `https://www.tiktok.com/@${h}` : "";
}

export function normalizeFacebookUrl(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (t.includes("facebook.com") || t.includes("fb.com")) return `https://${t.replace(/^\/+/, "")}`;
  return `https://facebook.com/${t.replace(/^@/, "")}`;
}
