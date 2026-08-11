import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/webPush";
import { buildSafeErrorResponse } from "@/lib/responseSanitizer";

/**
 * Merchant/customer order status push fan-out.
 * Called best-effort after status changes (never blocks the UI).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(buildSafeErrorResponse(401, "Unauthorized."), { status: 401 });
    }

    const body = (await request.json()) as {
      orderId?: string;
      status?: string;
      shopId?: string;
    };

    if (!body.orderId || !body.status || !body.shopId) {
      return NextResponse.json(buildSafeErrorResponse(400, "Missing fields."), { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ success: true, sent: 0 });
    }

    const { data: shop } = await admin
      .from("shops")
      .select("owner_id, name")
      .eq("id", body.shopId)
      .maybeSingle();

    const { data: order } = await admin
      .from("orders")
      .select("customer_user_id, customer_name, status")
      .eq("id", body.orderId)
      .maybeSingle();

    // Merchant: always notify owner on pending / new activity
    if (shop?.owner_id) {
      await sendPushToUser(shop.owner_id, {
        title: `Order ${body.status}`,
        body: `${order?.customer_name || "Customer"} — ${shop.name || "Shop"}`,
        url: "/dashboard",
        tag: `order-${body.orderId}`,
      });
    }

    // Customer: notify on status changes after placement
    if (order?.customer_user_id && order.customer_user_id !== user.id) {
      await sendPushToUser(order.customer_user_id, {
        title: `Order update: ${body.status}`,
        body: `Your order at ${shop?.name || "the shop"} is now ${body.status}.`,
        url: `/orders/track?id=${body.orderId}`,
        tag: `order-${body.orderId}`,
      });
    } else if (order?.customer_user_id) {
      // Merchant updating — notify customer
      await sendPushToUser(order.customer_user_id, {
        title: `Order update: ${body.status}`,
        body: `Your order at ${shop?.name || "the shop"} is now ${body.status}.`,
        url: `/orders/track?id=${body.orderId}`,
        tag: `order-${body.orderId}`,
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
