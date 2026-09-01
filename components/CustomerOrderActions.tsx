"use client";

import { useState, useCallback } from "react";
import {
  cancelOrderAsCustomer,
  updateOrderWhatsApp,
} from "@/services/orderService";
import {
  buildMerchantOrderWhatsAppUrl,
  canCustomerCancelOrder,
  isAwaitingWhatsApp,
} from "@/lib/orderWhatsApp";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmProvider";
import type { Order } from "@/types";

interface CustomerOrderActionsProps {
  order: Pick<
    Order,
    "id" | "status" | "customer_user_id" | "whatsapp_sent_at" | "whatsapp_message"
  >;
  shopWhatsapp?: string | null;
  userId?: string | null;
  onUpdated?: (patch: Partial<Order>) => void;
  compact?: boolean;
}

function WhatsAppIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

export default function CustomerOrderActions({
  order,
  shopWhatsapp,
  userId,
  onUpdated,
  compact = false,
}: CustomerOrderActionsProps) {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const [busy, setBusy] = useState<"send" | "cancel" | null>(null);

  const awaiting = isAwaitingWhatsApp(order);
  const canCancel = canCustomerCancelOrder(order, userId);
  const canResend =
    order.status !== "Cancelled" &&
    !!order.whatsapp_message?.trim() &&
    !!shopWhatsapp;

  const handleSendWhatsApp = useCallback(async () => {
    const message = order.whatsapp_message?.trim();
    if (!message || !shopWhatsapp) {
      addToast("WhatsApp message is not available for this order.", "error");
      return;
    }
    const url = buildMerchantOrderWhatsAppUrl(shopWhatsapp, message);
    if (!url) {
      addToast("Shop WhatsApp number is missing.", "error");
      return;
    }

    setBusy("send");
    try {
      window.open(url, "_blank", "noopener,noreferrer");
      const result = await updateOrderWhatsApp(order.id, { message, sent: true });
      if (result.success) {
        onUpdated?.({
          whatsapp_sent_at: result.data.whatsappSentAt,
          whatsapp_message: result.data.whatsappMessage,
        });
        addToast("WhatsApp opened — send the message to confirm your order.", "success");
      }
    } finally {
      setBusy(null);
    }
  }, [addToast, onUpdated, order.id, order.whatsapp_message, shopWhatsapp]);

  const handleCancel = useCallback(async () => {
    if (
      !(await confirm(
        "Cancel this order? The shop will be notified and nothing will be prepared.",
      ))
    ) {
      return;
    }
    setBusy("cancel");
    try {
      const result = await cancelOrderAsCustomer(order.id);
      if (result.success) {
        onUpdated?.({ status: "Cancelled" });
        addToast("Order cancelled.", "success");
      } else {
        addToast(result.error ?? "Could not cancel.", "error");
      }
    } finally {
      setBusy(null);
    }
  }, [addToast, confirm, onUpdated, order.id]);

  if (order.status === "Cancelled") return null;
  if (!awaiting && !canResend && !canCancel) return null;

  const btnClass = compact
    ? "rounded-full px-3 py-1.5 text-xs font-semibold"
    : "rounded-full px-4 py-2 text-xs font-semibold";

  return (
    <div className={`flex flex-wrap gap-2 ${compact ? "" : "mt-3"}`}>
      {awaiting && (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[0.65rem] font-bold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          WhatsApp not sent yet
        </span>
      )}

      {canResend && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void handleSendWhatsApp()}
          className={`inline-flex items-center gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 ${btnClass}`}
        >
          <WhatsAppIcon />
          {awaiting ? "Send on WhatsApp" : "Send again on WhatsApp"}
        </button>
      )}

      {canCancel && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void handleCancel()}
          className={`border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20 ${btnClass}`}
        >
          {busy === "cancel" ? "Cancelling…" : "Cancel order"}
        </button>
      )}
    </div>
  );
}
