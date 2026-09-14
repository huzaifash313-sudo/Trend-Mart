/**
 * Structured shop hours — store schedule + delivery / pickup / dine-in windows.
 * `operating_status` remains the merchant emergency override (Closed now).
 * Legacy free-text `business_hours` is display-only when no schedule is set.
 *
 * Overnight windows (e.g. 15:00 → 02:00) are supported, including spill past
 * midnight onto the next calendar day. Optional `today_override` lets merchants
 * close early or extend for events / workload without rewriting the weekly plan.
 */

import type {
  ShopChannelWindow,
  ShopDayWindow,
  ShopSchedule,
  ShopTodayOverride,
} from "@/types";

export type {
  ShopChannelWindow,
  ShopDayWindow,
  ShopSchedule,
  ShopTodayOverride,
};

export type ShopOpenState = "open" | "closed" | "unknown";
export type ShopFulfillmentChannel = "store" | "delivery" | "pickup" | "dine_in";

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DEFAULT_TZ = "Asia/Karachi";
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function defaultChannelWindow(
  openAt = "09:00",
  closeAt = "22:00",
): ShopChannelWindow {
  return { same_as_store: true, open_at: openAt, close_at: closeAt };
}

/** Sensible soft-launch default: Mon–Sat 9 AM – 10 PM, channels same as store. */
export function defaultShopSchedule(): ShopSchedule {
  const openAt = "09:00";
  const closeAt = "22:00";
  return {
    timezone: DEFAULT_TZ,
    days: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      day,
      open: day >= 1 && day <= 6,
      open_at: openAt,
      close_at: closeAt,
    })),
    delivery: defaultChannelWindow(openAt, closeAt),
    pickup: defaultChannelWindow(openAt, closeAt),
    dine_in: defaultChannelWindow(openAt, closeAt),
    today_override: null,
  };
}

export function isShopClosedStatus(status?: string | null): boolean {
  const s = (status ?? "").trim().toLowerCase();
  if (!s) return false;
  if (/\bopen\b/.test(s) && !/closed|close/.test(s)) return false;
  return /temporarily\s*closed|\bclosed\b|\bclose\b/.test(s);
}

function normalizeTime(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const t = raw.trim().slice(0, 5);
  if (!TIME_RE.test(t)) return fallback;
  return t;
}

function normalizeChannel(
  raw: unknown,
  fallback: ShopChannelWindow,
): ShopChannelWindow {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...fallback };
  const o = raw as Record<string, unknown>;
  return {
    same_as_store: o.same_as_store !== false,
    open_at: normalizeTime(o.open_at, fallback.open_at),
    close_at: normalizeTime(o.close_at, fallback.close_at),
  };
}

function normalizeTodayOverride(raw: unknown): ShopTodayOverride | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const date = typeof o.date === "string" ? o.date.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const close_at =
    o.close_at == null || o.close_at === ""
      ? null
      : normalizeTime(o.close_at, "22:00");
  const extend_close_at =
    o.extend_close_at == null || o.extend_close_at === ""
      ? null
      : normalizeTime(o.extend_close_at, "23:59");
  if (!close_at && !extend_close_at) return null;
  return { date, close_at, extend_close_at };
}

/** Parse / sanitize JSON from DB or form. Returns null if unusable. */
export function parseShopSchedule(raw: unknown): ShopSchedule | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.days) || o.days.length === 0) return null;

  const base = defaultShopSchedule();
  const byDay = new Map<number, ShopDayWindow>();
  for (const d of o.days) {
    if (!d || typeof d !== "object" || Array.isArray(d)) continue;
    const row = d as Record<string, unknown>;
    const day = Number(row.day);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    byDay.set(day, {
      day,
      open: row.open !== false,
      open_at: normalizeTime(row.open_at, "09:00"),
      close_at: normalizeTime(row.close_at, "22:00"),
    });
  }
  if (byDay.size === 0) return null;

  const days = [0, 1, 2, 3, 4, 5, 6].map(
    (day) =>
      byDay.get(day) ?? {
        day,
        open: false,
        open_at: "09:00",
        close_at: "22:00",
      },
  );

  return {
    timezone:
      typeof o.timezone === "string" && o.timezone.trim()
        ? o.timezone.trim()
        : DEFAULT_TZ,
    days,
    delivery: normalizeChannel(o.delivery, base.delivery),
    pickup: normalizeChannel(o.pickup, base.pickup),
    dine_in: normalizeChannel(o.dine_in, base.dine_in),
    today_override: normalizeTodayOverride(o.today_override),
  };
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function formatTimeLabel(time: string): string {
  const mins = timeToMinutes(time);
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Label that clarifies overnight closes (e.g. 3 PM – 2 AM next day). */
export function formatTimeRangeLabel(openAt: string, closeAt: string): string {
  const overnight = timeToMinutes(closeAt) < timeToMinutes(openAt);
  return `${formatTimeLabel(openAt)} – ${formatTimeLabel(closeAt)}${
    overnight ? " (next day)" : ""
  }`;
}

/** True if `minutes` sits inside [open, close), including overnight windows. */
export function isMinutesInWindow(
  minutes: number,
  openAt: string,
  closeAt: string,
): boolean {
  const start = timeToMinutes(openAt);
  const end = timeToMinutes(closeAt);
  if (start === end) return false;
  if (end > start) return minutes >= start && minutes < end;
  // Overnight e.g. 15:00 → 02:00
  return minutes >= start || minutes < end;
}

export function isOvernightWindow(openAt: string, closeAt: string): boolean {
  return timeToMinutes(closeAt) < timeToMinutes(openAt);
}

function weekdayShortToIndex(short: string): number {
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[short] ?? 0;
}

export function getZonedClock(
  date: Date = new Date(),
  timeZone: string = DEFAULT_TZ,
): { day: number; minutes: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return {
      day: weekdayShortToIndex(weekday),
      minutes: (hour % 24) * 60 + minute,
    };
  } catch {
    return {
      day: date.getDay(),
      minutes: date.getHours() * 60 + date.getMinutes(),
    };
  }
}

