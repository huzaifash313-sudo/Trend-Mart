/* -------------------------------------------------------------------------- */
/*  TrendsMart — Turnstile public (client-safe) helpers                         */
/* -------------------------------------------------------------------------- */

/** Cloudflare always-pass test site key (localhost / local widgets). */
export const CF_DEV_SITE_KEY = "1x00000000000000000000AA";

function isLocalHostname(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

function shouldUseDevTurnstileKeys(): boolean {
  if (process.env.NEXT_PUBLIC_TURNSTILE_FORCE_PROD === "true") return false;
  if (process.env.NODE_ENV === "production" && !isLocalHostname()) return false;
  // next dev, or browser on localhost even if a prod build is opened locally
  if (process.env.NODE_ENV !== "production") return true;
  return isLocalHostname();
}

export function getTurnstileSiteKey(): string | null {
  const configured = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  if (!configured) return null;
  // Real prod keys fail on localhost (Error 110200).
  if (shouldUseDevTurnstileKeys()) return CF_DEV_SITE_KEY;
  return configured;
}

/**
 * True when the login UI should show / wait for Turnstile.
 * Dev/localhost: uses Cloudflare always-pass site key when real keys are configured.
 */
export function isTurnstileUiEnabled(): boolean {
  return Boolean(getTurnstileSiteKey());
}
