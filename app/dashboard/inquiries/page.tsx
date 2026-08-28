"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fetchMyShop } from "@/services/shopService";
import {
  deleteInquiry,
  fetchInquiriesByShopId,
  type CustomerInquiry,
} from "@/services/inquiryService";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmProvider";

export default function MerchantInquiriesPage() {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const [loading, setLoading] = useState(true);
  const [shopId, setShopId] = useState<string | null>(null);
  const [shopName, setShopName] = useState("");
  const [rows, setRows] = useState<CustomerInquiry[]>([]);

  const reload = useCallback(async (id: string) => {
    const result = await fetchInquiriesByShopId(id);
    if (result.success) setRows(result.data);
    else addToast(result.error, "error");
  }, [addToast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          window.location.replace("/login?redirect=/dashboard/inquiries");
          return;
        }
        const shopResult = await fetchMyShop();
        if (!shopResult.success || !shopResult.data) {
          if (!cancelled) {
            addToast("Register a store first.", "info");
            window.location.replace("/account/become-merchant");
          }
          return;
        }
        if (cancelled) return;
        setShopId(shopResult.data.id);
        setShopName(shopResult.data.name);
        await reload(shopResult.data.id);
      } catch {
        if (!cancelled) addToast("Could not load inquiries.", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addToast, reload]);

  const handleDelete = async (id: string) => {
    if (!(await confirm("Delete this inquiry?"))) return;
    const result = await deleteInquiry(id);
    if (result.success) {
      setRows((prev) => prev.filter((r) => r.id !== id));
      addToast("Inquiry removed.", "info");
    } else {
      addToast(result.error, "error");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 pb-safe-nav">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            Customer messages
          </p>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            Inquiries — {shopName || "Your store"}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Questions from the storefront contact form. For paid orders, use{" "}
            <Link href="/dashboard/orders" className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
              Order Desk
            </Link>
            .
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
        >
          ← Dashboard
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="tm-panel rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">No inquiries yet</p>
          <p className="mt-1 text-xs text-zinc-500">
            When customers message your shop from the storefront, they appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <article
              key={row.id}
              className="tm-panel p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    {row.customer_name || "Customer"}
                  </h2>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {new Date(row.created_at).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(row.id)}
                  className="shrink-0 text-xs font-semibold text-red-600 hover:underline dark:text-red-400"
                >
                  Delete
                </button>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                {row.message}
              </p>
            </article>
          ))}
        </div>
      )}

      {shopId ? (
        <p className="text-center text-[0.65rem] text-zinc-400">Shop id: {shopId.slice(0, 8)}…</p>
      ) : null}
    </div>
  );
}
