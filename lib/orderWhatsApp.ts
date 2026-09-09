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

/* -------------------------------------------------------------------------- */
/*  Verify-before-packing copy (single source of truth)                        */
/* -------------------------------------------------------------------------- */

/** Short badge shown next to an unverified order. */
export const VERIFY_BADGE_LABEL = "Confirm baaqi hai";

/** One-line notice for merchants on an unverified order. */
export const VERIFY_NOTICE_TEXT =
  "Customer ne abhi WhatsApp par confirm nahi kiya. Pack ya deliver karne se pehle aik dafa call ya WhatsApp par order confirm zaroor karein.";

/** Longer, calmer version for modals / bills / banners. */
export const VERIFY_NOTICE_LONG =
  "Ye order abhi tak customer ki taraf se WhatsApp par confirm nahi hua. Saaman pack ya rider ko dene se pehle customer se aik dafa confirm kar lein — is se fake ya ghalti se lagne wale orders ka nuqsan bach jata hai.";

/** Push / toast title used when a fresh unverified order lands. */
export const VERIFY_PUSH_TITLE = "Naya order — confirm karna zaroori hai";

/** Build wa.me link for merchant to verify with the customer. */
export function buildCustomerVerifyWhatsAppUrl(
  customerPhone: string,
  orderRef: string,
  customerName?: string,
  shopName?: string,
): string | null {
  const digits = toPkWhatsAppDigits(customerPhone);
  if (!digits) return null;
  const ref = orderRef.slice(0, 8).toUpperCase();
  const name = customerName?.trim();
  const shop = shopName?.trim();
  const text = [
    `Assalam-o-Alaikum${name ? ` ${name}` : ""}!`,
    ``,
    `${shop ? `${shop} se ` : ""}TrendsMart par aap ka order *${ref}* mila hai.`,
    `Pack karne se pehle aik dafa confirm karna chahte hain:`,
    ``,
    `✅ Order confirm hai? — bas "Haan" likh dein`,
    `❌ Aap ne place nahi kiya? — "Nahi" likh dein, hum cancel kar denge`,
    ``,
    `Shukriya!`,
  ].join("\n");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Build wa.me link for merchant to send a status update to the customer. */
export function buildCustomerStatusWhatsAppUrl(
  customerPhone: string,
  orderRef: string,
  statusLabel: string,
  customerName?: string,
  shopName?: string,
): string | null {
  const digits = toPkWhatsAppDigits(customerPhone);
  if (!digits) return null;
  const ref = orderRef.slice(0, 8).toUpperCase();
  const name = customerName?.trim();
  const text = [
    `Assalam-o-Alaikum${name ? ` ${name}` : ""}!`,
    ``,
    `Aap ka TrendsMart order *${ref}* ab *${statusLabel}* hai.`,
    shopName?.trim() ? `— ${shopName.trim()}` : "",
    ``,
    `Koi bhi sawal ho to yahin reply kar dein. Shukriya!`,
  ]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Google Maps link for the delivery pin stored on the order, if any. */
export function buildOrderMapsUrl(
  order: Pick<Order, "customer_lat" | "customer_lng">,
): string | null {
  const lat = order.customer_lat;
  const lng = order.customer_lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/**
 * Short note about how trustworthy the stored pin is, or null when the pin is
 * precise enough that saying anything would just be noise.
 */
export function orderPinAccuracyNote(
  order: Pick<Order, "customer_location_accuracy_m" | "customer_location_source">,
): string | null {
  if (order.customer_location_source === "pin") {
    return "Pin customer ne khud map par lagaya hai.";
  }
  const accuracy = order.customer_location_accuracy_m;
  if (typeof accuracy !== "number" || !Number.isFinite(accuracy)) return null;
  if (accuracy <= 150) return null;
  return `Pin taqreeban ±${Math.round(accuracy)} m tak sahi hai — pahunchne se pehle customer se address confirm kar lein.`;
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
