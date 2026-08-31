"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Dine-In Order Tracking (/orders/[id]?table=<token>)            */
/*                                                                             */
/*  Standalone live-status page for a QR table order. The table token must be  */
/*  present in the URL — it is the proof the viewer belongs to that table.     */
/* -------------------------------------------------------------------------- */

import { use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import DineInOrderTracker from "@/components/DineInOrderTracker";

export default function DineInOrderTrackingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const tableToken = searchParams.get("table") ?? "";

  if (!tableToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 dark:bg-[color:var(--tm-surface)]">
        <div className="max-w-sm rounded-2xl border border-zinc-100 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-[color:var(--tm-surface)]">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Order tracking link is incomplete
          </p>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Open this page from the link shown after you placed your order at the
            restaurant table.
          </p>
          <div className="mt-4">
            <Link href="/" className="text-xs font-semibold text-emerald-600 underline">
              Go to TrendsMart home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-8 dark:bg-[color:var(--tm-surface)]">
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <DineInOrderTracker orderId={id} tableToken={tableToken} />
        <div className="text-center">
          <Link href="/" className="text-xs font-semibold text-emerald-600 underline">
            Browse other shops on TrendsMart
          </Link>
        </div>
      </div>
    </div>
  );
}