/** YYYY-MM-DD in the shop timezone. */
export function getZonedDateString(
  date: Date = new Date(),
  timeZone: string = DEFAULT_TZ,
): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function resolveChannelWindow(
  schedule: ShopSchedule,
  channel: ShopFulfillmentChannel,
  today: ShopDayWindow,
): { open_at: string; close_at: string } {
  if (channel === "store") {
    return { open_at: today.open_at, close_at: today.close_at };
  }
  const win =
    channel === "delivery"
      ? schedule.delivery
      : channel === "pickup"
        ? schedule.pickup
        : schedule.dine_in;
  if (win.same_as_store) {
    return { open_at: today.open_at, close_at: today.close_at };
  }
  return { open_at: win.open_at, close_at: win.close_at };
}

function overrideForDate(
  schedule: ShopSchedule,
  dateStr: string,
): ShopTodayOverride | null {
  const o = schedule.today_override;
  if (!o || o.date !== dateStr) return null;
  return o;
}

/** Apply early-close / extend to a day's window when override matches that date. */
export function applyDayOverride(
  win: { open_at: string; close_at: string },
  override: ShopTodayOverride | null,
): { open_at: string; close_at: string; note?: string } {
  if (!override) return win;
  if (override.close_at) {
    return {
      open_at: win.open_at,
      close_at: override.close_at,
      note: `Closing early today at ${formatTimeLabel(override.close_at)}`,
    };
  }
  if (override.extend_close_at) {
    return {
      open_at: win.open_at,
      close_at: override.extend_close_at,
      note: `Extended today until ${formatTimeLabel(override.extend_close_at)}`,
    };
  }
  return win;
}

function nextOpenHint(
  schedule: ShopSchedule,
  fromDay: number,
  afterMinutes: number,
  channel: ShopFulfillmentChannel,
): string {
  for (let i = 0; i < 7; i++) {
    const day = (fromDay + i) % 7;
    const row = schedule.days.find((d) => d.day === day);
    if (!row?.open) continue;
    const win = resolveChannelWindow(schedule, channel, row);
    if (i === 0) {
      const start = timeToMinutes(win.open_at);
      // After midnight during overnight: "opens" already passed yesterday —
      // don't say opens today at 3 PM if we're still before that for a same-day window.
      if (afterMinutes < start) {
        return `Opens today at ${formatTimeLabel(win.open_at)}`;
      }
      continue;
    }
    return `Opens ${DAY_SHORT[day]} at ${formatTimeLabel(win.open_at)}`;
  }
  return "Closed";
}

/** Human label like "Mon–Sat 3 PM – 2 AM (next day)". */
export function formatScheduleSummary(schedule: ShopSchedule): string {
  const openDays = schedule.days.filter((d) => d.open);
  if (openDays.length === 0) return "Closed";

  const first = openDays[0]!;
  const sameTimes = openDays.every(
    (d) => d.open_at === first.open_at && d.close_at === first.close_at,
  );
  const range = sameTimes
    ? formatTimeRangeLabel(first.open_at, first.close_at)
    : "varies";

  if (openDays.length === 7) return `Daily ${range}`;

  const indices = openDays.map((d) => d.day).sort((a, b) => a - b);
  const contiguous =
    indices.length > 1 &&
    indices.every((d, i) => i === 0 || d === indices[i - 1]! + 1);

  const daysLabel = contiguous
    ? `${DAY_SHORT[indices[0]!]}–${DAY_SHORT[indices[indices.length - 1]!]}`
    : indices.map((d) => DAY_SHORT[d]).join(", ");

  return `${daysLabel} ${range}`;
}

