"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Admin Support Ticket Inbox                                    */
/*  Lets Super-Admins review and resolve platform-wide support tickets        */
/*  submitted via the public /support desk. Gated by middleware (/admin/*).   */
/* -------------------------------------------------------------------------- */

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { fetchSupportTickets, updateSupportTicket } from "@/services/supportService";
import type { SupportTicket, SupportTicketStatus } from "@/types";

const STATUS_OPTIONS: { value: SupportTicketStatus; label: string; color: string }[] = [
  { value: "open", label: "Open", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  { value: "in_progress", label: "In Progress", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { value: "resolved", label: "Resolved", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  { value: "closed", label: "Closed", color: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<"all" | SupportTicketStatus>("open");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await fetchSupportTickets();
      if (!cancelled && result.success) setTickets(result.data);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(
    () => (filterStatus === "all" ? tickets : tickets.filter((t) => t.status === filterStatus)),
    [tickets, filterStatus],
  );

  const handleStatusChange = useCallback(async (ticketId: string, status: SupportTicketStatus) => {
    setUpdatingId(ticketId);
    const result = await updateSupportTicket(ticketId, { status });
    if (result.success) {
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? result.data : t)));
    }
    setUpdatingId(null);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <Link href="/admin/dashboard" className="text-xs font-medium text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400">
            ← Back to Admin Dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">Support Inbox</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Platform-wide tickets submitted via the public Support Desk.</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          {(["all", "open", "in_progress", "resolved", "closed"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilterStatus(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                filterStatus === s
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800"
              }`}
            >
              {s === "all" ? "All" : STATUS_OPTIONS.find((o) => o.value === s)?.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-white dark:bg-zinc-900" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-2 text-3xl">📭</div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No tickets in this view.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((ticket) => {
              const statusMeta = STATUS_OPTIONS.find((o) => o.value === ticket.status);
              return (
                <div key={ticket.id} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide ${statusMeta?.color}`}>
                          {statusMeta?.label}
                        </span>
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[0.65rem] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                          {ticket.category}
                        </span>
                      </div>
                      <h3 className="mt-1.5 font-semibold text-zinc-900 dark:text-zinc-100">{ticket.subject}</h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {ticket.name} · {ticket.email}{ticket.phone ? ` · ${ticket.phone}` : ""} · {timeAgo(ticket.created_at)}
                      </p>
                    </div>
                    <select
                      value={ticket.status}
                      disabled={updatingId === ticket.id}
                      onChange={(e) => handleStatusChange(ticket.id, e.target.value as SupportTicketStatus)}
                      className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">{ticket.message}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
