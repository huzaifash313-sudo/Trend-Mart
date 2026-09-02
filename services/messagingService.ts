/* -------------------------------------------------------------------------- */
/*  TrendsMart — In-App Chat / Messaging Service                               */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import { sanitizeLight, truncate } from "@/lib/sanitization";

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

export type MessageSenderRole = "customer" | "merchant";

export interface Conversation {
  id: string;
  shop_id: string;
  customer_user_id: string | null;
  customer_name: string;
  customer_phone: string;
  order_id: string | null;
  last_message_at: string;
  last_message_preview: string;
  merchant_unread_count: number;
  customer_unread_count: number;
  created_at: string;
  updated_at: string;
  /** Joined for customer portal */
  shop_name?: string;
  shop_logo?: string | null;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_role: MessageSenderRole;
  sender_user_id: string | null;
  body: string;
  is_deleted: boolean;
  created_at: string;
  read_at: string | null;
}

export interface StartConversationParams {
  shopId: string;
  customerName: string;
  customerPhone?: string;
  orderId?: string;
  initialMessage?: string;
}

export interface SendMessageParams {
  conversationId: string;
  body: string;
  senderRole: MessageSenderRole;
}

/**
 * Get existing conversation or create a new one for shop + signed-in customer.
 */
export async function getOrCreateConversation(
  params: StartConversationParams,
): Promise<ServiceResult<Conversation>> {
  const supabase = createClient();
  const customerName = truncate(sanitizeLight(params.customerName), 100);
  const customerPhone = truncate(
    (params.customerPhone ?? "").replace(/[^\d+\s-]/g, ""),
    30,
  );

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "Sign in to start a chat." };
    }

    const { data: existing } = await supabase
      .from("conversations")
      .select("*")
      .eq("shop_id", params.shopId)
      .eq("customer_user_id", user.id)
      .maybeSingle();

    if (existing) {
      const conv = existing as Conversation;
      if (params.initialMessage?.trim()) {
        const sent = await sendMessage({
          conversationId: conv.id,
          body: params.initialMessage,
          senderRole: "customer",
        });
        if (!sent.success) return sent;
      }
      return { success: true, data: conv };
    }

    const { data: created, error } = await supabase
      .from("conversations")
      .insert({
        shop_id: params.shopId,
        customer_user_id: user.id,
        customer_name: customerName || "Customer",
        customer_phone: customerPhone,
        order_id: params.orderId ?? null,
      })
      .select("*")
      .single();

    if (error) throw error;
    const conv = created as Conversation;

    if (params.initialMessage?.trim()) {
      const sent = await sendMessage({
        conversationId: conv.id,
        body: params.initialMessage,
        senderRole: "customer",
      });
      if (!sent.success) return sent;
    }

    return { success: true, data: conv };
  } catch (err) {
    logError(err, { module: "messagingService.getOrCreateConversation", meta: { shopId: params.shopId } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Merchant starts or opens a chat with a customer from an order.
 */
export async function getOrCreateConversationForOrder(
  shopId: string,
  order: {
    id: string;
    customer_user_id?: string | null;
    customer_name?: string | null;
    customer_phone?: string | null;
  },
  initialMessage?: string,
): Promise<ServiceResult<Conversation>> {
  const supabase = createClient();

  if (!order.customer_user_id) {
    return {
      success: false,
      error: "This customer has no in-app account — use WhatsApp instead.",
    };
  }

  try {
    const { data: existing } = await supabase
      .from("conversations")
      .select("*")
      .eq("shop_id", shopId)
      .eq("customer_user_id", order.customer_user_id)
      .maybeSingle();

    if (existing) {
      const conv = existing as Conversation;
      if (initialMessage?.trim()) {
        await sendMessage({
          conversationId: conv.id,
          body: initialMessage,
          senderRole: "merchant",
        });
      }
      if (!conv.order_id) {
        await supabase
          .from("conversations")
          .update({ order_id: order.id })
          .eq("id", conv.id);
      }
      return { success: true, data: conv };
    }

    const { data: created, error } = await supabase
      .from("conversations")
      .insert({
        shop_id: shopId,
        customer_user_id: order.customer_user_id,
        customer_name: truncate(sanitizeLight(order.customer_name ?? "Customer"), 100),
        customer_phone: truncate((order.customer_phone ?? "").replace(/[^\d+\s-]/g, ""), 30),
        order_id: order.id,
      })
      .select("*")
      .single();

    if (error) throw error;
    const conv = created as Conversation;

    if (initialMessage?.trim()) {
      await sendMessage({
        conversationId: conv.id,
        body: initialMessage,
        senderRole: "merchant",
      });
    }

    return { success: true, data: conv };
  } catch (err) {
    logError(err, { module: "messagingService.getOrCreateConversationForOrder" });
    return { success: false, error: toError(err) };
  }
}

export async function sendMessage(
  params: SendMessageParams,
): Promise<ServiceResult<ChatMessage>> {
  const supabase = createClient();
  const body = truncate(sanitizeLight(params.body), 2000);
  if (!body.trim()) {
    return { success: false, error: "Message cannot be empty." };
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("conversation_messages")
      .insert({
        conversation_id: params.conversationId,
        sender_role: params.senderRole,
        sender_user_id: user?.id ?? null,
        body: body.trim(),
      })
      .select("*")
      .single();

    if (error) throw error;
    const message = data as ChatMessage;
    notifyChatPush(params.conversationId, message.body);
    return { success: true, data: message };
  } catch (err) {
    logError(err, { module: "messagingService.sendMessage", meta: { conversationId: params.conversationId } });
    return { success: false, error: toError(err) };
  }
}

/** Fire-and-forget background push to the other party (app closed / background). */
function notifyChatPush(conversationId: string, preview: string): void {
  if (typeof window === "undefined") return;
  void fetch("/api/push/notify-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ conversationId, preview }),
  }).catch(() => undefined);
}

export async function fetchMerchantConversations(
  shopId: string,
): Promise<ServiceResult<Conversation[]>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("shop_id", shopId)
      .order("last_message_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    return { success: true, data: (data as Conversation[]) ?? [] };
  } catch (err) {
    logError(err, { module: "messagingService.fetchMerchantConversations", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}

export async function fetchMyConversations(): Promise<ServiceResult<Conversation[]>> {
  const supabase = createClient();
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "Sign in to view your chats." };
    }

    const { data, error } = await supabase
      .from("conversations")
      .select("*, shops(name, logo_url)")
      .eq("customer_user_id", user.id)
      .order("last_message_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const rows = ((data as Record<string, unknown>[]) ?? []).map((row) => {
      const shops = row.shops as { name?: string; logo_url?: string | null } | null;
      const { shops: _s, ...rest } = row;
      return {
        ...(rest as unknown as Conversation),
        shop_name: shops?.name ?? undefined,
        shop_logo: shops?.logo_url ?? null,
      };
    });

    return { success: true, data: rows };
  } catch (err) {
    logError(err, { module: "messagingService.fetchMyConversations" });
    return { success: false, error: toError(err) };
  }
}

