/* -------------------------------------------------------------------------- */
/*  POST /api/orders/[id]/cancel — customer cancels a Pending order            */
/* -------------------------------------------------------------------------- */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadOrderForCustomer } from "@/lib/orderOwnership";
import { isValidUUID } from "@/lib/sanitization";
import { refundCouponUsage } from "@/lib/couponUsage";

export const runtime = "nodejs";

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

  const order = await loadOrderForCustomer(admin, orderId, user.id);
  if (!order) {
    return NextResponse.json({ success: false, error: "Order not found." }, { status: 404 });
  }
  if (order.status !== "Pending") {
    return NextResponse.json(
      {
        success: false,
        error: "Only pending orders can be cancelled. Contact the shop if it is already being prepared.",
      },
      { status: 409 },
    );
  }

  // Fetch coupon before cancel so we can refund usage.
  const { data: fullRaw } = await admin
    .from("orders")
    .select("coupon_code, shop_id, status")
    .eq("id", orderId)
    .maybeSingle();
  const full = fullRaw as {
    coupon_code?: string | null;
    shop_id?: string;
    status?: string;
  } | null;

  // Atomic-ish: only cancel if still Pending (closes TOCTOU with merchant status change).
  const { data: updatedRaw, error: updateErr } = await admin
    .from("orders")
    .update({
      status: "Cancelled",
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", orderId)
    .eq("status", "Pending")
    .select("id, status, updated_at")
    .maybeSingle();

  if (updateErr) {
    return NextResponse.json(
      { success: false, error: "Could not cancel the order. Please try again." },
      { status: 500 },
    );
  }

  if (!updatedRaw) {
    return NextResponse.json(
      {
        success: false,
        error: "Only pending orders can be cancelled. Contact the shop if it is already being prepared.",
      },
      { status: 409 },
    );
  }

  const couponCode =
    typeof full?.coupon_code === "string" ? full.coupon_code.trim() : "";
  const shopId = full?.shop_id || order.shop_id;
  if (couponCode && shopId) {
    await refundCouponUsage(admin as never, shopId, couponCode);
  }

  const updated = updatedRaw as { id: string; status: string; updated_at: string };

  return NextResponse.json({
    success: true,
    order: { id: updated.id, status: updated.status, updated_at: updated.updated_at },
  });
}
