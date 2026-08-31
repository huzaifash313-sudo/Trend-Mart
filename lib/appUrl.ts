/**
 * Canonical public site origin for auth redirects, QR links, SEO, etc.
 * Ensures verification emails never silently fall back to a stale Supabase
 * Site URL of `http://localhost:3000` when the app is running in production.
 */
const PRODUCTION_FALLBACK = "https://trendsmart.pk";

function normalizeOrigin(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return u.origin;
  } catch {
    return null;
  }
}

function envOrigin(): string | null {
  return normalizeOrigin(
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "",
  );
}

export function getPublicAppUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    const { hostname, origin } = window.location;
    const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
    // On the live host, always use the current origin (covers custom domains).
    if (!isLocal) return origin;
    // Localdev: prefer localhost so email links work on the same machine.
    // If SITE_URL is explicitly set, respect it (e.g. testing against prod).
    return envOrigin() ?? origin;
  }

  return envOrigin() ?? PRODUCTION_FALLBACK;
}

/** Supabase email confirmation / magic-link landing URL. */
export function getAuthCallbackUrl(): string {
  return `${getPublicAppUrl()}/auth/callback`;
}