export async function fetchMessages(
  conversationId: string,
): Promise<ServiceResult<ChatMessage[]>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("conversation_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true })
      .limit(500);

    if (error) throw error;
    return { success: true, data: (data as ChatMessage[]) ?? [] };
  } catch (err) {
    logError(err, { module: "messagingService.fetchMessages", meta: { conversationId } });
    return { success: false, error: toError(err) };
  }
}

export async function markConversationRead(
  conversationId: string,
  role: MessageSenderRole,
): Promise<ServiceResult<null>> {
  const supabase = createClient();
  const now = new Date().toISOString();

  try {
    const unreadField = role === "merchant" ? "merchant_unread_count" : "customer_unread_count";
    const senderToMark = role === "merchant" ? "customer" : "merchant";

    await supabase
      .from("conversations")
      .update({ [unreadField]: 0, updated_at: now })
      .eq("id", conversationId);

    await supabase
      .from("conversation_messages")
      .update({ read_at: now })
      .eq("conversation_id", conversationId)
      .eq("sender_role", senderToMark)
      .is("read_at", null);

    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "messagingService.markConversationRead", meta: { conversationId } });
    return { success: false, error: toError(err) };
  }
}

export async function deleteMessage(
  messageId: string,
): Promise<ServiceResult<null>> {
  const supabase = createClient();
  try {
    const { error } = await supabase
      .from("conversation_messages")
      .update({ is_deleted: true, body: "This message was deleted." })
      .eq("id", messageId);

    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "messagingService.deleteMessage", meta: { messageId } });
    return { success: false, error: toError(err) };
  }
}

export async function fetchConversationById(
  conversationId: string,
): Promise<ServiceResult<Conversation>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("conversations")
      .select("*, shops(name, logo_url)")
      .eq("id", conversationId)
      .single();

    if (error) throw error;
    const row = data as Record<string, unknown>;
    const shops = row.shops as { name?: string; logo_url?: string | null } | null;
    const { shops: _s, ...rest } = row;
    return {
      success: true,
      data: {
        ...(rest as unknown as Conversation),
        shop_name: shops?.name ?? undefined,
        shop_logo: shops?.logo_url ?? null,
      },
    };
  } catch (err) {
    logError(err, { module: "messagingService.fetchConversationById", meta: { conversationId } });
    return { success: false, error: toError(err) };
  }
}
