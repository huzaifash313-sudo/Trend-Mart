"use client";

import type { ShopChannelWindow, ShopSchedule, ShopTodayOverride } from "@/lib/shopHours";
import {
  defaultShopSchedule,
  formatScheduleSummary,
  formatTimeRangeLabel,
  getZonedDateString,
  isOvernightWindow,
  parseShopSchedule,
} from "@/lib/shopHours";

const DAY_LABELS = [
  { day: 0, short: "Sun" },
  { day: 1, short: "Mon" },
  { day: 2, short: "Tue" },
  { day: 3, short: "Wed" },
  { day: 4, short: "Thu" },
  { day: 5, short: "Fri" },
  { day: 6, short: "Sat" },
] as const;

type ChannelKey = "delivery" | "pickup" | "dine_in";

const CHANNELS: Array<{
  key: ChannelKey;
  title: string;
  hint: string;
}> = [
  {
    key: "delivery",
    title: "Delivery window",
    hint: "Home delivery orders — e.g. 3 PM → 1 AM is fine.",
  },
  {
    key: "pickup",
    title: "Pickup window",
    hint: "Self-pickup orders — can match delivery or store.",
  },
  {
    key: "dine_in",
    title: "Sitting / dine-in window",
    hint: "QR table orders — e.g. 3 PM → 2 AM (next day) works.",
  },
];

function TimeInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value.slice(0, 5))}
      aria-label={ariaLabel}
      className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
    />
  );
}

function OvernightHint({ openAt, closeAt }: { openAt: string; closeAt: string }) {
  if (!isOvernightWindow(openAt, closeAt)) return null;
  return (
    <p className="mt-1.5 text-[0.65rem] font-medium text-amber-700 dark:text-amber-300">
      Overnight window: closes {formatTimeRangeLabel(openAt, closeAt).split(" – ")[1]} — orders
      after midnight stay accepted until then.
    </p>
  );
}

function ChannelEditor({
  title,
  hint,
  value,
  onChange,
}: {
  title: string;
  hint: string;
  value: ShopChannelWindow;
  onChange: (next: ShopChannelWindow) => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</p>
          <p className="mt-0.5 text-[0.7rem] leading-relaxed text-zinc-500 dark:text-zinc-400">
            {hint}
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={value.same_as_store}
            onChange={(e) =>
              onChange({ ...value, same_as_store: e.target.checked })
            }
            className="h-3.5 w-3.5 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
          />
          Same as store
        </label>
      </div>
      {!value.same_as_store ? (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <TimeInput
              value={value.open_at}
              onChange={(open_at) => onChange({ ...value, open_at })}
              ariaLabel={`${title} start`}
            />
            <span className="text-xs text-zinc-400">to</span>
            <TimeInput
              value={value.close_at}
              onChange={(close_at) => onChange({ ...value, close_at })}
              ariaLabel={`${title} end`}
            />
          </div>
          <OvernightHint openAt={value.open_at} closeAt={value.close_at} />
        </div>
      ) : null}
    </div>
  );
}

