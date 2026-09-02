"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  fetchMerchantConversations,
  fetchMyConversations,
  type Conversation,
  type MessageSenderRole,
} from "@/services/messagingService";
import {
  subscribeToShopConversations,
  subscribeToMyConversations,
} from "@/lib/supabase/realtime";
import ChatThread from "@/components/chat/ChatThread";
import { useToast } from "@/components/Toast";

function formatPreviewTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

interface ChatInboxProps {
  role: MessageSenderRole;
  shopId?: string;
  userId?: string;
  backHref: string;
  backLabel: string;
  pageTitle: string;
  pageSubtitle: string;
  emptyHint: string;
}

export default function ChatInbox({
  role,
  shopId,
  userId,
  backHref,
  backLabel,
  pageTitle,
  pageSubtitle,
  emptyHint,
}: ChatInboxProps) {
  const { addToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("c");

  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    if (role === "merchant" && shopId) {
      const result = await fetchMerchantConversations(shopId);
      if (result.success) setConversations(result.data);
      else addToast(result.error, "error");
    } else {
      const result = await fetchMyConversations();
      if (result.success) setConversations(result.data);
      else addToast(result.error, "error");
    }
    setLoading(false);
  }, [addToast, role, shopId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (role === "merchant" && shopId) {
      return subscribeToShopConversations(shopId, (payload) => {
        const row = payload.new as Conversation | undefined;
        if (!row?.id) return;
        if (payload.eventType === "DELETE") {
          setConversations((prev) => prev.filter((c) => c.id !== (payload.old as Conversation).id));
          return;
        }
        setConversations((prev) => {
          const filtered = prev.filter((c) => c.id !== row.id);
          return [row, ...filtered].sort(
            (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime(),
          );
        });
      });
    }
    if (role === "customer" && userId) {
      return subscribeToMyConversations(userId, (payload) => {
        const row = payload.new as Conversation | undefined;
        if (!row?.id) return;
        setConversations((prev) => {
          const filtered = prev.filter((c) => c.id !== row.id);
          return [row, ...filtered].sort(
            (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime(),
          );
        });
      });
    }
    return undefined;
  }, [role, shopId, userId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const label = role === "merchant" ? c.customer_name : (c.shop_name ?? "");
      return `${label} ${c.customer_phone} ${c.last_message_preview}`.toLowerCase().includes(q);
    });
  }, [conversations, query, role]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const selectConversation = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("c", id);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const clearSelection = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("c");
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "?", { scroll: false });
  };

  const unreadFor = (c: Conversation) =>
    role === "merchant" ? c.merchant_unread_count : c.customer_unread_count;

  const threadTitle =
    role === "merchant"
      ? selected?.customer_name || "Customer"
      : selected?.shop_name || "Shop";

  const threadSubtitle =
    role === "merchant"
      ? selected?.customer_phone || undefined
      : undefined;

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 pb-safe-nav">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            {role === "merchant" ? "Merchant portal" : "Customer portal"}
          </p>
          <h1 className="tm-font-display text-xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
            {pageTitle}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{pageSubtitle}</p>
        </div>
        <Link
          href={backHref}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
        >
          {backLabel}
        </Link>
      </div>

      <div className="flex h-[calc(100dvh-12rem)] min-h-[420px] overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
        {/* Conversation list */}
        <aside
          className={`flex w-full shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 md:w-80 lg:w-96 ${
            selectedId ? "hidden md:flex" : "flex"
          }`}
        >
          {conversations.length > 0 && (
            <div className="border-b border-zinc-100 p-3 dark:border-zinc-800">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search chats…"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">No chats yet</p>
                <p className="mt-1 text-xs text-zinc-500">{emptyHint}</p>
              </div>
            ) : (
              filtered.map((conv) => {
                const unread = unreadFor(conv);
                const isActive = conv.id === selectedId;
                const label =
                  role === "merchant" ? conv.customer_name || "Customer" : conv.shop_name || "Shop";
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => selectConversation(conv.id)}
                    className={`flex w-full items-start gap-3 border-b border-zinc-50 px-4 py-3 text-left transition hover:bg-zinc-50 dark:border-zinc-800/50 dark:hover:bg-zinc-800/50 ${
                      isActive ? "bg-emerald-50 dark:bg-emerald-900/20" : ""
                    }`}
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      {role === "customer" && conv.shop_logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={conv.shop_logo} alt="" className="h-full w-full rounded-full object-cover" />
                      ) : (
                        label.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {label}
                        </span>
                        <span className="shrink-0 text-[0.65rem] text-zinc-400">
                          {formatPreviewTime(conv.last_message_at)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                          {conv.last_message_preview || "No messages"}
                        </p>
                        {unread > 0 ? (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[0.65rem] font-bold text-white">
                            {unread > 9 ? "9+" : unread}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Chat thread */}
        <main
          className={`min-w-0 flex-1 ${!selectedId ? "hidden md:flex" : "flex"} flex-col`}
        >
          {selected ? (
            <ChatThread
              conversationId={selected.id}
              viewerRole={role}
              title={threadTitle}
              subtitle={threadSubtitle}
              avatarUrl={role === "customer" ? selected.shop_logo : null}
              onBack={clearSelection}
              headerAction={
                role === "merchant" && selected.order_id ? (
                  <Link
                    href="/dashboard/orders"
                    className="rounded-lg border border-zinc-200 px-2 py-1 text-[0.65rem] font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                  >
                    Order
                  </Link>
                ) : role === "customer" && selected.shop_id ? (
                  <Link
                    href={`/shop/${selected.shop_id}`}
                    className="rounded-lg border border-zinc-200 px-2 py-1 text-[0.65rem] font-semibold text-emerald-600 dark:border-zinc-700 dark:text-emerald-400"
                  >
                    Shop
                  </Link>
                ) : null
              }
            />
          ) : (
            <div className="hidden flex-1 flex-col items-center justify-center p-8 text-center md:flex">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <svg className="h-8 w-8 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                Select a conversation
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Your messages appear here in real time — like Daraz or Foodpanda chat.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
