"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteMessage,
  fetchMessages,
  markConversationRead,
  sendMessage,
  type ChatMessage,
  type MessageSenderRole,
} from "@/services/messagingService";
import { subscribeToConversationMessages } from "@/lib/supabase/realtime";
import { useToast } from "@/components/Toast";

function SendIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface ChatThreadProps {
  conversationId: string;
  viewerRole: MessageSenderRole;
  title: string;
  subtitle?: string;
  avatarUrl?: string | null;
  onBack?: () => void;
  headerAction?: React.ReactNode;
}

export default function ChatThread({
  conversationId,
  viewerRole,
  title,
  subtitle,
  avatarUrl,
  onBack,
  headerAction,
}: ChatThreadProps) {
  const { addToast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const loadMessages = useCallback(async () => {
    const result = await fetchMessages(conversationId);
    if (result.success) {
      setMessages(result.data);
      void markConversationRead(conversationId, viewerRole);
    } else {
      addToast(result.error, "error");
    }
    setLoading(false);
  }, [addToast, conversationId, viewerRole]);

  useEffect(() => {
    setLoading(true);
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const unsub = subscribeToConversationMessages(
      conversationId,
      (payload) => {
        const row = payload.new as ChatMessage | undefined;
        if (!row?.id) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev;
          return [...prev, row];
        });
        void markConversationRead(conversationId, viewerRole);
      },
      (payload) => {
        const row = payload.new as ChatMessage | undefined;
        if (!row?.id) return;
        setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)));
      },
    );
    return unsub;
  }, [conversationId, viewerRole]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const result = await sendMessage({
      conversationId,
      body,
      senderRole: viewerRole,
    });
    setSending(false);
    if (result.success) {
      setText("");
      setMessages((prev) => {
        if (prev.some((m) => m.id === result.data.id)) return prev;
        return [...prev, result.data];
      });
      inputRef.current?.focus();
    } else {
      addToast(result.error, "error");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleDelete = async (messageId: string) => {
    const result = await deleteMessage(messageId);
    if (result.success) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, is_deleted: true, body: "This message was deleted." } : m,
        ),
      );
    } else {
      addToast(result.error, "error");
    }
  };

  const isOwn = (msg: ChatMessage) => msg.sender_role === viewerRole;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 lg:hidden"
            aria-label="Back to conversations"
          >
            <BackIcon />
          </button>
        ) : null}
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            {title.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">{title}</h2>
          {subtitle ? (
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
          ) : null}
        </div>
        {headerAction}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">No messages yet</p>
            <p className="mt-1 text-xs text-zinc-400">Say hello to start the conversation</p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((msg) => {
              const own = isOwn(msg);
              return (
                <div
                  key={msg.id}
                  className={`group flex ${own ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`relative max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm sm:max-w-[75%] ${
                      own
                        ? "rounded-br-md bg-emerald-600 text-white"
                        : "rounded-bl-md bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                    <div
                      className={`mt-1 flex items-center gap-1.5 text-[0.65rem] ${
                        own ? "text-emerald-100" : "text-zinc-400"
                      }`}
                    >
                      <span>{formatTime(msg.created_at)}</span>
                      {own && msg.read_at ? <span>· Seen</span> : null}
                    </div>
                    {own && !msg.is_deleted ? (
                      <button
                        type="button"
                        onClick={() => void handleDelete(msg.id)}
                        className="absolute -left-8 top-1/2 hidden -translate-y-1/2 rounded p-1 text-xs text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:text-red-500 sm:block"
                        title="Delete message"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-zinc-100 p-3 dark:border-zinc-800">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <button
            type="button"
            disabled={sending || !text.trim()}
            onClick={() => void handleSend()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:opacity-40"
            aria-label="Send message"
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
