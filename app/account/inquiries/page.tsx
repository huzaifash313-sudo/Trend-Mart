"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  fetchMyInquiries,
  type CustomerInquiry,
} from "@/services/inquiryService";
import { subscribeToMyInquiries } from "@/lib/supabase/realtime";
import { useToast } from "@/components/Toast";

export default function CustomerInquiriesPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CustomerInquiry[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchMyInquiries();
    if (result.success) setRows(result.data);
    else if (result.error) addToast(result.error, "error");
  }, [addToast]);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;

    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.replace("/login?redirect=/account/inquiries");
        return;
      }
      const uid = data.session.user.id;
      if (!cancelled) setUserId(uid);
      await load();
      if (!cancelled) setLoading(false);

      unsub = subscribeToMyInquiries(uid, (payload) => {
        const row = payload.new as CustomerInquiry | undefined;
        if (!row?.id) return;
        if (payload.eventType === "INSERT") {
          setRows((prev) => [row, ...prev.filter((r) => r.id !== row.id)]);
        } else {
          setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...row } : r)));
          if (row.merchant_reply) {
            addToast(`${row.shop_name ?? "Shop"} replied to your message`, "info");
          }
        }
      });
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [addToast, load]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-6 pb-safe-nav">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            Customer portal
          </p>
          <h1 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-50">My Messages</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Questions you sent to shops — replies appear here in real time.
          </p>
        </div>
        <Link
          href="/account"
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
        >
          ← Account
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">No messages yet</p>
          <p className="mt-1 text-xs text-zinc-500">
            Open any shop and tap <strong>Message seller</strong> to ask a question.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Browse shops
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <article key={row.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    {row.shop_name ?? "Shop"}
                  </h2>
                  <p className="text-xs text-zinc-500">
                    {new Date(row.created_at).toLocaleString()}
                  </p>
                </div>
                {row.merchant_reply ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    Replied
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    Awaiting reply
                  </span>
                )}
              </div>
              <div className="mt-3 rounded-xl bg-zinc-50 px-3 py-2.5 text-sm text-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-200">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-400">You</p>
                <p className="mt-1 whitespace-pre-wrap">{row.message}</p>
              </div>
              {row.merchant_reply ? (
                <div className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-100">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                    Shop reply
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{row.merchant_reply}</p>
                  {row.replied_at ? (
                    <p className="mt-1 text-[0.65rem] text-emerald-600/80 dark:text-emerald-400/80">
                      {new Date(row.replied_at).toLocaleString()}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {row.shop_id ? (
                <Link
                  href={`/shop/${row.shop_id}`}
                  className="mt-3 inline-block text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  View shop →
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      )}
      {userId ? null : null}
    </div>
  );
}
