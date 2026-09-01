"use client";

import Script from "next/script";
import { getTurnstileSiteKey } from "@/lib/turnstilePublic";

/** Preload Turnstile on every page when configured — avoids auth-page race conditions. */
export default function TurnstileScript() {
  const siteKey = getTurnstileSiteKey();
  if (!siteKey) return null;

  return (
    <Script
      id="cf-turnstile-script"
      src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      strategy="afterInteractive"
      onLoad={() => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("trendsmart-turnstile-ready"));
        }
      }}
    />
  );
}
