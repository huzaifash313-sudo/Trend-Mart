/**
 * Open / Closed comes from the merchant switch (`operating_status`).
 * `business_hours` is display-only (e.g. "Mon-Sat: 9 AM - 10 PM").
 */

export type ShopOpenState = "open" | "closed" | "unknown";

export function isShopClosedStatus(status?: string | null): boolean {
  const s = (status ?? "").trim().toLowerCase();
  if (!s) return false;
  if (/\bopen\b/.test(s) && !/closed|close/.test(s)) return false;
  return /temporarily\s*closed|\bclosed\b|\bclose\b/.test(s);
}

export function getShopHoursSummary(input: {
  business_hours?: string | null;
  operating_status?: string | null;
}): {
  state: ShopOpenState;
  label: "Open" | "Closed" | "Hours TBD";
  hoursText: string;
} {
  const hours = (input.business_hours ?? "").trim();
  const status = (input.operating_status ?? "").trim();
  const hoursText = hours || (isShopClosedStatus(status) ? "Closed" : "Open");

  if (isShopClosedStatus(status)) {
    return { state: "closed", label: "Closed", hoursText };
  }
  return { state: "open", label: "Open", hoursText };
}
