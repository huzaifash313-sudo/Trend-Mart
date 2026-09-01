/* -------------------------------------------------------------------------- */
/*  Server-side order ownership checks (API routes)                            */
/* -------------------------------------------------------------------------- */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface OrderOwnershipRow {
  id: string;
  shop_id: string;
  customer_user_id: string | null;
  customer_phone: string;
  status: string;
  whatsapp_sent_at: string | null;
  whatsapp_message: string | null;
}

/** Load an order row if the signed-in user is the buyer, shop owner, or admin. */
export async function loadOrderForActor(
  admin: SupabaseClient,
  orderId: string,
  userId: string,
): Promise<OrderOwnershipRow | null> {
  const { data: orderRaw, error } = await admin
    .from("orders")
    .select("id, shop_id, customer_user_id, customer_phone, status, whatsapp_sent_at, whatsapp_message")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !orderRaw) return null;
  const order = orderRaw as unknown as OrderOwnershipRow;

  if (order.customer_user_id === userId) return order;

  const { data: isAdminRaw } = await admin.rpc("is_admin");
  if (isAdminRaw === true) return order;

  const { data: shopRaw } = await admin
    .from("shops")
    .select("owner_id")
    .eq("id", order.shop_id)
    .maybeSingle();
  const ownerId = (shopRaw as { owner_id?: string | null } | null)?.owner_id;
  if (ownerId === userId) return order;

  return null;
}

/** Buyer-only: must be the customer who placed the order. */
export async function loadOrderForCustomer(
  admin: SupabaseClient,
  orderId: string,
  userId: string,
): Promise<OrderOwnershipRow | null> {
  const row = await loadOrderForActor(admin, orderId, userId);
  if (!row || row.customer_user_id !== userId) return null;
  return row;
}
