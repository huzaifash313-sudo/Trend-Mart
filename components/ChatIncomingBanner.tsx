"use client";

/* WhatsApp-style top banner for new chat messages (not the notification bell). */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type ChatIncomingDetail = {
  conversationId: string;
  title: string;
  body: string;
  linkUrl?: string;
};

const SHOW_MS = 5500;

export default function ChatIncomingBanner() {
  const router = useRouter();
  const [item, setItem] = useState<ChatIncomingDetail | null>(null);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    const onAlert = (e: Event) => {
      const detail = (e as CustomEvent<ChatIncomingDetail>).detail;
      if (!detail?.conversationId || !detail.title) return;
      setItem(detail);
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setItem(null), SHOW_MS);
    };

    window.addEventListener("trendsmart:chat-alert", onAlert);
    return () => {
      window.removeEventListener("trendsmart:chat-alert", onAlert);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  const dismiss = useCallback(() => setItem(null), []);

  const openChat = useCallback(() => {
    if (!item) return;
    const href = item.linkUrl || `/account/inquiries?c=${item.conversationId}`;
    setItem(null);
    router.push(href);
  }, [item, router]);

  if (!item) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[220] flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-white/20 bg-zinc-900/95 px-3.5 py-3 shadow-2xl shadow-black/40 backdrop-blur-md dark:border-zinc-700">
        <button
          type="button"
          onClick={openChat}
          className="flex min-w-0 flex-1 items-start gap-3 text-left transition hover:opacity-95"
          aria-label={`Open chat with ${item.title}`}
        >
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
            {item.title.charAt(0).toUpperCase() || "C"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-white">{item.title}</span>
            <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-zinc-300">
              {item.body || "New message"}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400"
          aria-label="Dismiss"
        >
          Close
        </button>
      </div>
    </div>
  );
}
