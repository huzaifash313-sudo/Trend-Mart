"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fetchMyShop } from "@/services/shopService";
import {
  deleteInquiry,
  fetchInquiriesByShopId,
  markInquiryRead,
  replyToInquiry,
  type CustomerInquiry,
} from "@/services/inquiryService";
import { subscribeToInquiries } from "@/lib/supabase/realtime";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmProvider";
import { toPkWhatsAppDigits } from "@/lib/phoneFormat";

function phoneFromRow(row: CustomerInquiry): string | null {
  const fromField = toPkWhatsAppDigits(row.customer_phone ?? "");
  if (fromField) return fromField;
  const match = row.message.match(/(?:\+?92|0)?3\d{9}\b/);
  if (!match) return null;
  return toPkWhatsAppDigits(match[0]);
}

function ReplyBox({
  inquiryId,
  onReplied,
}: {
  inquiryId: string;
  onReplied: (row: CustomerInquiry) => void;
}) {
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const result = await replyToInquiry(inquiryId, text);
    setBusy(false);
    if (result.success) {
      onReplied(result.data);
      setOpen(false);
      setText("");
      addToast("Reply sent — customer will see it in My Messages.", "success");
    } else {
      addToast(result.error, "error");
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
      >
        Reply in app
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <textarea
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type your reply…"
        className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={() => void submit()}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send reply"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-zinc-500">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function MerchantInquiriesPage() {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const [loading, setLoading] = useState(true);
  const [shopId, setShopId] = useState("");
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
    let unsub: (() => void) | undefined;

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

        unsub = subscribeToInquiries(
          shopResult.data.id,
          (payload) => {
            const row = payload.new as CustomerInquiry | undefined;
            if (!row?.id) return;
            setRows((prev) => [row, ...prev.filter((r) => r.id !== row.id)]);
            addToast("New customer message", "info");
          },
          (payload) => {
            const row = payload.new as CustomerInquiry | undefined;
            if (!row?.id) return;
            setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...row } : r)));
          },
        );
      } catch {
        if (!cancelled) addToast("Could not load inquiries.", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [addToast, reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.customer_name} ${r.customer_phone} ${r.message}`.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const unreadCount = rows.filter((r) => !r.is_read).length;

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

  const markRead = async (id: string) => {
    await markInquiryRead(id);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_read: true } : r)));
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
            {unreadCount > 0 ? (
              <span className="ml-2 rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white">
                {unreadCount} new
              </span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            In-app questions from customers. Paid orders stay in{" "}
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
          placeholder="Search name, phone or message"
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
              ? "When customers message your shop from the storefront, they appear here instantly."
              : "Try a different search."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => {
            const phone = phoneFromRow(row);
            return (
              <article
                key={row.id}
                className={`tm-panel p-4 ${!row.is_read ? "ring-2 ring-rose-200 dark:ring-rose-900/50" : ""}`}
                onMouseEnter={() => {
                  if (!row.is_read) void markRead(row.id);
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {row.customer_name || "Customer"}
                    </h2>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {new Date(row.created_at).toLocaleString()}
                      {row.customer_phone ? ` · ${row.customer_phone}` : ""}
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
                        href={`https://wa.me/${phone}?text=${encodeURIComponent(`Salam ${row.customer_name || ""}! Regarding your message on TrendsMart…`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        💬 WhatsApp
                      </a>
                    ) : null}
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
                {row.merchant_reply ? (
                  <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">
                    <strong>Your reply:</strong> {row.merchant_reply}
                  </p>
                ) : (
                  <ReplyBox
                    inquiryId={row.id}
                    onReplied={(updated) =>
                      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
                    }
                  />
                )}
              </article>
            );
          })}
        </div>
      )}
      {shopId ? null : null}
    </div>
  );
}