export function formatChannelHoursLine(
  schedule: ShopSchedule,
  channel: Exclude<ShopFulfillmentChannel, "store">,
): string {
  const win =
    channel === "delivery"
      ? schedule.delivery
      : channel === "pickup"
        ? schedule.pickup
        : schedule.dine_in;
  if (win.same_as_store) return "Same as store hours";
  return formatTimeRangeLabel(win.open_at, win.close_at);
}

function channelLabel(channel: ShopFulfillmentChannel): string {
  if (channel === "delivery") return "Delivery";
  if (channel === "pickup") return "Pickup";
  if (channel === "dine_in") return "Sitting";
  return "Store";
}

export function evaluateShopChannelAvailability(input: {
  schedule?: ShopSchedule | null;
  business_hours?: string | null;
  operating_status?: string | null;
  channel?: ShopFulfillmentChannel;
  now?: Date;
}): {
  state: ShopOpenState;
  label: "Open" | "Closed" | "Hours TBD";
  hoursText: string;
  reason: string;
  accepting: boolean;
} {
  const channel = input.channel ?? "store";
  const schedule = input.schedule ? parseShopSchedule(input.schedule) : null;
  const hoursText =
    (schedule ? formatScheduleSummary(schedule) : "") ||
    (input.business_hours ?? "").trim() ||
    (isShopClosedStatus(input.operating_status) ? "Closed" : "Open");

  if (isShopClosedStatus(input.operating_status)) {
    return {
      state: "closed",
      label: "Closed",
      hoursText,
      reason: "Shop marked closed by merchant.",
      accepting: false,
    };
  }

  if (!schedule) {
    return {
      state: "open",
      label: "Open",
      hoursText,
      reason: "",
      accepting: true,
    };
  }

  const now = input.now ?? new Date();
  const tz = schedule.timezone ?? DEFAULT_TZ;
  const clock = getZonedClock(now, tz);
  const todayDate = getZonedDateString(now, tz);
  const yesterdayDate = getZonedDateString(
    new Date(now.getTime() - 24 * 60 * 60 * 1000),
    tz,
  );

  const today = schedule.days.find((d) => d.day === clock.day);
  const yesterday = schedule.days.find((d) => d.day === (clock.day + 6) % 7);
  const label = channelLabel(channel);

  // 1) Overnight spill from yesterday (e.g. Sat 3 PM → Sun 2 AM, now Sun 1 AM)
  if (yesterday?.open) {
    const base = resolveChannelWindow(schedule, channel, yesterday);
    const applied = applyDayOverride(base, overrideForDate(schedule, yesterdayDate));
    if (
      isOvernightWindow(applied.open_at, applied.close_at) &&
      clock.minutes < timeToMinutes(applied.close_at)
    ) {
      return {
        state: "open",
        label: "Open",
        hoursText,
        reason: `${label} until ${formatTimeLabel(applied.close_at)}${
          applied.note ? ` · ${applied.note}` : ""
        }`,
        accepting: true,
      };
    }
  }

  // 2) Today's calendar window
  if (today?.open) {
    const base = resolveChannelWindow(schedule, channel, today);
    const applied = applyDayOverride(base, overrideForDate(schedule, todayDate));
    if (isMinutesInWindow(clock.minutes, applied.open_at, applied.close_at)) {
      return {
        state: "open",
        label: "Open",
        hoursText,
        reason: `${label} until ${formatTimeLabel(applied.close_at)}${
          isOvernightWindow(applied.open_at, applied.close_at) ? " (next day)" : ""
        }${applied.note ? ` · ${applied.note}` : ""}`,
        accepting: true,
      };
    }

    const hint = nextOpenHint(schedule, clock.day, clock.minutes, channel);
    return {
      state: "closed",
      label: "Closed",
      hoursText,
      reason: `${label} hours: ${formatTimeRangeLabel(applied.open_at, applied.close_at)}. ${hint}`,
      accepting: false,
    };
  }

  const hint = nextOpenHint(schedule, clock.day, clock.minutes, channel);
  return {
    state: "closed",
    label: "Closed",
    hoursText,
    reason: hint,
    accepting: false,
  };
}

/** Back-compat helper used across checkout / shop page / orders API. */
export function getShopHoursSummary(input: {
  business_hours?: string | null;
  operating_status?: string | null;
  shop_schedule?: unknown;
  channel?: ShopFulfillmentChannel;
  now?: Date;
}): {
  state: ShopOpenState;
  label: "Open" | "Closed" | "Hours TBD";
  hoursText: string;
  reason?: string;
  accepting?: boolean;
} {
  const schedule = parseShopSchedule(input.shop_schedule);
  return evaluateShopChannelAvailability({
    schedule,
    business_hours: input.business_hours,
    operating_status: input.operating_status,
    channel: input.channel ?? "store",
    now: input.now,
  });
}
