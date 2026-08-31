/**
 * Canonical public site origin for auth redirects, QR links, SEO, emails, etc.
 *
 * Source of truth (in order):
 *   1. NEXT_PUBLIC_APP_URL
 *   2. NEXT_PUBLIC_SITE_URL
 *   3. Browser origin (localdev / live host when env is unset)
 *   4. VERCEL_PROJECT_PRODUCTION_URL (Vercel runtime)
 *
 * Never hardcode a production domain here — set env vars instead.
 */

const LEGACY_HOST_SUFFIXES = [".vercel.app", ".vercel.com"] as const;

function normalizeOrigin(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    // Prefer apex over www for shared / QR / email links.
    if (u.hostname.startsWith("www.")) {
      u.hostname = u.hostname.slice(4);
    }
    return u.origin;
  } catch {
    return null;
  }
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isLegacyPreviewHost(hostname: string): boolean {
  return LEGACY_HOST_SUFFIXES.some((s) => hostname.endsWith(s));
}

/** Configured public origin from env (APP_URL preferred). */
function envOrigin(): string | null {
  return normalizeOrigin(
    process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "",
  );
}

/**
 * Absolute public site origin (no trailing slash).
 * Safe to call from client components, server code, and API routes.
 */
export function getPublicAppUrl(): string {
  const configured = envOrigin();

  if (typeof window !== "undefined" && window.location?.origin) {
    const { hostname, origin } = window.location;

    if (isLocalHostname(hostname)) {
      // Localdev: use env when set (e.g. testing against prod), else localhost.
      return configured ?? origin;
    }

    // Deployed host: always prefer env so preview/vercel URLs never leak into
    // QR codes, WhatsApp messages, or auth redirects.
    if (configured) return configured;

    if (isLegacyPreviewHost(hostname)) {
      // Env missing on a preview host — do not invent a domain.
      return origin;
    }

    return normalizeOrigin(origin) ?? origin;
  }

  if (configured) return configured;

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProd) {
    return normalizeOrigin(vercelProd) ?? `https://${vercelProd.replace(/^\/+/, "")}`;
  }

  // Build / SSR without env (rare) — keep relative-friendly localhost default.
  return "http://localhost:3000";
}

/** Hostname only (no protocol), derived from getPublicAppUrl(). */
export function getPublicAppHostname(): string {
  try {
    return new URL(getPublicAppUrl()).hostname;
  } catch {
    return "localhost";
  }
}

/** Brand support mailbox derived from EMAIL_FROM or public app hostname. */
export function getSupportMailbox(): string {
  const from = process.env.EMAIL_FROM?.trim();
  if (from) {
    const angled = from.match(/<([^>@]+@[^>]+)>/);
    if (angled?.[1]) return angled[1].trim().toLowerCase();
    const plain = from.match(/([\w.+-]+@[\w.-]+\.[a-z]{2,})/i);
    if (plain?.[1]) return plain[1].trim().toLowerCase();
  }

  const configured = envOrigin();
  if (configured) {
    try {
      const host = new URL(configured).hostname.replace(/^www\./, "");
      if (!isLocalHostname(host)) return `support@${host}`;
    } catch {
      /* fall through */
    }
  }

  const host = getPublicAppHostname();
  if (host && !isLocalHostname(host)) return `support@${host}`;

  return "support@localhost";
}

/** Web Push VAPID subject — prefers VAPID_SUBJECT env, else mailto:support@domain. */
export function getVapidSubject(): string {
  const explicit = process.env.VAPID_SUBJECT?.trim();
  if (explicit) return explicit;
  return `mailto:${getSupportMailbox()}`;
}

/** Supabase email confirmation / magic-link landing URL. */
export function getAuthCallbackUrl(): string {
  return `${getPublicAppUrl()}/auth/callback`;
}
