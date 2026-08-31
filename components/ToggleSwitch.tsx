"use client";

import { type FC, useId, useCallback } from "react";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Professional pill toggle                                       */
/*  Circle thumb fits flush; springy slide + soft scale animation.             */
/* -------------------------------------------------------------------------- */

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Accessible label (required) for screen readers. */
  label: string;
  /** Visible text label next to the toggle. */
  visibleLabel?: string;
  /** Size variant. sm = compact, default = standard capsule. */
  size?: "sm" | "default";
  /** Optional: custom accent color class (e.g., "emerald", "rose", "blue"). */
  accent?: string;
}

const ToggleSwitch: FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  visibleLabel,
  size = "default",
  accent = "emerald",
}) => {
  const generatedId = useId();
  const isSm = size === "sm";

  /**
   * Proportions (border-box):
   * default — track 48×28, thumb 24, inset 2 → travel 20
   * sm      — track 40×24, thumb 20, inset 2 → travel 16
   * Circle diameter = track height − 4px so it fits the pill perfectly.
   */
  const track = isSm ? "h-6 w-10" : "h-7 w-12";
  const thumb = isSm ? "h-5 w-5" : "h-6 w-6";
  const thumbPos = checked
    ? isSm
      ? "left-[calc(100%-1.375rem)]" /* 22px = 20 thumb + 2 inset */
      : "left-[calc(100%-1.625rem)]" /* 26px = 24 thumb + 2 inset */
    : "left-0.5"; /* 2px */

  const accentOn: Record<string, string> = {
    emerald: "tm-toggle-on",
    rose: "bg-gradient-to-r from-rose-500 to-rose-400",
    blue: "bg-gradient-to-r from-blue-500 to-sky-400",
    amber: "bg-gradient-to-r from-amber-500 to-amber-400",
    violet: "bg-gradient-to-r from-violet-500 to-purple-400",
  };
  const onColor = accentOn[accent] ?? accentOn.emerald;

  const handleClick = useCallback(() => {
    if (!disabled) onChange(!checked);
  }, [checked, disabled, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (!disabled) onChange(!checked);
    }
  };

  return (
    <div className="tm-toggle inline-flex items-center gap-3">
      <button
        id={generatedId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={`
          tm-toggle-track relative inline-flex shrink-0 items-center rounded-full
          focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/70
          focus-visible:ring-offset-2 focus-visible:ring-offset-white
          dark:focus-visible:ring-offset-[color:var(--tm-surface)]
          disabled:cursor-not-allowed disabled:opacity-45
          ${track}
          ${checked ? `${onColor} is-on` : "tm-toggle-off"}
        `}
      >
        <span
          aria-hidden="true"
          className={`
            tm-toggle-thumb absolute top-0.5 block rounded-full bg-white
            ${thumb}
            ${thumbPos}
            ${checked ? "is-on" : ""}
          `}
        />
      </button>

      {visibleLabel ? (
        <label
          htmlFor={generatedId}
          className={`select-none text-sm font-medium leading-snug ${
            disabled
              ? "cursor-not-allowed text-zinc-400 dark:text-zinc-500"
              : "cursor-pointer text-zinc-700 dark:text-zinc-200"
          }`}
        >
          {visibleLabel}
        </label>
      ) : null}
    </div>
  );
};

export default ToggleSwitch;