function TodayOverrideEditor({
  schedule,
  onChange,
}: {
  schedule: ShopSchedule;
  onChange: (next: ShopSchedule) => void;
}) {
  const today = getZonedDateString(new Date(), schedule.timezone ?? "Asia/Karachi");
  const active =
    schedule.today_override?.date === today ? schedule.today_override : null;
  const mode = active?.close_at
    ? "early"
    : active?.extend_close_at
      ? "extend"
      : "off";

  const setOverride = (next: ShopTodayOverride | null) => {
    onChange({ ...schedule, today_override: next });
  };

  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 dark:border-amber-900/50 dark:bg-amber-950/25">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
        Today only (event / workload)
      </p>
      <p className="mt-0.5 text-[0.7rem] leading-relaxed text-amber-800/90 dark:text-amber-200/80">
        Close early when busy, or stay open later for an event — weekly hours stay
        unchanged. Clears automatically tomorrow.
      </p>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {(
          [
            { id: "off", label: "Normal today" },
            { id: "early", label: "Close early" },
            { id: "extend", label: "Extend late" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => {
              if (opt.id === "off") {
                setOverride(null);
                return;
              }
              if (opt.id === "early") {
                setOverride({
                  date: today,
                  close_at: active?.close_at || "20:00",
                  extend_close_at: null,
                });
                return;
              }
              setOverride({
                date: today,
                close_at: null,
                extend_close_at: active?.extend_close_at || "04:00",
              });
            }}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
              mode === opt.id
                ? "bg-amber-600 text-white"
                : "bg-white text-amber-900/80 dark:bg-zinc-900 dark:text-amber-100"
            }`}
            aria-pressed={mode === opt.id}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {mode === "early" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-amber-900/80 dark:text-amber-200/80">Close at</span>
          <TimeInput
            value={active?.close_at || "20:00"}
            onChange={(close_at) =>
              setOverride({ date: today, close_at, extend_close_at: null })
            }
            ariaLabel="Close early at"
          />
        </div>
      ) : null}

      {mode === "extend" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-amber-900/80 dark:text-amber-200/80">
            Stay open until
          </span>
          <TimeInput
            value={active?.extend_close_at || "04:00"}
            onChange={(extend_close_at) =>
              setOverride({ date: today, close_at: null, extend_close_at })
            }
            ariaLabel="Extend until"
          />
          <span className="text-[0.65rem] text-amber-800/70 dark:text-amber-200/70">
            (can be past midnight)
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function ShopHoursEditor({
  value,
  onChange,
}: {
  value: ShopSchedule | null | undefined;
  onChange: (next: ShopSchedule) => void;
}) {
  const configured = !!parseShopSchedule(value);
  const schedule = parseShopSchedule(value) ?? defaultShopSchedule();

  const patch = (partial: Partial<ShopSchedule>) => {
    onChange({ ...schedule, ...partial });
  };

  const setDayOpen = (day: number, open: boolean) => {
    patch({
      days: schedule.days.map((d) => (d.day === day ? { ...d, open } : d)),
    });
  };

  const setSharedTimes = (open_at: string, close_at: string) => {
    patch({
      days: schedule.days.map((d) => ({ ...d, open_at, close_at })),
    });
  };

  const openDay = schedule.days.find((d) => d.open) ?? schedule.days[1]!;
  const summary = formatScheduleSummary(schedule);

  return (
    <div className="space-y-4">
      {!configured ? (
        <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/60 px-3 py-2.5 dark:border-emerald-800 dark:bg-emerald-950/20">
          <p className="text-xs leading-relaxed text-emerald-800 dark:text-emerald-300">
            Hours not saved yet — orders still follow the Open/Closed switch only.
            Adjust below and save to turn on live schedule windows.
          </p>
          <button
            type="button"
            onClick={() => onChange(defaultShopSchedule())}
            className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Start with Mon–Sat 9 AM – 10 PM
          </button>
        </div>
      ) : null}

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Working days
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DAY_LABELS.map(({ day, short }) => {
            const row = schedule.days.find((d) => d.day === day);
            const active = !!row?.open;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setDayOpen(day, !active)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
                aria-pressed={active}
              >
                {short}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Store open hours
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TimeInput
            value={openDay.open_at}
            onChange={(open_at) => setSharedTimes(open_at, openDay.close_at)}
            ariaLabel="Store opens at"
          />
          <span className="text-xs text-zinc-400">to</span>
          <TimeInput
            value={openDay.close_at}
            onChange={(close_at) => setSharedTimes(openDay.open_at, close_at)}
            ariaLabel="Store closes at"
          />
        </div>
        <OvernightHint openAt={openDay.open_at} closeAt={openDay.close_at} />
        <p className="mt-1.5 text-[0.7rem] text-zinc-500 dark:text-zinc-400">
          Live summary:{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{summary}</span>
        </p>
      </div>

      <div className="space-y-2.5">
        {CHANNELS.map((ch) => (
          <ChannelEditor
            key={ch.key}
            title={ch.title}
            hint={ch.hint}
            value={schedule[ch.key]}
            onChange={(next) => patch({ [ch.key]: next })}
          />
        ))}
      </div>

      {configured ? (
        <TodayOverrideEditor schedule={schedule} onChange={onChange} />
      ) : null}

      <p className="text-[0.7rem] leading-relaxed text-zinc-500 dark:text-zinc-400">
        Pakistan time (Asia/Karachi). Outside a channel&apos;s window that option is
        blocked at checkout. Use “Store open” only for a full emergency close.
      </p>
    </div>
  );
}
