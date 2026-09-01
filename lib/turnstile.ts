/* -------------------------------------------------------------------------- */
/*  TrendsMart — Cloudflare Turnstile server verification                       */
/* -------------------------------------------------------------------------- */

import { getTurnstileSiteKey } from "@/lib/turnstilePublic";
import { withTimeout } from "@/lib/withTimeout";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export { getTurnstileSiteKey, isTurnstileUiEnabled } from "@/lib/turnstilePublic";

/** Server: enforce captcha only when the secret is configured. */
export function isTurnstileEnforced(): boolean {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  const siteKey = getTurnstileSiteKey();
  return Boolean(secret && siteKey);
}

export interface TurnstileVerifyResult {
  ok: boolean;
  error?: string;
}

/**
 * Verify a Turnstile response token with Cloudflare.
 * Call only from server routes. Tokens are single-use and expire quickly.
 */
export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteIp?: string,
): Promise<TurnstileVerifyResult> {
  if (!isTurnstileEnforced()) {
    return { ok: true };
  }

  const trimmed = (token ?? "").trim();
  if (!trimmed) {
    return {
      ok: false,
      error: "Please complete the security check and try again.",
    };
  }

  const secret = process.env.TURNSTILE_SECRET_KEY!.trim();
  const body = new URLSearchParams({
    secret,
    response: trimmed,
  });
  if (remoteIp && remoteIp !== "unknown") {
    body.set("remoteip", remoteIp);
  }

  try {
    const res = await withTimeout(
      fetch(SITEVERIFY_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      }),
      8_000,
      () => null,
    );

    if (!res) {
      return {
        ok: false,
        error: "Security check timed out. Please try again.",
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        error: "Security check failed. Please try again.",
      };
    }

    const data = (await res.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };

    if (!data.success) {
      return {
        ok: false,
        error: "Security check expired or failed. Please try again.",
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Security check unavailable. Please try again in a moment.",
    };
  }
}
