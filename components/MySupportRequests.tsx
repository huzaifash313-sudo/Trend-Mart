"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — "My Requests" ticket status list                               */
/* -------------------------------------------------------------------------- */

import { useEffect, useState } from "react";
import { useLocale } from "@/context/LocaleContext";
import { fetchMySupportTickets } from "@/services/supportService";
import type { SupportTicket, SupportTicketStatus } from "@/types";

const STATUS_STYLE: Record<
  SupportTicketStatus,
  { color: string; icon: string; labelKey: string }
> = {
  open: {
    labelKey: "support.status.open",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    icon: "🕐",
  },
  in_progress: {
    labelKey: "support.status.inProgress",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    icon: "⚙️",
  },
  resolved: {
    labelKey: "support.status.resolved",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    icon: "✅",
  },
  closed: {
    labelKey: "support.status.closed",
    color: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    icon: "🔒",
  },
};

function timeAgo(dateStr: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("support.time.justNow");
  if (mins < 60) return t("support.time.minsAgo", { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("support.time.hoursAgo", { n: hours });
  return t("support.time.daysAgo", { n: Math.floor(hours / 24) });
}

export default function MySupportRequests() {
  const { t } = useLocale();
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchMySupportTickets().then((result) => {
      if (!cancelled && result.success) setTickets(result.data);
      if (!cancelled && !result.success) setTickets([]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (tickets === null || tickets.length === 0) return null;

  return (
    <section
      id="my-requests"
      className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
          {t("support.myRequests")}
        </h2>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {tickets.length === 1
            ? t("support.ticketOne")
            : t("support.ticketMany", { n: tickets.length })}
        </span>
      </div>

      <div className="space-y-3">
        {tickets.map((ticket) => {
          const meta = STATUS_STYLE[ticket.status] ?? STATUS_STYLE.open;
          return (
            <div
              key={ticket.id}
              className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-3.5 dark:border-zinc-800 dark:bg-zinc-800/40"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  {ticket.subject}
                </p>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide ${meta.color}`}
                >
                  <span aria-hidden="true">{meta.icon}</span>
                  {t(meta.labelKey)}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                {ticket.message}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2 text-[0.625rem] text-zinc-400 dark:text-zinc-500">
                <span className="capitalize">
                  {t(`support.cat.${ticket.category}`)}
                </span>
                <span>{timeAgo(ticket.created_at, t)}</span>
              </div>
              {ticket.admin_notes?.trim() ? (
                <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                  <span className="font-semibold">{t("support.teamNote")}</span>{" "}
                  {ticket.admin_notes}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
