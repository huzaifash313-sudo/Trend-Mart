"use client";

/* -------------------------------------------------------------------------- */
/*  DineInOrderTracker — live status timeline for a QR-table order             */
/*                                                                             */
/*  Anonymous customers can't use Supabase realtime (orders RLS blocks them),  */
/*  so we poll the SECURITY DEFINER `track_dine_order` RPC every few seconds.  */
/*  The table token is the possession proof that scopes the result.            */
/* -------------------------------------------------------------------------- */

import { useEffect, useRef, useState, useCallback } from "react";
import { trackDineOrder, type DineTrackedOrder } from "@/services/dineInService";
import type { DineStatus } from "@/types";

const POLL_MS = 4000;

const STEP_ORDER: DineStatus[] = ["Pending", "Preparing", "Ready", "Served"];

function statusColor(status: DineStatus): string {
  switch (status) {
    case "Pending":
      return "bg-amber-500";
    case "Preparing":
      return "bg-blue-500";
    case "Ready":
      return "bg-violet-500";
    case "Served":
      return "bg-emerald-500";
    default:
      return "bg-zinc-400";
  }
}

function statusLabel(status: DineStatus | null): string {
  switch (status) {
    case "Pending":
      return "Order received";
    case "Preparing":
      return "Being prepared";
    case "Ready":
      return "Ready to serve";
    case "Served":
      return "Served";
    case "Cancelled":
      return "Cancelled";
    default:
      return "Order received";
  }
}

export default function DineInOrderTracker({
  orderId,
  tableToken,
}: {
  orderId: string;
  tableToken: string;
}) {
  const [order, setOrder] = useState<DineTrackedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const res = await trackDineOrder(orderId, tableToken);
    if (res.success) {
      if (res.data) setOrder(res.data);
      else setError("Order not found.");
    } else if (!error) {
      setError(res.error);
    }
  }, [orderId, tableToken, error]);

  useEffect(() => {
    void refresh();
    timer.current = setInterval(() => void refresh(), POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh]);

  const current = order?.dine_status ?? "Pending";
  const currentIndex = STEP_ORDER.indexOf(current as DineStatus);
  const isCancelled = current === "Cancelled";
  const isServed = current === "Served";

  return (
    <div className="w-full rounded-2xl border border-emerald-100 bg-white p-5 text-center shadow-sm dark:border-emerald-900/40 dark:bg-[color:var(--tm-surface)]">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
        <CheckIcon />
      </div>
      <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
        Order sent to the kitchen
      </h3>
      {order && (
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {order.table_code ? `${order.table_code} · ` : ""}
          {statusLabel(current)}
          {order.total_amount > 0 && (
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">
              {" "}
              — Rs. {Math.round(order.total_amount).toLocaleString()}
            </span>
          )}
        </p>
      )}

      {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

      {!isCancelled && (
        <ol className="mt-6 flex items-start justify-between">
          {STEP_ORDER.map((step, idx) => {
            const done = currentIndex >= idx;
            const active = currentIndex === idx && !isServed;
            return (
              <li key={step} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full items-center">
                  <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                      done ? statusColor(step) + " text-white" : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"
                    } ${active ? "ring-4 ring-emerald-200 dark:ring-emerald-900/40" : ""}`}
                  >
                    {done ? <StepCheckIcon /> : idx + 1}
                  </span>
                  <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
                </div>
                <span
                  className={`text-[11px] font-medium ${
                    done ? "text-zinc-800 dark:text-zinc-200" : "text-zinc-400 dark:text-zinc-500"
                  }`}
                >
                  {stepLabel(step)}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {isCancelled && (
        <p className="mt-4 rounded-xl bg-red-50 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          This order was cancelled. Please ask staff for help.
        </p>
      )}

      <p className="mt-5 text-[11px] text-zinc-400 dark:text-zinc-500">
        Keeping this page open — your order updates automatically.
      </p>
    </div>
  );
}

function stepLabel(step: DineStatus): string {
  switch (step) {
    case "Pending":
      return "Received";
    case "Preparing":
      return "Preparing";
    case "Ready":
      return "Ready";
    case "Served":
      return "Served";
    default:
      return step;
  }
}

function CheckIcon() {
  return (
    <svg className="h-7 w-7 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function StepCheckIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
