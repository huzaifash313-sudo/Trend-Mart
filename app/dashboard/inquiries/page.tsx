"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

/** Pull a plausible PK mobile from free-text inquiry messages. */
function phoneFromMessage(message: string): string | null {
  const match = message.match(/(?:\+?92|0)?3\d{9}\b/);
  if (!match) return null;
  const digits = match[0].replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("3")) return `92${digits}`;
  if (digits.length === 11 && digits.startsWith("03")) return `92${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("92")) return digits;
  return null;
}

export default function MerchantInquiriesPage() {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const [loading, setLoading] = useState(true);
  const [shopName, setShopName] = useState("");
  const [rows, setRows] = useState<CustomerInquiry[]>([]);
  const [query, setQuery] = useState("");

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.customer_name} ${r.message}`.toLowerCase().includes(q),
    );
  }, [rows, query]);

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

  const copyMessage = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addToast("Message copied.", "success");
    } catch {
      addToast("Could not copy.", "error");
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
    <div className="tm-dashboard-page mx-auto max-w-3xl space-y-5 px-4 py-6 pb-safe-nav">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            Customer messages
          </p>
          <h1 className="tm-font-display text-xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
            Inquiries — {shopName || "Your store"}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Storefront questions. Paid orders stay in{" "}
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

      {rows.length > 0 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or message"
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      )}

      {filtered.length === 0 ? (
        <div className="tm-panel rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            {rows.length === 0 ? "No inquiries yet" : "No matches"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {rows.length === 0
              ? "When customers message your shop from the storefront, they appear here."
              : "Try a different search."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => {
            const phone = phoneFromMessage(row.message);
            return (
              <article key={row.id} className="tm-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {row.customer_name || "Customer"}
                    </h2>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {new Date(row.created_at).toLocaleString()}
                    </p>
                    {row.product_id ? (
                      <Link
                        href={`/p/${row.product_id}`}
                        className="mt-1 inline-block text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                      >
                        View related product →
                      </Link>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {phone ? (
                      <a
                        href={`https://wa.me/${phone}?text=${encodeURIComponent(`Salam ${row.customer_name || ""}! Regarding your message on TrendMart…`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        WhatsApp
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void copyMessage(row.message)}
                      className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(row.id)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm text-zinc-700 dark:text-zinc-300">
                  {row.message}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
