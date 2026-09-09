/* -------------------------------------------------------------------------- */
/*  POST /api/orders/[id]/confirm-whatsapp — merchant marks WA as received     */
/* -------------------------------------------------------------------------- */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidUUID } from "@/lib/sanitization";

export const runtime = "nodejs";

/**
 * Merchant confirms the order actually arrived on WhatsApp (or via call).
 * Sets whatsapp_sent_at so fulfilment can proceed. Customer cannot forge this
 * — only the shop owner may call this endpoint.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await context.params;
  if (!isValidUUID(orderId)) {
    return NextResponse.json({ success: false, error: "Invalid order id." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Sign in required." }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { success: false, error: "Service temporarily unavailable." },
      { status: 503 },
    );
  }

  const { data: orderRaw, error: orderErr } = await admin
    .from("orders")
    .select("id, shop_id, status, whatsapp_sent_at")
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr || !orderRaw) {
    return NextResponse.json({ success: false, error: "Order not found." }, { status: 404 });
  }

  const order = orderRaw as {
    id: string;
    shop_id: string;
    status: string;
    whatsapp_sent_at: string | null;
  };

  if (order.status === "Cancelled") {
    return NextResponse.json(
      { success: false, error: "Cancelled orders cannot be confirmed." },
      { status: 409 },
    );
  }

  const { data: shopRaw } = await admin
    .from("shops")
    .select("id, owner_id")
    .eq("id", order.shop_id)
    .maybeSingle();

  const shop = shopRaw as { id: string; owner_id: string } | null;
  if (!shop || shop.owner_id !== user.id) {
    return NextResponse.json({ success: false, error: "Not your shop's order." }, { status: 403 });
  }

  if (order.whatsapp_sent_at) {
    return NextResponse.json({
      success: true,
      whatsappSentAt: order.whatsapp_sent_at,
      alreadyConfirmed: true,
    });
  }

  const now = new Date().toISOString();
  const { data: updatedRaw, error: updateErr } = await admin
    .from("orders")
    .update({ whatsapp_sent_at: now, updated_at: now } as never)
    .eq("id", orderId)
    .select("id, whatsapp_sent_at")
    .maybeSingle();

  if (updateErr || !updatedRaw) {
    return NextResponse.json(
      { success: false, error: "Could not confirm WhatsApp receipt." },
      { status: 500 },
    );
  }

  const updated = updatedRaw as { id: string; whatsapp_sent_at: string | null };

  return NextResponse.json({
    success: true,
    whatsappSentAt: updated.whatsapp_sent_at,
    alreadyConfirmed: false,
  });
}
