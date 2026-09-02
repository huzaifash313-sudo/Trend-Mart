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
import {
  ChatShellHeader,
  FullScreenChatShell,
} from "@/components/chat/FullScreenChatShell";
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
    role === "merchant" ? selected?.customer_name || "Customer" : selected?.shop_name || "Shop";

  const threadSubtitle =
    role === "merchant" ? selected?.customer_phone || undefined : "Tap to shop profile";

  if (loading) {
    return (
      <FullScreenChatShell>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
      </FullScreenChatShell>
    );
  }

  /* Thread view — full screen like WhatsApp */
  if (selectedId && selected) {
    return (
      <FullScreenChatShell>
        <ChatThread
          conversationId={selected.id}
          viewerRole={role}
          title={threadTitle}
          subtitle={threadSubtitle}
          avatarUrl={role === "customer" ? selected.shop_logo : null}
          onBack={clearSelection}
          fullScreen
          headerAction={
            role === "merchant" && selected.order_id ? (
              <Link
                href="/dashboard/orders"
                className="rounded-lg bg-white/15 px-2.5 py-1 text-[0.65rem] font-semibold text-white"
              >
                Order
              </Link>
            ) : role === "customer" && selected.shop_id ? (
              <Link
                href={`/shop/${selected.shop_id}`}
                className="rounded-lg bg-white/15 px-2.5 py-1 text-[0.65rem] font-semibold text-white"
              >
                Shop
              </Link>
            ) : null
          }
        />
      </FullScreenChatShell>
    );
  }

  /* Inbox list — full screen */
  return (
    <FullScreenChatShell>
      <ChatShellHeader
        title={pageTitle}
        subtitle={pageSubtitle}
        backHref={backHref}
        backLabel={backLabel}
        gradient
      />

      {conversations.length > 0 && (
        <div className="shrink-0 border-b border-emerald-100 bg-white px-3 py-2.5 dark:border-emerald-900/30 dark:bg-zinc-950">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats…"
            className="w-full rounded-2xl border border-emerald-100 bg-emerald-50/50 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none dark:border-emerald-900/40 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white dark:bg-zinc-950">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <svg className="h-8 w-8 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">No chats yet</p>
            <p className="mt-1 max-w-xs text-xs text-zinc-500">{emptyHint}</p>
          </div>
        ) : (
          filtered.map((conv) => {
            const unread = unreadFor(conv);
            const label =
              role === "merchant" ? conv.customer_name || "Customer" : conv.shop_name || "Shop";
            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => selectConversation(conv.id)}
                className="flex w-full items-start gap-3 border-b border-zinc-100 px-4 py-3.5 text-left transition active:bg-emerald-50 dark:border-zinc-800/50 dark:active:bg-emerald-900/20"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-sm font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  {role === "customer" && conv.shop_logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={conv.shop_logo} alt="" className="h-full w-full object-cover" />
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
    </FullScreenChatShell>
  );
}
