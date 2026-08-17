"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

/* -------------------------------------------------------------------------- */
/*  StoreManageActions — merchant quick actions on the storefront.            */
/*                                                                             */
/*  Renders a horizontal row of pretty, colour-coded action chips, plus a     */
/*  floating "+" FAB that expands into a chooser with the same actions.       */
/*  The chooser is portal-rendered so it never clips inside card containers.  */
/* -------------------------------------------------------------------------- */

export interface StoreManageAction {
  id: string;
  label: string;
  icon: ReactNode;
  /** Tailwind classes for the icon chip background + text. */
  tone: string;
  onClick?: () => void;
  href?: string;
}

function PlusIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export default function StoreManageActions({ actions }: { actions: StoreManageAction[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  const openChooser = () => {
    const fab = fabRef.current;
    if (!fab) return;
    const r = fab.getBoundingClientRect();
    const menuH = actions.length * 56 + 16;
    let top = r.top - menuH - 8;
    if (top < 8) top = r.bottom + 8;
    let left = r.right - 200;
    if (left < 8) left = 8;
    setPos({ top, left });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target as Node;
      if (fabRef.current?.contains(el)) return;
      const menu = document.getElementById("tm-manage-chooser");
      if (menu && menu.contains(el)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const chooser =
    open && pos
      ? createPortal(
          <div
            id="tm-manage-chooser"
            role="menu"
            aria-label="Add options"
            style={{ top: pos.top, left: pos.left, width: 200 }}
            className="fixed z-[300] overflow-hidden rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-2xl shadow-zinc-950/20 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {actions.map((a) => {
              const inner = (
                <>
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${a.tone}`}
                  >
                    {a.icon}
                  </span>
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                    {a.label}
                  </span>
                </>
              );
              const cls =
                "flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800";
              if (a.href) {
                return (
                  <Link
                    key={a.id}
                    href={a.href}
                    onClick={() => setOpen(false)}
                    className={cls}
                    role="menuitem"
                  >
                    {inner}
                  </Link>
                );
              }
              return (
                <button
                  key={a.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    a.onClick?.();
                  }}
                  className={cls}
                >
                  {inner}
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {/* Floating "+" FAB — expands into the chooser */}
      <button
        ref={fabRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else openChooser();
        }}
        aria-label="Add"
        aria-haspopup="menu"
        aria-expanded={open}
        className="fixed bottom-36 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-900/30 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 md:bottom-24"
      >
        <PlusIcon />
      </button>
      {chooser}
    </>
  );
}
