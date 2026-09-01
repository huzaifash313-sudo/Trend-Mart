/* -------------------------------------------------------------------------- */
/*  TrendsMart — Turnstile public (client-safe) helpers                         */
/* -------------------------------------------------------------------------- */

export function getTurnstileSiteKey(): string | null {
  const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

/**
 * True when the login UI should show / wait for Turnstile.
 * Mirrors server `isTurnstileEnforced()` via build-time flag when both keys exist.
 */
export function isTurnstileUiEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_TURNSTILE_ENFORCED === "true") {
    return true;
  }
  return Boolean(getTurnstileSiteKey());
}
