"use client";

/* -------------------------------------------------------------------------- */
/*  Owner-only staff management: add cashiers, set roles, reset PINs.          */
/* -------------------------------------------------------------------------- */

import { useCallback, useEffect, useState } from "react";
import type { PosStaff, PosStaffRole } from "@/services/posStaffService";
import {
  createPosStaff,
  listPosStaff,
  removePosStaff,
  updatePosStaff,
} from "@/services/posStaffService";

export interface PosStaffPanelProps {
  shopId: string;
  onToast?: (message: string, variant?: "success" | "error" | "info") => void;
  /** Lets the parent refresh gating once staff exist. */
  onChanged?: (staff: PosStaff[]) => void;
}

const fieldClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export default function PosStaffPanel({ shopId, onToast, onChanged }: PosStaffPanelProps) {
  const [staff, setStaff] = useState<PosStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<PosStaffRole>("cashier");
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPin, setResetPin] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await listPosStaff(shopId);
    setLoading(false);
    if (result.success) {
      setStaff(result.data);
      onChanged?.(result.data);
    } else {
      onToast?.(result.error, "error");
    }
  }, [shopId, onToast, onChanged]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleAdd() {
    if (!name.trim()) {
      onToast?.("Staff name likhein.", "error");
      return;
    }
    setSaving(true);
    const result = await createPosStaff({ shopId, name, pin, role });
    setSaving(false);
    if (result.success) {
      onToast?.(`${result.data.name} added.`, "success");
      setName("");
      setPin("");
      setRole("cashier");
      void refresh();
    } else {
      onToast?.(result.error, "error");
    }
  }

  async function handleResetPin(staffId: string) {
    setSaving(true);
    const result = await updatePosStaff({ shopId, staffId, pin: resetPin });
    setSaving(false);
    if (result.success) {
      onToast?.("PIN updated.", "success");
      setResetFor(null);
      setResetPin("");
    } else {
      onToast?.(result.error, "error");
    }
  }

  async function handleToggleRole(row: PosStaff) {
    const next: PosStaffRole = row.role === "manager" ? "cashier" : "manager";
    const result = await updatePosStaff({ shopId, staffId: row.id, role: next });
    if (result.success) {
      onToast?.(`${row.name} is now ${next}.`, "success");
      void refresh();
    } else {
      onToast?.(result.error, "error");
    }
  }

  async function handleRemove(row: PosStaff) {
    const result = row.is_active
      ? await removePosStaff(shopId, row.id)
      : await updatePosStaff({ shopId, staffId: row.id, isActive: true });
    if (result.success) {
      onToast?.(row.is_active ? `${row.name} removed.` : `${row.name} restored.`, "success");
      void refresh();
    } else {
      onToast?.(result.error, "error");
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 sm:p-4">
      <div>
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Counter staff</h3>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Har cashier ka apna PIN. Har sale, discount aur void us ke naam se record hoti hai.
          Cashier ko reports / profit nahi dikhte — sirf manager ko.
        </p>
      </div>

      {/* Add staff */}
      <div className="grid gap-2 rounded-xl border border-zinc-200 p-2.5 dark:border-zinc-700 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-zinc-500">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bilal"
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-zinc-500">PIN (4–8 digits)</span>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
            inputMode="numeric"
            placeholder="••••"
            className={`${fieldClass} tracking-[0.3em] sm:w-28`}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-zinc-500">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value === "manager" ? "manager" : "cashier")}
            className={`${fieldClass} sm:w-32`}
          >
            <option value="cashier">Cashier</option>
            <option value="manager">Manager</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={saving}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {/* Staff list */}
      {loading ? (
        <p className="animate-pulse text-xs text-zinc-400">Loading staff…</p>
      ) : staff.length === 0 ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/25 dark:text-amber-200">
          Abhi koi staff nahi. Jab tak koi staff add nahi hota, counter owner ke naam se
          chalta rahega — staff add karte hi PIN se shift start karna zaroori ho jayega.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {staff.map((row) => (
            <li key={row.id} className="py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p
                    className={`truncate text-sm font-semibold ${
                      row.is_active
                        ? "text-zinc-900 dark:text-zinc-100"
                        : "text-zinc-400 line-through"
                    }`}
                  >
                    {row.name}
                  </p>
                  <p className="text-[11px] uppercase tracking-wide text-zinc-400">{row.role}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleToggleRole(row)}
                    className="rounded-full border border-zinc-200 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Make {row.role === "manager" ? "cashier" : "manager"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setResetFor(resetFor === row.id ? null : row.id);
                      setResetPin("");
                    }}
                    className="rounded-full border border-zinc-200 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Reset PIN
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRemove(row)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      row.is_active
                        ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300"
                        : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
                    }`}
                  >
                    {row.is_active ? "Remove" : "Restore"}
                  </button>
                </div>
              </div>

              {resetFor === row.id ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    value={resetPin}
                    onChange={(e) => setResetPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    inputMode="numeric"
                    placeholder="New PIN"
                    className={`${fieldClass} w-32 tracking-[0.3em]`}
                  />
                  <button
                    type="button"
                    disabled={saving || resetPin.length < 4}
                    onClick={() => void handleResetPin(row.id)}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    Save PIN
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
