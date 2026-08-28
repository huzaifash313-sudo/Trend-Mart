"use client";

import {
  useState,
  useEffect,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import CustomSelect from "@/components/CustomSelect";
import {
  fetchAuditLogs,
  fetchAuditStats,
  fetchDistinctEventTypes,
  type AdminAuditLog,
  type AuditSeverity,
} from "@/services/auditService";

// ─── Icon Components ──────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
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

function ClockIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

// ─── Severity Badge ───────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: AuditSeverity }) {
  const map: Record<AuditSeverity, { label: string; color: string }> = {
    info: { label: "Info", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    warning: { label: "Warning", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    critical: { label: "Critical", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  };
  const info = map[severity] ?? map.info;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${info.color}`}>
      {info.label}
    </span>
  );
}

// ─── Audit Log Row ────────────────────────────────────────────────────────────

function AuditLogRow({ log }: { log: AdminAuditLog }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3.5 shadow-sm transition-all dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start gap-3">
        <SeverityBadge severity={log.severity} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {log.event_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </span>
            <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              {log.target_type}
            </span>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
            {log.description}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
            <span className="inline-flex items-center gap-1">
              <ClockIcon />
              {new Date(log.created_at).toLocaleString("en-PK", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
            {log.performed_by_email && (
              <span className="text-zinc-400 dark:text-zinc-500">
                by {log.performed_by_email}
              </span>
            )}
            {log.target_id && (
              <span className="font-mono text-zinc-400 dark:text-zinc-500" title={log.target_id}>
                ID: {log.target_id.slice(0, 8)}…
              </span>
            )}
          </div>

          {/* Expandable details */}
          {(log.old_value || log.new_value) && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-2 text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
            >
              {expanded ? "Hide details" : "View details"}
            </button>
          )}
          {expanded && (
            <div className="mt-2 space-y-2 rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-800/50">
              {log.old_value && (
                <div>
                  <p className="font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Previous Value:</p>
                  <pre className="whitespace-pre-wrap font-mono text-zinc-700 dark:text-zinc-300 overflow-x-auto">
                    {JSON.stringify(log.old_value, null, 2)}
                  </pre>
                </div>
              )}
              {log.new_value && (
                <div>
                  <p className="font-semibold text-zinc-500 dark:text-zinc-400 mb-1">New Value:</p>
                  <pre className="whitespace-pre-wrap font-mono text-zinc-700 dark:text-zinc-300 overflow-x-auto">
                    {JSON.stringify(log.new_value, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AuditLogsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { addToast } = useToast();

  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{
    total: number;
    info: number;
    warning: number;
    critical: number;
    todayCount: number;
  } | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<AuditSeverity | "all">("all");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("");
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const pageSize = 30;

  // ── Auth check ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const { data: userData } = await supabase.auth.getUser();
      if (!cancelled) {
        if (!userData.user) {
          router.replace("/auth");
          return;
        }
        // Verify admin role
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userData.user.id)
          .single();

        if (!cancelled) {
          if (roleData?.role !== "admin") {
            router.replace("/dashboard");
            return;
          }
          setIsAdmin(true);
          setAuthLoading(false);
        }
      }
    }
    init();
    return () => { cancelled = true; };
  }, [supabase, router]);

  // ── Load event types ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    async function load() {
      const result = await fetchDistinctEventTypes();
      if (!cancelled && result.success) setEventTypes(result.data);
    }
    load();
    return () => { cancelled = true; };
  }, [isAdmin]);

  // ── Load stats & logs ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    async function load() {
      setLoading(true);

      // Load stats
      const statsResult = await fetchAuditStats();
      if (cancelled) return;
      if (statsResult.success) setStats(statsResult.data);

      // Load logs with filters
      const logsResult = await fetchAuditLogs({
        page,
        pageSize,
        severity: severityFilter !== "all" ? severityFilter : undefined,
        eventType: eventTypeFilter || undefined,
        search: search || undefined,
      });

      if (cancelled) return;
      if (logsResult.success) {
        setLogs(logsResult.data.logs);
        setTotalPages(Math.max(1, Math.ceil(logsResult.data.total / pageSize)));
      } else {
        addToast(logsResult.error, "error");
      }

      if (!cancelled) setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [isAdmin, page, pageSize, severityFilter, eventTypeFilter, search, addToast]);

  // ── Search handler with debounce ──────────────────────────────────────────
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

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
      {/* Header — non-sticky on mobile (admin layout already has a sticky top
          nav there); sticky only on desktop where the sidebar is fixed. */}
      <header className="z-40 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90 lg:sticky lg:top-0">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/admin/dashboard")}
              className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              aria-label="Back to admin dashboard"
            >
              <ChevronLeftIcon />
            </button>
            <h1 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Platform Audit Logs
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {/* Stats Cards */}
        {stats && (
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-2xl font-bold text-zinc-800 dark:text-zinc-200">{stats.total}</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Total Events</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.info}</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Info</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.warning}</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Warnings</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.critical}</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Critical</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.todayCount}</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Today</p>
            </div>
          </section>
        )}

        {/* Filters Bar */}
        <section className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
              <SearchIcon />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search events"
              className="w-full rounded-xl border border-zinc-200 bg-white py-2 pl-9 pr-4 text-sm text-zinc-900 placeholder-zinc-300/50 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          {/* Severity filter */}
          <CustomSelect
            value={severityFilter}
            onChange={(val) => { setSeverityFilter(val as AuditSeverity | "all"); setPage(1); }}
            options={[
              { value: "all", label: "All Severity" },
              { value: "info", label: "Info" },
              { value: "warning", label: "Warning" },
              { value: "critical", label: "Critical" },
            ]}
            fullWidth={false}
          />

          {/* Event type filter */}
          <CustomSelect
            value={eventTypeFilter}
            onChange={(val) => { setEventTypeFilter(val); setPage(1); }}
            options={[
              { value: "", label: "All Event Types" },
              ...eventTypes.map((t) => ({
                value: t,
                label: t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
              })),
            ]}
            fullWidth={false}
          />
        </section>

        {/* Logs List */}
        <section>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="h-16 rounded bg-zinc-200 dark:bg-zinc-800" />
                </div>
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center dark:border-zinc-700 dark:bg-zinc-900">
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                No audit events found.
              </p>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                System events like store approvals, suspensions, and subscription modifications will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <AuditLogRow key={log.id} log={log} />
              ))}
            </div>
          )}
        </section>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Previous
            </button>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Next
            </button>
          </div>
        )}
      </main>
    </div>
  );
}