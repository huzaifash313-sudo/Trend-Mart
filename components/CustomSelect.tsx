"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Custom Select Dropdown                                         */
/*                                                                            */
/*  A fully custom, accessible dropdown that replaces the native <select>.    */
/*  Drop-in friendly: accepts `options`, `value`, and `onChange` (string      */
/*  values, matching native select semantics). Supports dark mode, keyboard   */
/*  navigation, click-outside dismissal, and Escape to close.                 */
/* -------------------------------------------------------------------------- */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Shown when no option matches `value`. */
  placeholder?: string;
  /** Accessible label for the trigger button. */
  ariaLabel?: string;
  disabled?: boolean;
  /** Visual size of the trigger. */
  size?: "sm" | "md";
  /** Use a pill (rounded-full) shape instead of rounded-xl. */
  pill?: boolean;
  /** Dropdown alignment relative to the trigger. */
  align?: "left" | "right";
  /** When false, the trigger shrinks to fit its content (for inline filters). */
  fullWidth?: boolean;
  /** Extra classes for the trigger (width, margins, etc). */
  className?: string;
  id?: string;
}

const sizeClasses: Record<"sm" | "md", string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-3.5 py-2 text-sm",
};

function ChevronDown() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-zinc-400 transition-transform dark:text-zinc-500"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  ariaLabel,
  disabled = false,
  size = "md",
  pill = false,
  align = "left",
  fullWidth = true,
  className = "",
  id,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  const displayLabel = selected?.label ?? placeholder;

  /* Close on outside pointer press and on Escape. */
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  /* Reset the highlighted option whenever the list opens. */
  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value);
      setActiveIndex(idx >= 0 ? idx : 0);
    }
  }, [open, options, value]);

  /* Keep the highlighted option visible while navigating. */
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const select = useCallback(
    (opt: SelectOption) => {
      if (opt.disabled) return;
      onChange(opt.value);
      setOpen(false);
    },
    [onChange],
  );

  const handleTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const handleListKeyDown = (e: ReactKeyboardEvent<HTMLUListElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = options[activeIndex];
      if (opt) select(opt);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`relative ${fullWidth ? "w-full" : "inline-block"} ${className}`}
    >
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleTriggerKeyDown}
        className={`inline-flex items-center justify-between gap-2 border border-zinc-200 bg-white font-medium text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-600 ${
          pill ? "rounded-full" : "rounded-xl"
        } ${sizeClasses[size]} ${fullWidth ? "w-full" : ""} ${open ? "border-emerald-500 ring-2 ring-emerald-500/20" : ""}`}
      >
        <span
          className={`truncate ${selected ? "" : "text-zinc-400 dark:text-zinc-500"}`}
        >
          {displayLabel}
        </span>
        <span
          className={`${open ? "-rotate-180" : ""} inline-flex transition-transform`}
        >
          <ChevronDown />
        </span>
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          onKeyDown={handleListKeyDown}
          className={`absolute z-50 mt-1.5 max-h-60 min-w-full overflow-y-auto rounded-xl border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-800 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {options.length === 0 && (
            <li className="px-3.5 py-2 text-sm text-zinc-400 dark:text-zinc-500">
              No options
            </li>
          )}
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
            const isActive = i === activeIndex;
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled}
                className={`flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-sm transition-colors ${
                  opt.disabled
                    ? "cursor-not-allowed text-zinc-300 dark:text-zinc-600"
                    : "cursor-pointer text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-700/60"
                } ${isActive ? "bg-emerald-50 dark:bg-emerald-900/20" : ""} ${
                  isSelected ? "font-semibold" : "font-normal"
                }`}
                onClick={() => select(opt)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <CheckIcon />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
