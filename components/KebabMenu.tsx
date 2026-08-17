"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/* -------------------------------------------------------------------------- */
/*  KebabMenu — reusable 3-dot dropdown for owner manage cards.               */
/*                                                                             */
/*  The menu is rendered via a portal at document.body with fixed positioning  */
/*  anchored to the button's bounding rect. This keeps it from being clipped  */
/*  by ancestor `overflow-hidden` / `overflow-x-auto` card containers.         */
/*  Closes on outside click, Escape, or scroll.                                */
/* -------------------------------------------------------------------------- */

export interface KebabMenuItem {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  icon?: ReactNode;
}

const MENU_WIDTH = 176; // w-44
const ITEM_H = 36;
const PAD = 8;

function DotsIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="19" r="1.7" />
    </svg>
  );
}

export default function KebabMenu({
  items,
  ariaLabel = "More options",
  variant = "overlay",
}: {
  items: KebabMenuItem[];
  ariaLabel?: string;
  /** `overlay` = translucent chip for over images; `plain` = subtle body button. */
  variant?: "overlay" | "plain";
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const openMenu = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const menuH = items.length * ITEM_H + PAD;

    let top = r.bottom + 6;
    if (top + menuH > window.innerHeight - 8) {
      top = r.top - menuH - 6;
      if (top < 8) top = 8;
    }

    let left = r.right - MENU_WIDTH;
    if (left < 8) left = 8;
    if (left + MENU_WIDTH > window.innerWidth - 8) {
      left = window.innerWidth - MENU_WIDTH - 8;
    }

    setPos({ top, left });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target as Node;
      if (btnRef.current?.contains(el)) return;
      // Portal menu lives outside the button; any click outside both closes.
      const menu = document.getElementById("tm-kebab-portal");
      if (menu && menu.contains(el)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const btnCls =
    variant === "overlay"
      ? "flex h-7 w-7 items-center justify-center rounded-full bg-zinc-950/55 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-zinc-950/80"
      : "flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200";

  const menu =
    open && pos
      ? createPortal(
          <div
            id="tm-kebab-portal"
            role="menu"
            aria-label={ariaLabel}
            style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
            className="fixed z-[300] overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-xl shadow-zinc-950/20 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold transition-colors ${
                  item.destructive
                    ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                    : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                }`}
              >
                {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else openMenu();
        }}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        className={btnCls}
      >
        <DotsIcon />
      </button>
      {menu}
    </>
  );
}
