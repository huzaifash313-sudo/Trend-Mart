import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/webPush";
import { buildSafeErrorResponse } from "@/lib/responseSanitizer";
import { checkRateLimit, RATE_LIMITS, buildRateLimitHeaders } from "@/lib/rateLimiter";

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

export async function POST(request: NextRequest) {
  try {
    // Rate limit — this endpoint emits OS notifications, so throttle abuse.
    const rate = checkRateLimit(request, RATE_LIMITS.DEFAULT);
    if (!rate.allowed) {
      return NextResponse.json(buildSafeErrorResponse(429, rate.message || "Too many requests."), {
        status: 429,
        headers: buildRateLimitHeaders(rate),
      });
    }

    const body = (await request.json()) as {
      orderId?: string;
      status?: string;
      shopId?: string;
      event?: "new" | "status";
    };

    if (!body.orderId || !body.shopId) {
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

    // SECURITY: only the owning merchant or the ordering customer may trigger a
    // notification. The previous 5-minute "guest window" allowed any anonymous
    // caller to spam the merchant and inject arbitrary status text.
    if (!isOwner && !isCustomer) {
      return NextResponse.json(buildSafeErrorResponse(403, "Forbidden."), { status: 403 });
    }

    // SECURITY: never trust the client-supplied `body.status` for the text —
    // use the authoritative status read from the DB row above.
    const status = (order.status || "Pending").toString();
    const event = body.event === "new" ? "new" : "status";
    const amount =
      typeof order.total_amount === "number"
        ? `Rs. ${Math.round(order.total_amount).toLocaleString()}`
        : "";

    if (shop?.owner_id) {
      await sendPushToUser(shop.owner_id, {
        title: event === "new" ? "New TrendMart order" : `Order ${status}`,
        body:
          event === "new"
            ? `${order.customer_name || "Customer"} placed an order${amount ? ` — ${amount}` : ""} at ${shop.name || "your shop"}.`
            : `${order.customer_name || "Customer"} — ${shop.name || "Shop"} is now ${status}.`,
        url: "/dashboard/orders",
        tag: `order-${body.orderId}`,
      });
    }

    if (order.customer_user_id) {
      await sendPushToUser(order.customer_user_id, {
        title: event === "new" ? "Order placed on TrendMart" : `Order update: ${status}`,
        body:
          event === "new"
            ? `Your order at ${shop?.name || "the shop"} was received${amount ? ` (${amount})` : ""}.`
            : `Your order at ${shop?.name || "the shop"} is now ${status}.`,
        url: `/orders/tracking?orderId=${encodeURIComponent(body.orderId)}`,
        tag: `order-${body.orderId}-customer`,
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(buildSafeErrorResponse(500, "Failed to send notification."), {
      status: 500,
    });
  }
}
