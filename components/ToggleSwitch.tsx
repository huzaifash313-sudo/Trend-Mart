"use client";

import { type FC, useId, useRef, useState, useCallback } from "react";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Premium iOS‑Style Animated Toggle Switch                        */
/*                                                                             */
/*  Features:                                                                   */
/*   - Smooth pill‑track styling (w‑11 h‑6, rounded‑full, dynamic gradient)     */
/*   - Animated sliding circular thumb (transition‑transform duration‑300)      */
/*   - Ripple wave effect on click                                             */
/*   - Full keyboard accessibility (Space/Enter)                               */
/*   - Accessible ARIA role="switch" with aria‑checked                          */
/*   - Dark mode compatible with focus‑visible ring offset                     */
/*   - sm size variant for compact UIs                                          */
/* -------------------------------------------------------------------------- */

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Accessible label (required) for screen readers. */
  label: string;
  /** Visible text label next to the toggle. */
  visibleLabel?: string;
  /** Size variant. sm = compact (40×24), default = standard (44×24). */
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [ripple, setRipple] = useState<{ x: number; y: number; id: number } | null>(null);

  const isSm = size === "sm";

  // ── Dimensions ────────────────────────────────────────────────────────────
  // DEFAULT  track: 44px × 24px   thumb: 18px × 18px   gap: 3px
  // SMALL    track: 40px × 24px   thumb: 18px × 18px   gap: 3px
  const track = isSm ? "w-[40px] h-[24px]" : "w-11 h-6";
  const thumb = "w-[18px] h-[18px]";
  const translate = isSm ? "translate-x-[16px]" : "translate-x-[20px]";
  const rippleSize = isSm ? "w-6 h-6" : "w-6 h-6";

  // ── Accent color mapping ──────────────────────────────────────────────────
  const accentColors: Record<string, { on: string; glow: string; text: string; darkText: string }> = {
    emerald: {
      on: "bg-gradient-to-r from-emerald-400 to-emerald-500",
      glow: "shadow-[0_0_12px_rgba(16,185,129,0.35),inset_0_1px_2px_rgba(255,255,255,0.2)] hover:shadow-[0_0_16px_rgba(16,185,129,0.45),inset_0_1px_2px_rgba(255,255,255,0.25)]",
      text: "text-emerald-700",
      darkText: "dark:text-emerald-400",
    },
    rose: {
      on: "bg-gradient-to-r from-rose-400 to-rose-500",
      glow: "shadow-[0_0_12px_rgba(244,63,94,0.35),inset_0_1px_2px_rgba(255,255,255,0.2)] hover:shadow-[0_0_16px_rgba(244,63,94,0.45),inset_0_1px_2px_rgba(255,255,255,0.25)]",
      text: "text-rose-700",
      darkText: "dark:text-rose-400",
    },
    blue: {
      on: "bg-gradient-to-r from-blue-400 to-blue-500",
      glow: "shadow-[0_0_12px_rgba(59,130,246,0.35),inset_0_1px_2px_rgba(255,255,255,0.2)] hover:shadow-[0_0_16px_rgba(59,130,246,0.45),inset_0_1px_2px_rgba(255,255,255,0.25)]",
      text: "text-blue-700",
      darkText: "dark:text-blue-400",
    },
    amber: {
      on: "bg-gradient-to-r from-amber-400 to-amber-500",
      glow: "shadow-[0_0_12px_rgba(245,158,11,0.35),inset_0_1px_2px_rgba(255,255,255,0.2)] hover:shadow-[0_0_16px_rgba(245,158,11,0.45),inset_0_1px_2px_rgba(255,255,255,0.25)]",
      text: "text-amber-700",
      darkText: "dark:text-amber-400",
    },
    violet: {
      on: "bg-gradient-to-r from-violet-400 to-violet-500",
      glow: "shadow-[0_0_12px_rgba(139,92,246,0.35),inset_0_1px_2px_rgba(255,255,255,0.2)] hover:shadow-[0_0_16px_rgba(139,92,246,0.45),inset_0_1px_2px_rgba(255,255,255,0.25)]",
      text: "text-violet-700",
      darkText: "dark:text-violet-400",
    },
  };

  const colors = accentColors[accent] ?? accentColors.emerald;

  // ── Ripple effect on click ────────────────────────────────────────────────
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const id = Date.now();
      setRipple({ x, y, id });
      onChange(!checked);
      setTimeout(() => setRipple(null), 600);
    },
    [checked, disabled, onChange],
  );

  // ── Keyboard ───────────────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (!disabled) onChange(!checked);
    }
  };

  return (
    <div className="inline-flex items-center gap-3">
      {/* ── Track ──────────────────────────────────────────────────────────── */}
      <button
        ref={buttonRef}
        id={generatedId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={`
          relative shrink-0 cursor-pointer rounded-full
          transition-all duration-300 ease-in-out
          focus:outline-none
          focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2
          focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900
          disabled:cursor-not-allowed disabled:opacity-50
          ${track}
          ${
            checked
              ? `${colors.on} ${colors.glow}`
              : "bg-[#e5e5ea] shadow-[inset_0_2px_4px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.02)] hover:bg-[#dcdce2] dark:bg-zinc-600 dark:shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] dark:hover:bg-zinc-500"
          }
          overflow-hidden
        `}
      >
        {/* ── Ripple wave ──────────────────────────────────────────────────── */}
        {ripple && (
          <span
            key={ripple.id}
            className={`absolute ${rippleSize} -ml-3 -mt-3 rounded-full bg-white/30 animate-[ripple_600ms_ease-out_forwards] pointer-events-none`}
            style={{ left: ripple.x, top: ripple.y }}
          />
        )}

        {/* ── Track inner highlight (on state) ──────────────────────────────── */}
        {checked && (
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-gradient-to-b from-white/15 to-transparent pointer-events-none"
          />
        )}

        {/* ── Animated thumb knob ──────────────────────────────────────────── */}
        <span
          aria-hidden="true"
          className={`
            absolute left-[3px] top-[3px] block rounded-full bg-white
            transition-transform duration-300 ease-in-out
            ${checked ? "shadow-[0_4px_12px_rgba(0,0,0,0.2),0_1px_3px_rgba(0,0,0,0.1)] scale-100" : "shadow-[0_1px_3px_rgba(0,0,0,0.15),0_0_0_0.5px_rgba(0,0,0,0.06)] scale-95"}
            ${thumb}
            ${checked ? translate : "translate-x-0"}
          `}
        />
      </button>

      {/* ── Label ──────────────────────────────────────────────────────────── */}
      {visibleLabel && (
        <label
          htmlFor={generatedId}
          className={`select-none text-sm font-medium leading-none transition-colors duration-300 ${
            disabled
              ? "text-zinc-400 dark:text-zinc-500"
              : checked
                ? `${colors.text} ${colors.darkText}`
                : "text-zinc-600 dark:text-zinc-300"
          }`}
        >
          {visibleLabel}
        </label>
      )}
    </div>
  );
};

export default ToggleSwitch;