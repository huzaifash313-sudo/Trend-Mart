/* -------------------------------------------------------------------------- */
/*  TrendsMart — Turnstile public (client-safe) helpers                         */
/* -------------------------------------------------------------------------- */

export function getTurnstileSiteKey(): string | null {
  const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

export function isTurnstileUiEnabled(): boolean {
  return Boolean(getTurnstileSiteKey());
}
