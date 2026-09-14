"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Order detail                                                  */
/*  - Dine-in: /orders/[id]?table=<token>                                      */
/*  - Customer delivery/pickup: /orders/[id] (signed-in ownership)             */
/* -------------------------------------------------------------------------- */

import { Suspense, use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import DineInOrderTracker from "@/components/DineInOrderTracker";
import CustomerOrderDetail from "@/components/CustomerOrderDetail";

function OrderDetailInner({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const tableToken = searchParams.get("table") ?? "";

  if (tableToken) {
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

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-8 dark:bg-[color:var(--tm-surface)]">
      <CustomerOrderDetail orderId={id} />
    </div>
  );
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
          Loading…
        </div>
      }
    >
      <OrderDetailInner id={id} />
    </Suspense>
  );
}
