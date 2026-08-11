import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/webPush";
import { buildSafeErrorResponse } from "@/lib/responseSanitizer";

type ShopRow = {
  owner_id: string | null;
  name: string | null;
};

type OrderRow = {
  id: string;
  shop_id: string;
  customer_user_id: string | null;
  customer_name: string | null;
  status: string | null;
  total_amount: number | null;
  created_at: string | null;
};

const GUEST_NOTIFY_WINDOW_MS = 5 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      orderId?: string;
      status?: string;
      shopId?: string;
      event?: "new" | "status";
    };

    if (!body.orderId || !body.status || !body.shopId) {
      return NextResponse.json(buildSafeErrorResponse(400, "Missing fields."), {
        status: 400,
      });
    }

    const admin = getSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ success: true, sent: 0 });
    }

    const { data: orderRaw } = await admin
      .from("orders")
      .select("id, shop_id, customer_user_id, customer_name, status, total_amount, created_at")
      .eq("id", body.orderId)
      .eq("shop_id", body.shopId)
      .maybeSingle();

    const order = orderRaw as OrderRow | null;
    if (!order) {
      return NextResponse.json(buildSafeErrorResponse(404, "Order not found."), {
        status: 404,
      });
    }

    const { data: shopRaw } = await admin
      .from("shops")
      .select("owner_id, name")
      .eq("id", body.shopId)
      .maybeSingle();

    const shop = shopRaw as ShopRow | null;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const isOwner = !!(user && shop?.owner_id && shop.owner_id === user.id);
    const isCustomer = !!(user && order.customer_user_id && order.customer_user_id === user.id);
    const createdMs = order.created_at ? new Date(order.created_at).getTime() : 0;
    const isRecentCheckout =
      Number.isFinite(createdMs) && Date.now() - createdMs <= GUEST_NOTIFY_WINDOW_MS;

    if (!isOwner && !isCustomer && !isRecentCheckout) {
      return NextResponse.json(buildSafeErrorResponse(403, "Forbidden."), { status: 403 });
    }

    const event = body.event === "new" || body.status === "Pending" ? "new" : "status";
    const amount =
      typeof order.total_amount === "number"
        ? `Rs. ${Math.round(order.total_amount).toLocaleString()}`
        : "";

    if (shop?.owner_id) {
      await sendPushToUser(shop.owner_id, {
        title: event === "new" ? "New TrendMart order" : `Order ${body.status}`,
        body:
          event === "new"
            ? `${order.customer_name || "Customer"} placed an order${amount ? ` — ${amount}` : ""} at ${shop.name || "your shop"}.`
            : `${order.customer_name || "Customer"} — ${shop.name || "Shop"} is now ${body.status}.`,
        url: "/dashboard/orders",
        tag: `order-${body.orderId}`,
      });
    }

    if (order.customer_user_id && event !== "new") {
      await sendPushToUser(order.customer_user_id, {
        title: `Order update: ${body.status}`,
        body: `Your order at ${shop?.name || "the shop"} is now ${body.status}.`,
        url: `/orders/tracking?orderId=${encodeURIComponent(body.orderId)}`,
        tag: `order-${body.orderId}-customer`,
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
