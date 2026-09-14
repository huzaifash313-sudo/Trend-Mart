"use client";

import { useLocale } from "@/context/LocaleContext";

export default function OfflineClient() {
  const { t } = useLocale();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 text-center dark:bg-[color:var(--tm-surface)]">
      <div className="mb-4 text-6xl">📡</div>
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{t("offline.title")}</h1>
      <p className="mt-2 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        {t("offline.body")}
      </p>
      {/* Intentional hard navigation (not next/link) — forces a real network
          request so the browser/service worker can re-check connectivity,
          rather than a client-side route transition that would silently
          no-op while offline. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/"
        className="mt-6 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
      >
        {t("offline.retry")}
      </a>
    </div>
  );
}
