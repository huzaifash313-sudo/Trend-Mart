/**
 * Derive Open / Closed + a short hours label from free-text merchant fields.
 * Supports common Pakistan store formats (e.g. "Mon-Sat: 9 AM - 10 PM").
 */

export type ShopOpenState = "open" | "closed" | "unknown";

function pakistanNowParts(): { minutes: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(new Date());

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const weekdayToken = (parts.find((p) => p.type === "weekday")?.value ?? "Mon").slice(0, 3);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    minutes: hour * 60 + minute,
    weekday: map[weekdayToken] ?? 1,
  };
}

function parseClockToMinutes(raw: string): number | null {
  const m = raw
    .trim()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return null;

  let hour = Number(m[1]);
  const minute = Number(m[2] ?? "0");
  const meridiem = m[3]?.toUpperCase();

  if (Number.isNaN(hour) || Number.isNaN(minute) || minute > 59) return null;

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "AM") {
      if (hour === 12) hour = 0;
    } else if (hour !== 12) {
      hour += 12;
    }
  } else if (hour > 23) {
    return null;
  }

  return hour * 60 + minute;
}

/** Pull the first open–close pair from free text. */
function extractTimeRange(text: string): { open: number; close: number } | null {
  const match = text.match(
    /(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s*[-–—to]+\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)/i,
  );
  if (!match) return null;

  const open = parseClockToMinutes(match[1]);
  const close = parseClockToMinutes(match[2]);
  if (open == null || close == null || open === close) return null;
  return { open, close };
}

function statusImpliesClosed(status: string): boolean {
  const s = status.toLowerCase();
  if (!s.trim()) return false;
  if (/\bopen\b/.test(s) && !/closed|close/.test(s)) return false;
  return /temporarily\s*closed|\bclosed\b|\bclose\b/.test(s);
}

function statusImpliesOpen(status: string): boolean {
  const s = status.toLowerCase();
  if (!s.trim()) return false;
  if (statusImpliesClosed(status)) return false;
  return /\bopen\b/.test(s);
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

  const hoursText =
    hours ||
    (status && !statusImpliesClosed(status) && !statusImpliesOpen(status)
      ? status
      : "") ||
    "Hours not set";

  if (statusImpliesClosed(status)) {
    return { state: "closed", label: "Closed", hoursText: hours || status };
  }
  if (statusImpliesOpen(status)) {
    return { state: "open", label: "Open", hoursText: hours || status };
  }

  const range = extractTimeRange(hours || status);
  if (!range) {
    return {
      state: "unknown",
      label: "Hours TBD",
      hoursText,
    };
  }

  const { minutes } = pakistanNowParts();
  const { open, close } = range;
  const isOpen =
    close > open
      ? minutes >= open && minutes < close
      : minutes >= open || minutes < close; // overnight window

  return {
    state: isOpen ? "open" : "closed",
    label: isOpen ? "Open" : "Closed",
    hoursText: hours || status || "Hours not set",
  };
}
