"use client";

import {
  useState,
  useEffect,
  useCallback,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Shop } from "@/types";
import { useToast } from "@/components/Toast";
import {
  fetchLeadsByShopId,
  markLeadConverted,
  updateLeadNotes,
  deleteLead,
  fetchLeadStats,
  type Lead,
} from "@/services/leadsService";

// ─── Icon Components ──────────────────────────────────────────────────────────

function PhoneIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

// ─── Source Badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: Lead["source"] }) {
  const map: Record<string, { label: string; color: string }> = {
    whatsapp: { label: "WhatsApp", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    inquiry_form: { label: "Form", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    booking_button: { label: "Booking", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  };
  const info = map[source] ?? { label: source, color: "bg-zinc-100 text-zinc-700" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${info.color}`}>
      {info.label}
    </span>
  );
}

// ─── Lead Row Component ───────────────────────────────────────────────────────

function LeadRow({
  lead,
  onMarkConverted,
  onSaveNotes,
  onDelete,
  saving,
  deleting,
}: {
  lead: Lead;
  onMarkConverted: (id: string) => void;
  onSaveNotes: (id: string, notes: string) => void;
  onDelete: (id: string) => void;
  saving: boolean;
  deleting: boolean;
}) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(lead.notes ?? "");

  const handleSaveNotes = () => {
    onSaveNotes(lead.id, notesDraft);
    setEditingNotes(false);
  };

  return (
    <div
      className={`rounded-xl border bg-white px-4 py-3.5 shadow-sm transition-all hover:shadow-md dark:bg-zinc-900 ${
        lead.is_converted
          ? "border-zinc-200 opacity-70 dark:border-zinc-700"
          : "border-emerald-200 dark:border-emerald-800"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Status indicator */}
        <div className="mt-1 shrink-0">
          {lead.is_converted ? (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
              <CheckCircleIcon />
            </span>
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
              <ChatIcon />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {/* Header row */}
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {lead.customer_name || "Unknown Customer"}
            </span>
            <SourceBadge source={lead.source} />
            {lead.is_converted && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">Followed up</span>
            )}
          </div>

          {/* Phone */}
          {lead.customer_phone && (
            <p className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 mb-1">
              <PhoneIcon />
              <a
                href={`https://wa.me/${lead.customer_phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-emerald-600 dark:hover:text-emerald-400 underline underline-offset-2"
              >
                {lead.customer_phone}
              </a>
            </p>
          )}

          {/* Service / Product Context */}
          {lead.service_context && (
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-1">
              📋 {lead.service_context}
            </p>
          )}

          {/* Timestamp */}
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-2">
            {new Date(lead.created_at).toLocaleDateString("en-PK", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>

          {/* Notes section */}
          {editingNotes ? (
            <div className="flex items-start gap-2 mt-2">
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Add follow-up notes..."
                rows={2}
                className="flex-1 min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  disabled={saving}
                  className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingNotes(false); setNotesDraft(lead.notes ?? ""); }}
                  className="rounded-lg px-2.5 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : lead.notes ? (
            <p className="text-xs italic text-zinc-500 dark:text-zinc-400 mt-1">
              💬 {lead.notes}
            </p>
          ) : null}
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 flex-col gap-1">
          {!lead.is_converted && (
            <button
              type="button"
              onClick={() => onMarkConverted(lead.id)}
              disabled={saving}
              className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
              title="Mark as followed up"
            >
              ✓ Done
            </button>
          )}
          <button
            type="button"
            onClick={() => { setEditingNotes(true); setNotesDraft(lead.notes ?? ""); }}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            title="Add notes"
          >
            ✎ Notes
          </button>
          <button
            type="button"
            onClick={() => onDelete(lead.id)}
            disabled={deleting}
            className="rounded-lg px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
            title="Delete"
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { addToast } = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showConverted, setShowConverted] = useState(true);

  const [stats, setStats] = useState<{
    total: number;
    unconverted: number;
    converted: number;
    todayCount: number;
  } | null>(null);

  // ── Auth check ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const { data } = await supabase.auth.getUser();
      if (!cancelled) {
        if (!data.user) {
          router.replace("/auth");
        } else {
          setUserId(data.user.id);
        }
        setAuthLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [supabase.auth, router]);

  // ── Load shop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function loadShop() {
      const { data, error } = await supabase
        .from("shops")
        .select("*")
        .eq("owner_id", userId)
        .maybeSingle();
      if (!cancelled && !error && data) {
        setShop(data as Shop);
      }
    }
    loadShop();
    return () => { cancelled = true; };
  }, [userId, supabase]);

  // ── Load stats & leads ────────────────────────────────────────────────────
  useEffect(() => {
    if (!shop) return;
    let cancelled = false;

    async function loadData() {
      // Load leads
      setLoading(true);
      const leadsResult = await fetchLeadsByShopId(shop!.id, {
        onlyUnconverted: !showConverted,
        pageSize: 200,
      });
      if (cancelled) return;
      if (leadsResult.success) setLeads(leadsResult.data.leads);
      setLoading(false);

      // Load stats
      const statsResult = await fetchLeadStats(shop!.id);
      if (!cancelled && statsResult.success) setStats(statsResult.data);
    }

    loadData();
    return () => { cancelled = true; };
  }, [shop, showConverted]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleMarkConverted = useCallback(async (leadId: string) => {
    setSaving(true);
    const result = await markLeadConverted(leadId);
    if (result.success) {
      setLeads((prev) => prev.map((l) => (l.id === leadId ? result.data : l)));
      addToast("Lead marked as followed up ✓", "success");
      // Refresh stats
      if (shop) {
        const sr = await fetchLeadStats(shop.id);
        if (sr.success) setStats(sr.data);
      }
    } else {
      addToast(result.error, "error");
    }
    setSaving(false);
  }, [addToast, shop]);

  const handleSaveNotes = useCallback(async (leadId: string, notes: string) => {
    setSaving(true);
    const result = await updateLeadNotes(leadId, notes);
    if (result.success) {
      setLeads((prev) => prev.map((l) => (l.id === leadId ? result.data : l)));
      addToast("Notes saved!", "success");
    } else {
      addToast(result.error, "error");
    }
    setSaving(false);
  }, [addToast]);

  const handleDelete = useCallback(async (leadId: string) => {
    if (!confirm("Delete this lead permanently?")) return;
    setDeleting(true);
    const result = await deleteLead(leadId);
    if (result.success) {
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
      addToast("Lead deleted.", "info");
      if (shop) {
        const sr = await fetchLeadStats(shop.id);
        if (sr.success) setStats(sr.data);
      }
    } else {
      addToast(result.error, "error");
    }
    setDeleting(false);
  }, [addToast, shop]);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              aria-label="Back to dashboard"
            >
              <ChevronLeftIcon />
            </button>
            <h1 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Customer Leads
            </h1>
          </div>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            {shop?.name}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {/* Stats Cards */}
        {stats && (
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {stats.total}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Total Leads</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center shadow-sm dark:border-amber-800 dark:bg-amber-900/20">
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {stats.unconverted}
              </p>
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                <ChatIcon />
                <span className="ml-1">Pending</span>
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {stats.converted}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                <CheckCircleIcon />
                <span className="ml-1">Converted</span>
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {stats.todayCount}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Today</p>
            </div>
          </section>
        )}

        {/* Filter Toggle */}
        <section className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowConverted(true)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              showConverted
                ? "bg-emerald-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            }`}
          >
            All Leads
          </button>
          <button
            type="button"
            onClick={() => setShowConverted(false)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              !showConverted
                ? "bg-amber-500 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            }`}
          >
            Pending Only
          </button>
          <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
            {leads.length} {showConverted ? "leads" : "pending"}
          </span>
        </section>

        {/* Leads List */}
        <section>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="h-14 rounded bg-zinc-200 dark:bg-zinc-800" />
                </div>
              ))}
            </div>
          ) : leads.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white py-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
              <div className="mb-2 flex justify-center">
                <svg className="h-10 w-10 text-zinc-300 dark:text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                {showConverted ? "No leads yet." : "No pending leads — great job!"}
              </p>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                Customer WhatsApp clicks and inquiry form submissions will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {leads.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  onMarkConverted={handleMarkConverted}
                  onSaveNotes={handleSaveNotes}
                  onDelete={handleDelete}
                  saving={saving}
                  deleting={deleting}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}