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
  /** Cover / primary deal image (storage URL). */
  image_url?: string | null;
  /** Extra gallery URLs (same pattern as products.images); cover first in UI. */
  images?: string[] | null;
  /** Short badge e.g. "20% OFF", "Buy 1 Get 1". */
  badge_text?: string | null;
  /** Highlight on For You / Featured Deals strip. */
  is_featured?: boolean;
  /** Linked catalog product (optional but recommended for cart/order). */
  product_id?: string | null;
  /** Deal selling price (PKR). */
  price?: number | null;
  /** Strike-through original price when higher than `price`. */
  original_price?: number | null;
  created_at: string;
  updated_at?: string;
  /** Joined from shops when listing marketplace deals. */
  shop_name?: string | null;
  shop_logo_url?: string | null;
  shop_slug?: string | null;
  shop_whatsapp?: string | null;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAY_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const MONTH_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function ordinalDay(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** "14 August" from YYYY-MM-DD */
export function formatLongDayMonth(dateKey: string): string {
  const day = Number(dateKey.slice(8, 10));
  const month = Number(dateKey.slice(5, 7));
  const name = MONTH_FULL[(month || 1) - 1] ?? dateKey.slice(5, 7);
  return `${day} ${name}`;
}

/**
 * Customer-facing when-tag for For You / search / tickers.
 * Examples: "Monday deal", "Fri & Sat deal", "14 August deal", "14–20 August deal"
 */
export function formatDealWhenTag(deal: ShopDeal): string {
  if (deal.schedule_type === "weekly") {
    const days = [...new Set(deal.weekdays ?? [])]
      .filter((d) => d >= 0 && d <= 6)
      .sort((a, b) => a - b);
    if (days.length === 1) return `${WEEKDAY_FULL[days[0]]} deal`;
    if (days.length === 2) {
      return `${WEEKDAY_LABELS[days[0]]} & ${WEEKDAY_LABELS[days[1]]} deal`;
    }
    if (days.length > 2) {
      const consecutive = days.every((d, i) => i === 0 || d === days[i - 1]! + 1);
      if (consecutive) {
        return `${WEEKDAY_LABELS[days[0]!]}–${WEEKDAY_LABELS[days[days.length - 1]!]} deal`;
      }
      return `${days.map((d) => WEEKDAY_LABELS[d]).join(", ")} deal`;
    }
    return "Weekly deal";
  }

  if (deal.schedule_type === "date_range") {
    const start = deal.starts_on?.slice(0, 10);
    const end = deal.ends_on?.slice(0, 10);
    if (start && end && start === end) return `${formatLongDayMonth(start)} deal`;
    if (start && end) {
      const sameMonth = start.slice(5, 7) === end.slice(5, 7);
      const startDay = Number(start.slice(8, 10));
      const endLabel = formatLongDayMonth(end);
      if (sameMonth) {
        const month = MONTH_FULL[Number(start.slice(5, 7)) - 1];
        return `${startDay}–${Number(end.slice(8, 10))} ${month} deal`;
      }
      return `${formatLongDayMonth(start)}–${endLabel} deal`;
    }
    if (start) return `${formatLongDayMonth(start)} deal`;
    return "Limited deal";
  }

  if (deal.schedule_type === "monthly" && deal.day_of_month != null) {
    return `Monthly ${ordinalDay(deal.day_of_month)} deal`;
  }

  return "Store deal";
}

/** Ticker / card line: badge + when-tag (or title fallback). */
export function formatDealDisplayLabel(deal: ShopDeal): string {
  const when = formatDealWhenTag(deal);
  const badge = (deal.badge_text || "").trim();
  if (badge) return `${badge} · ${when}`;
  return when;
}

/** Text blob for fuzzy search (title, badge, when, shop, schedule). */
export function dealSearchHaystack(deal: ShopDeal): string {
  return [
    deal.title,
    deal.description ?? "",
    deal.badge_text ?? "",
    deal.shop_name ?? "",
    formatDealWhenTag(deal),
    formatDealSchedule(deal),
    ...(deal.weekdays ?? []).map((d) => WEEKDAY_FULL[d] ?? ""),
    ...(deal.weekdays ?? []).map((d) => WEEKDAY_LABELS[d] ?? ""),
  ]
    .filter(Boolean)
    .join(" ");
}

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

/** Order (WhatsApp checkout) is only allowed on the deal's active calendar day(s). */
export function isDealOrderableToday(deal: ShopDeal, now = new Date()): boolean {
  return isDealActiveOnDate(deal, toPkDateKey(now));
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

/** Next N calendar day keys (YYYY-MM-DD), regardless of deal count. */
export function listCalendarDayKeys(
  daysAhead = 14,
  todayKey = toPkDateKey(),
): string[] {
  const keys: string[] = [];
  for (let i = 0; i < daysAhead; i += 1) {
    keys.push(addDaysToDateKey(todayKey, i));
  }
  return keys;
}

/** Next N calendar days that have at least one active deal. */
export function listOfferDayKeys(
  deals: ShopDeal[],
  daysAhead = 14,
  todayKey = toPkDateKey(),
): string[] {
  return listCalendarDayKeys(daysAhead, todayKey).filter((key) =>
    deals.some((d) => isDealActiveOnDate(d, key)),
  );
}

/** Next calendar date key that falls on the given weekday (0=Sun … 6=Sat). */
export function nextDateKeyForWeekday(
  weekday: number,
  todayKey = toPkDateKey(),
): string {
  const todayWd = weekdayFromDateKey(todayKey);
  const delta = (weekday - todayWd + 7) % 7;
  return addDaysToDateKey(todayKey, delta);
}

export function shopIdsWithDealOnDate(deals: ShopDeal[], dateKey: string): Set<string> {
  const ids = new Set<string>();
  for (const deal of deals) {
    if (isDealActiveOnDate(deal, dateKey)) ids.add(deal.shop_id);
  }
  return ids;
}

export { WEEKDAY_LABELS };
