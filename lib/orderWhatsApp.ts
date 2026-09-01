/* -------------------------------------------------------------------------- */
/*  TrendsMart — WhatsApp order hand-off helpers                               */
/* -------------------------------------------------------------------------- */

import type { Order } from "@/types";
import { toPkWhatsAppDigits } from "@/lib/phoneFormat";

/** True when the customer has not yet confirmed the WhatsApp hand-off. */
export function isAwaitingWhatsApp(
  order: Pick<Order, "whatsapp_sent_at" | "status">,
): boolean {
  if (order.status === "Cancelled" || order.status === "Delivered") return false;
  return !order.whatsapp_sent_at;
}

/** Build wa.me link to send the stored order message to the merchant. */
export function buildMerchantOrderWhatsAppUrl(
  merchantPhone: string,
  message: string,
): string | null {
  const digits = toPkWhatsAppDigits(merchantPhone);
  if (!digits || !message.trim()) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message.trim())}`;
}

/** Build wa.me link for merchant to verify with the customer. */
export function buildCustomerVerifyWhatsAppUrl(
  customerPhone: string,
  orderRef: string,
  customerName?: string,
): string | null {
  const digits = toPkWhatsAppDigits(customerPhone);
  if (!digits) return null;
  const ref = orderRef.slice(0, 8).toUpperCase();
  const name = customerName?.trim() || "there";
  const text =
    `Salam ${name}! Main ${ref} ke TrendsMart order ke baare mein confirm karna chahta/chahti hoon. ` +
    `Kya aap ne ye order place kiya hai? Agar nahi, toh ignore kar dein. Shukriya!`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Customer can cancel while the shop has not started processing. */
export function canCustomerCancelOrder(
  order: Pick<Order, "status" | "customer_user_id">,
  userId?: string | null,
): boolean {
  if (order.status !== "Pending") return false;
  if (!userId) return false;
  return order.customer_user_id === userId;
}
