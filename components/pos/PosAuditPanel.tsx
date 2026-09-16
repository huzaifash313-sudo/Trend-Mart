"use client";

/* -------------------------------------------------------------------------- */
/*  POS audit trail viewer (owner only).                                       */
/*                                                                              */
/*  Reads are governed by RLS — only the shop owner can select these rows, and  */
/*  nobody can insert or delete them from the client at all.                    */
/* -------------------------------------------------------------------------- */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatRupees } from "@/lib/formatters";
import { logError } from "@/services/errorService";

export interface PosAuditPanelProps {
  shopId: string;
}

interface AuditRow {
  id: string;
  staff_name: string | null;
  event_type: string;
  severity: string;
  order_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const EVENT_LABEL: Record<string, string> = {
  "sale.completed": "Sale",
  "sale.discount": "Discount given",
  "sale.price_override": "Price changed at counter",
  "sale.void": "Bill voided",
  "staff.login": "Shift started",
  "staff.created": "Staff added",
  "staff.pin_reset": "PIN reset",
  "staff.deactivated": "Staff removed",
};

const FILTERS = [
  { value: "all", label: "All activity" },
  { value: "money", label: "Discounts / price changes / voids" },
  { value: "staff", label: "Staff changes" },
] as const;

const MONEY_EVENTS = ["sale.discount", "sale.price_override", "sale.void"];

function describe(row: AuditRow): string {
  const m = row.metadata ?? {};
  switch (row.event_type) {
    case "sale.completed":
      return `${formatRupees(Number(m.total) || 0)} · ${Number(m.itemCount) || 0} item(s) · ${String(m.paymentMethod ?? "cash")}`;
    case "sale.discount":
      return `−${formatRupees(Number(m.discount) || 0)} off ${formatRupees(Number(m.subtotal) || 0)} (${Number(m.percentOfSubtotal) || 0}%)`;
    case "sale.price_override":
      return `${String(m.product ?? "Item")}: ${formatRupees(Number(m.catalogPrice) || 0)} → ${formatRupees(Number(m.chargedPrice) || 0)}`;
    case "sale.void":
      return `${formatRupees(Number(m.refunded) || 0)} refunded${m.reason ? ` · ${String(m.reason)}` : ""}`;
    case "staff.login":
      return `Role: ${String(m.role ?? "cashier")}`;
    case "staff.created":
      return `${String(m.staffName ?? "")} · ${String(m.role ?? "cashier")}`;
    case "staff.pin_reset":
    case "staff.deactivated":
      return String(m.staffName ?? "");
    default:
      return "";
  }
}

export default function PosAuditPanel({ shopId }: PosAuditPanelProps) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("pos_audit_logs")
        .select("id, staff_name, event_type, severity, order_id, metadata, created_at")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) {
        // Table arrives with 20260917_pos_audit_logs.sql — show a hint rather
        // than an error toast if the migration hasn't been applied yet.
        setUnavailable(true);
        setRows([]);
      } else {
        setUnavailable(false);
        setRows((data as AuditRow[]) ?? []);
      }
    } catch (err) {
      logError(err, { module: "PosAuditPanel.load", meta: { shopId } });
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === "money") return rows.filter((r) => MONEY_EVENTS.includes(r.event_type));
    if (filter === "staff") return rows.filter((r) => r.event_type.startsWith("staff."));
    return rows;
  }, [rows, filter]);

  return (
    <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Counter activity log</h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Kaun ne discount diya, price badli ya bill void kiya — sab yahan record hai.
            Staff ise na badal sakte hain na mita sakte hain.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-full border border-zinc-200 px-3 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
              filter === f.value
                ? "bg-emerald-600 text-white"
                : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {unavailable ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/25 dark:text-amber-200">
          Activity log abhi available nahi — <code>20260917_pos_audit_logs.sql</code> migration
          apply karein.
        </p>
      ) : loading ? (
        <p className="animate-pulse text-xs text-zinc-400">Loading activity…</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-zinc-500">Abhi koi activity record nahi hui.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-900/60">
              <tr>
                <th className="px-2 py-2 font-semibold">When</th>
                <th className="px-2 py-2 font-semibold">Who</th>
                <th className="px-2 py-2 font-semibold">What</th>
                <th className="px-2 py-2 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="whitespace-nowrap px-2 py-1.5 text-zinc-500">
                    {new Date(row.created_at).toLocaleString("en-PK", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-2 py-1.5 font-medium text-zinc-800 dark:text-zinc-100">
                    {row.staff_name || "—"}
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        row.severity === "critical"
                          ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                          : row.severity === "warning"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      {EVENT_LABEL[row.event_type] ?? row.event_type}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-zinc-600 dark:text-zinc-300">{describe(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
