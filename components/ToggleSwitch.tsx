"use client";

import { type FC, useId, useCallback } from "react";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Capsule (pill) toggle switch                                   */
/*  Track = horizontal capsule; thumb = small circle that slides inside.       */
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

  // Capsule track (wider than tall) + sliding circular thumb
  // DEFAULT  track: 44×24   thumb: 18×18
  // SMALL    track: 36×20   thumb: 14×14
  const track = isSm ? "h-5 w-9" : "h-6 w-11";
  const thumb = isSm ? "h-3.5 w-3.5" : "h-[1.125rem] w-[1.125rem]";
  const thumbOn = isSm ? "translate-x-[1.125rem]" : "translate-x-5";

  const accentOn: Record<string, string> = {
    emerald: "bg-emerald-500 dark:bg-emerald-500",
    rose: "bg-rose-500 dark:bg-rose-500",
    blue: "bg-blue-500 dark:bg-blue-500",
    amber: "bg-amber-500 dark:bg-amber-500",
    violet: "bg-violet-500 dark:bg-violet-500",
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
    <div className="inline-flex items-center gap-2.5">
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
          relative inline-flex shrink-0 items-center rounded-full p-0.5
          transition-colors duration-200 ease-out
          focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400
          focus-visible:ring-offset-2 focus-visible:ring-offset-white
          dark:focus-visible:ring-offset-zinc-900
          disabled:cursor-not-allowed disabled:opacity-50
          ${track}
          ${checked ? onColor : "bg-zinc-300 dark:bg-zinc-600"}
        `}
      >
        <span
          aria-hidden="true"
          className={`
            block rounded-full bg-white shadow-sm
            transition-transform duration-200 ease-out
            ${thumb}
            ${checked ? thumbOn : "translate-x-0"}
          `}
        />
      </button>

      {visibleLabel ? (
        <label
          htmlFor={generatedId}
          className={`select-none text-sm font-medium leading-none ${
            disabled
              ? "text-zinc-400 dark:text-zinc-500"
              : checked
                ? "text-zinc-800 dark:text-zinc-200"
                : "text-zinc-600 dark:text-zinc-300"
          }`}
        >
          {visibleLabel}
        </label>
      ) : null}
    </div>
  );
};

export default ToggleSwitch;
