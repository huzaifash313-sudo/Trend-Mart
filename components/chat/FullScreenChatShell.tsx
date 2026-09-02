"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

interface FullScreenChatShellProps {
  children: ReactNode;
  /** Optional extra classes on the shell container */
  className?: string;
}

/** WhatsApp-style fixed chat viewport — navbar top, bottom nav visible, site footer hidden. */
export function FullScreenChatShell({ children, className = "" }: FullScreenChatShellProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("tm-chat-fullscreen");
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.classList.remove("tm-chat-fullscreen");
      document.body.style.overflow = "";
    };
  }, []);

  const shell = (
    <div
      className={`tm-chat-shell fixed inset-x-0 z-[130] flex min-h-0 flex-col bg-white dark:bg-zinc-950 ${className}`}
      style={{
        top: "var(--tm-navbar-sticky-offset, 62px)",
        bottom: "calc(3.75rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      {children}
    </div>
  );

  if (!mounted) return null;
  return createPortal(shell, document.body);
}

interface ChatShellHeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  onBack?: () => void;
  avatar?: ReactNode;
  badge?: string;
  action?: ReactNode;
  gradient?: boolean;
}

export function ChatShellHeader({
  title,
  subtitle,
  backHref,
  backLabel = "Back",
  onBack,
  avatar,
  badge,
  action,
  gradient = true,
}: ChatShellHeaderProps) {
  const backBtn = (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15">
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </span>
  );

  return (
    <header
      className={`flex shrink-0 items-center gap-2 px-2 py-2.5 shadow-sm sm:px-3 ${
        gradient
          ? "bg-gradient-to-r from-emerald-600 via-teal-600 to-teal-500 text-white"
          : "border-b border-emerald-100 bg-white text-zinc-900 dark:border-emerald-900/30 dark:bg-zinc-900 dark:text-zinc-100"
      }`}
    >
      {onBack ? (
        <button type="button" onClick={onBack} className="shrink-0" aria-label={backLabel}>
          {backBtn}
        </button>
      ) : backHref ? (
        <Link href={backHref} className="shrink-0" aria-label={backLabel}>
          {backBtn}
        </Link>
      ) : null}

      {avatar ? <div className="shrink-0">{avatar}</div> : null}

      <div className="min-w-0 flex-1 px-1">
        <p className="truncate text-sm font-bold leading-tight sm:text-base">{title}</p>
        {subtitle ? (
          <p className={`truncate text-[0.65rem] sm:text-xs ${gradient ? "opacity-90" : "text-zinc-500 dark:text-zinc-400"}`}>
            {subtitle}
          </p>
        ) : null}
      </div>

      {badge ? (
        <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[0.55rem] font-bold uppercase tracking-wide">
          {badge}
        </span>
      ) : null}

      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function ChatShellBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#ece5dd] bg-[url('/chat-bg-light.svg')] bg-repeat dark:bg-zinc-900 ${className}`}
      style={{
        backgroundImage: undefined,
        backgroundColor: "var(--tm-chat-bg, #f0f2f5)",
      }}
    >
      <div className="mx-auto flex min-h-full max-w-3xl flex-col px-3 py-3 sm:px-4">{children}</div>
    </div>
  );
}

export function ChatShellFooter({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="region"
      aria-label="Message composer"
      className={`tm-chat-composer shrink-0 border-t border-emerald-100/80 bg-white px-3 py-2.5 dark:border-emerald-900/30 dark:bg-zinc-950 sm:px-4 ${className}`}
    >
      <div className="mx-auto max-w-3xl">{children}</div>
    </div>
  );
}
