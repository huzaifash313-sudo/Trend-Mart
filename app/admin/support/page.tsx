"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Admin Support Ticket Inbox                                    */
/*  Lets Super-Admins review and resolve platform-wide support tickets        */
/*  submitted via the public /support desk. Gated by middleware (/admin/*).   */
/* -------------------------------------------------------------------------- */

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchSupportTickets, updateSupportTicket } from "@/services/supportService";
import { subscribeToSupportTickets } from "@/lib/supabase/realtime";
import { createClient } from "@/lib/supabase/client";
import type { SupportTicket, SupportTicketStatus } from "@/types";
import CustomSelect from "@/components/CustomSelect";

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
  const router = useRouter();
  const supabase = createClient();

  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<"all" | SupportTicketStatus>("open");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  // ── Client-side admin gate (same pattern as audit-logs) ──────────────────
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const { data: userData } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!userData.user) {
        router.replace("/auth");
        return;
      }
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .single();
      if (cancelled) return;
      if (roleData?.role !== "admin") {
        router.replace("/dashboard");
        return;
      }
      setIsAdmin(true);
      setAuthLoading(false);
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await fetchSupportTickets();
      if (!cancelled && result.success) setTickets(result.data);
      setLoading(false);
    }
    load();

    // Live feed — a new ticket (e.g. from the public support desk) appears
    // instantly in the inbox. RLS only broadcasts to admins.
    const unsub = subscribeToSupportTickets((payload) => {
      const row = payload.new;
      if (!row || !("id" in row)) return;
      const ticket: SupportTicket = {
        id: row.id,
        user_id: row.user_id,
        name: row.name,
        email: row.email,
        phone: row.phone ?? "",
        category: row.category as SupportTicket["category"],
        subject: row.subject,
        message: row.message,
        status: row.status as SupportTicketStatus,
        admin_notes:
          ((row as Record<string, unknown>).admin_notes as string | undefined) ?? "",
        created_at: row.created_at,
      };
      setTickets((prev) => {
        if (prev.some((t) => t.id === ticket.id)) return prev;
        return [ticket, ...prev].slice(0, 200);
      });
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [isAdmin, supabase]);

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

  const handleSaveNotes = useCallback(async (ticket: SupportTicket) => {
    const notes = (notesDraft[ticket.id] ?? ticket.admin_notes ?? "").trim();
    if (updatingId) return;
    setUpdatingId(ticket.id);
    const result = await updateSupportTicket(ticket.id, {
      admin_notes: notes,
    });
    if (result.success) {
      setTickets((prev) => prev.map((t) => (t.id === ticket.id ? result.data : t)));
    }
    setUpdatingId(null);
  }, [notesDraft, updatingId]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <Link href="/admin/dashboard" className="text-xs font-medium text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400">
            ← Back to Admin Dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">Support Inbox</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Platform-wide tickets submitted via the public Support Desk.</p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
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
                      <p className="break-words text-xs text-zinc-500 dark:text-zinc-400">
                        {ticket.name} · {ticket.email}{ticket.phone ? ` · ${ticket.phone}` : ""} · {timeAgo(ticket.created_at)}
                      </p>
                    </div>
                    <CustomSelect
                      value={ticket.status}
                      disabled={updatingId === ticket.id}
                      onChange={(val) => handleStatusChange(ticket.id, val as SupportTicketStatus)}
                      options={STATUS_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
                      size="sm"
                      fullWidth={false}
                    />
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">{ticket.message}</p>

                  {/* Admin reply / notes — visible to the customer on their
                      "My Requests" view when they check their ticket status. */}
                  {(ticket.admin_notes || notesDraft[ticket.id]) && (
                    <div className="mt-3 rounded-lg bg-emerald-50 p-3 dark:bg-emerald-900/10">
                      <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        Admin reply
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-200">
                        {notesDraft[ticket.id] ?? ticket.admin_notes}
                      </p>
                    </div>
                  )}

                  <div className="mt-3 flex flex-col gap-2">
                    <textarea
                      rows={2}
                      placeholder="Reply to the customer — saved as admin notes on this ticket…"
                      value={notesDraft[ticket.id] ?? ticket.admin_notes ?? ""}
                      onChange={(e) =>
                        setNotesDraft((d) => ({ ...d, [ticket.id]: e.target.value }))
                      }
                      className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleSaveNotes(ticket)}
                        disabled={updatingId === ticket.id}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {updatingId === ticket.id ? "Saving…" : "Save reply"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
