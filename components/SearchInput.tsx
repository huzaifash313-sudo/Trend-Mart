"use client";

import { type FormEvent } from "react";

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (e: FormEvent) => void;
  placeholder?: string;
  ariaLabel?: string;
  /** rounded-2xl (default) or rounded-full (store page pill look). */
  radius?: "rounded-2xl" | "rounded-full";
  showSubmitButton?: boolean;
  showClearButton?: boolean;
  submitLabel?: string;
  className?: string;
}

/**
 * Single shared search bar used across products / deals / store pages so the
 * height, radius, icon, focus ring, and button behavior stay identical.
 * Behavior is opt-in: submit + clear buttons and radius are configurable.
 */
export default function SearchInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Search",
  ariaLabel = "Search",
  radius = "rounded-2xl",
  showSubmitButton = true,
  showClearButton = false,
  submitLabel = "Search",
  className = "",
}: SearchInputProps) {
  const hasClear = showClearButton && Boolean(value);
  const rightPad =
    showSubmitButton && hasClear
      ? "pr-24"
      : showSubmitButton
        ? "pr-20"
        : hasClear
          ? "pr-10"
          : "pr-4";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(e);
      }}
      className={className}
      role={onSubmit ? undefined : "search"}
    >
      <label className="relative block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
          <SearchIcon />
        </span>
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className={`w-full ${radius} border border-zinc-200 bg-white py-2.5 pl-10 ${rightPad} text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100`}
        />
        {hasClear ? (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            className={`absolute top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 ${
              showSubmitButton ? "right-[4.6rem]" : "right-2.5"
            }`}
          >
            <ClearIcon />
          </button>
        ) : null}
        {showSubmitButton ? (
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            {submitLabel}
          </button>
        ) : null}
      </label>
    </form>
  );
}
