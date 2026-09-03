/**
 * Soft-launch switches — fees / tokens / paid ads stay OFF until you flip env.
 *
 * Enable paid later with: NEXT_PUBLIC_PAID_FEATURES=true
 * Pitch focus is Gujranwala, but any city (Lahore, etc.) can still register.
 */

export const SOFT_LAUNCH_PITCH_CITY = "Gujranwala";

/** Paid billing, token packs, subscription gates — disabled by default. */
export function isPaidFeaturesEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_PAID_FEATURES === "true" ||
    process.env.NEXT_PUBLIC_PAID_FEATURES === "1"
  );
}

export function softLaunchPitchCity(): string {
  return (
    process.env.NEXT_PUBLIC_PITCH_CITY?.trim() ||
    SOFT_LAUNCH_PITCH_CITY
  );
}
