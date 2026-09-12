/**
 * Shared “delivery profile complete” check for hub ↔ complete-profile
 * so the two pages never disagree and trap the customer in a redirect loop.
 */
export function isCustomerDeliveryProfileComplete(profile: {
  full_name?: string | null;
  phone?: string | null;
  address?: string | null;
  location_label?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
} | null | undefined): boolean {
  if (!profile) return false;
  const nameOk =
    typeof profile.full_name === "string" && profile.full_name.trim().length >= 2;
  const phoneOk =
    typeof profile.phone === "string" && profile.phone.trim().length >= 7;
  const hasLabel =
    typeof profile.location_label === "string" &&
    profile.location_label.trim().length > 0;
  const hasCity =
    typeof profile.city === "string" && profile.city.trim().length > 0;
  const hasAddress =
    typeof profile.address === "string" && profile.address.trim().length > 0;
  const hasCoords =
    typeof profile.latitude === "number" &&
    typeof profile.longitude === "number" &&
    Number.isFinite(profile.latitude) &&
    Number.isFinite(profile.longitude);
  return nameOk && phoneOk && (hasLabel || hasCity || hasAddress || hasCoords);
}
