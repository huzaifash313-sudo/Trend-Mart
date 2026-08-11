/* Shop deal schedule helpers (Asia/Karachi calendar days). */

export type DealScheduleType = "weekly" | "date_range" | "monthly";

export interface ShopDeal {
  id: string;
  shop_id: string;
  title: string;
  description: string | null;
  schedule_type: DealScheduleType;
  weekdays: number[] | null;
  starts_on: string | null;
  ends_on: string | null;
  day_of_month: number | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** YYYY-MM-DD in Asia/Karachi (or local fallback). */
export function toPkDateKey(date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function weekdayFromDateKey(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getDay();
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function isDealActiveOnDate(deal: ShopDeal, dateKey: string): boolean {
  if (!deal.is_active) return false;
  const weekday = weekdayFromDateKey(dateKey);
  const dayOfMonth = Number(dateKey.slice(8, 10));

  if (deal.schedule_type === "weekly") {
    const days = deal.weekdays ?? [];
    return days.includes(weekday);
  }

  if (deal.schedule_type === "date_range") {
    if (!deal.starts_on || !deal.ends_on) return false;
    const start = deal.starts_on.slice(0, 10);
    const end = deal.ends_on.slice(0, 10);
    return dateKey >= start && dateKey <= end;
  }

  if (deal.schedule_type === "monthly") {
    return deal.day_of_month != null && deal.day_of_month === dayOfMonth;
  }

  return false;
}

export function formatDealSchedule(deal: ShopDeal): string {
  if (deal.schedule_type === "weekly") {
    const days = (deal.weekdays ?? [])
      .slice()
      .sort((a, b) => a - b)
      .map((d) => WEEKDAY_LABELS[d] ?? String(d));
    return days.length ? `Every ${days.join(", ")}` : "Weekly";
  }
  if (deal.schedule_type === "date_range") {
    const start = deal.starts_on?.slice(0, 10) ?? "?";
    const end = deal.ends_on?.slice(0, 10) ?? "?";
    return `${start} → ${end}`;
  }
  if (deal.schedule_type === "monthly") {
    return `Monthly on day ${deal.day_of_month ?? "?"}`;
  }
  return "Deal";
}

export function formatOfferDayLabel(dateKey: string, todayKey = toPkDateKey()): string {
  if (dateKey === todayKey) return "Today";
  if (dateKey === addDaysToDateKey(todayKey, 1)) return "Tomorrow";
  const weekday = weekdayFromDateKey(dateKey);
  const day = dateKey.slice(8, 10);
  const month = dateKey.slice(5, 7);
  return `${WEEKDAY_LABELS[weekday]} ${day}/${month}`;
}

/** Next N calendar days that have at least one active deal. */
export function listOfferDayKeys(
  deals: ShopDeal[],
  daysAhead = 14,
  todayKey = toPkDateKey(),
): string[] {
  const keys: string[] = [];
  for (let i = 0; i < daysAhead; i += 1) {
    const key = addDaysToDateKey(todayKey, i);
    if (deals.some((d) => isDealActiveOnDate(d, key))) {
      keys.push(key);
    }
  }
  return keys;
}

export function shopIdsWithDealOnDate(deals: ShopDeal[], dateKey: string): Set<string> {
  const ids = new Set<string>();
  for (const deal of deals) {
    if (isDealActiveOnDate(deal, dateKey)) ids.add(deal.shop_id);
  }
  return ids;
}

export { WEEKDAY_LABELS };
