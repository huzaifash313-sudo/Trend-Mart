"use client";

/* -------------------------------------------------------------------------- */
/*  Start-of-shift screen: pick your name, enter your PIN.                     */
/*                                                                              */
/*  The PIN is verified server-side (/api/pos/staff/login) — this component     */
/*  never sees or compares a stored PIN.                                       */
/* -------------------------------------------------------------------------- */

import { useState } from "react";
import Link from "next/link";
import type { PosStaff, ActiveStaff } from "@/services/posStaffService";
import { startStaffShift } from "@/services/posStaffService";

export interface PosShiftLoginProps {
  shopId: string;
  shopName: string;
  staff: PosStaff[];
  onStarted: (staff: ActiveStaff) => void;
}

const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;

export default function PosShiftLogin({
  shopId,
  shopName,
  staff,
  onStarted,
}: PosShiftLoginProps) {
  const [selected, setSelected] = useState<PosStaff | null>(
    staff.length === 1 ? staff[0] : null,
  );
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(nextPin = pin) {
    if (!selected || nextPin.length < 4 || busy) return;
    setBusy(true);
    setError("");
    const result = await startStaffShift({
      shopId,
      staffId: selected.id,
      pin: nextPin,
    });
    setBusy(false);
    if (result.success) {
      setPin("");
      onStarted(result.data);
    } else {
      setError(result.error);
      setPin("");
    }
  }

  function press(key: (typeof PAD_KEYS)[number]) {
    setError("");
    if (key === "clear") {
      setPin("");
      return;
    }
    if (key === "back") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    setPin((p) => {
      const next = (p + key).slice(0, 8);
      // 4 digits is the common case — submit as soon as it can be valid.
      if (next.length === 4) void submit(next);
      return next;
    });
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-zinc-50 px-4 py-8 text-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
        TrendsMart POS
      </p>
      <h1 className="mt-2 text-xl font-bold text-zinc-900 dark:text-zinc-50">{shopName}</h1>

      {!selected ? (
        <>
          <p className="mt-1 text-xs text-zinc-500">Who is at the counter?</p>
          <div className="mt-5 grid w-full max-w-sm grid-cols-2 gap-2">
            {staff.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSelected(s);
                  setPin("");
                  setError("");
                }}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-4 text-sm font-semibold text-zinc-800 hover:border-emerald-400 hover:bg-emerald-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-emerald-950/30"
              >
                <span className="block truncate">{s.name}</span>
                <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                  {s.role}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-xs text-zinc-500">
            Hi {selected.name} — enter your PIN
          </p>

          <div className="mt-5 flex items-center gap-2" aria-label="PIN entry">
            {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
              <span
                key={i}
                className={`h-3 w-3 rounded-full ${
                  i < pin.length
                    ? "bg-emerald-600 dark:bg-emerald-400"
                    : "bg-zinc-300 dark:bg-zinc-700"
                }`}
              />
            ))}
          </div>

          {error ? (
            <p className="mt-3 text-xs font-semibold text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-5 grid w-full max-w-[16rem] grid-cols-3 gap-2">
            {PAD_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                disabled={busy}
                onClick={() => press(key)}
                className={`h-14 rounded-xl text-lg font-bold transition-colors disabled:opacity-50 ${
                  key === "clear" || key === "back"
                    ? "bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-300"
                    : "bg-white text-zinc-900 shadow-sm hover:bg-emerald-50 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-emerald-950/30"
                }`}
              >
                {key === "clear" ? "C" : key === "back" ? "⌫" : key}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={busy || pin.length < 4}
            onClick={() => void submit()}
            className="mt-4 w-full max-w-[16rem] rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? "Checking…" : "Start shift"}
          </button>

          {staff.length > 1 ? (
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setPin("");
                setError("");
              }}
              className="mt-3 text-xs font-semibold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              ← Not {selected.name}?
            </button>
          ) : null}
        </>
      )}

      <Link href="/dashboard" className="mt-8 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
        Back to dashboard
      </Link>
    </div>
  );
}
