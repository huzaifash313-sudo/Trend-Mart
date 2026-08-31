/* -------------------------------------------------------------------------- */
/*  TrendsMart — My Reviews (GET /api/reviews/my-reviews)                       */
/*                                                                            */
/*  Powers the "Give Your Review" entry on the customer account portal.       */
/*  Returns (for the signed-in customer):                                     */
/*    - their own reviews, each decorated with the shop name                  */
/*    - the shops they ordered from (delivered) that they have NOT yet        */
/*      reviewed, so the portal can offer an easy "rate this shop" list       */
/*    - combined stats (average rating + total) across their reviews          */
/*                                                                            */
/*  STRICT ACCOUNT SCOPE: only orders whose customer_user_id matches the      */
/*  signed-in account count — a second account on the same phone never sees   */
/*  another account's delivered orders or review prompts.                     */
/* -------------------------------------------------------------------------- */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface ReviewRow {
  id: string;
  shop_id: string;
  customer_name: string | null;
  rating: number | null;
  comment: string | null;
  created_at: string | null;
  user_id: string | null;
  merchant_reply: string | null;
  merchant_reply_at: string | null;
  verified_purchase: boolean | null;
}

interface OrderRow {
  id: string;
  shop_id: string | null;
  status?: string | null;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Sign in required." },
      { status: 401 },
    );
  }

  const [reviewsRes, accountOrdersRes] = await Promise.all([
    supabase
      .from("reviews")
      .select(
        "id, shop_id, customer_name, rating, comment, created_at, user_id, merchant_reply, merchant_reply_at, verified_purchase",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("orders")
      .select("id, shop_id, status")
      .eq("customer_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  const reviews = (reviewsRes.data ?? []) as ReviewRow[];
  const accountOrders = (accountOrdersRes.data ?? []) as OrderRow[];

  // Shops the customer genuinely ordered from — ONLY the exact account that
  // placed the order (customer_user_id match) earns a review entry. No phone
  // fallback: on a shared device, a different account with the same phone must
  // never see another account's delivered orders here.
  // ONLY delivered orders earn a review (merchant must have marked the order
  // delivered in the app first). Track the latest delivered order per shop so
  // the client can dismiss the review popup PER ORDER — a later order from the
  // same shop re-triggers it.
  const latestDeliveredOrderByShop = new Map<string, string>();
  for (const row of accountOrders) {
    if (String(row.status ?? "").toLowerCase() !== "delivered") continue;
    if (!row.shop_id) continue;
    const shopId = String(row.shop_id);
    if (!latestDeliveredOrderByShop.has(shopId)) {
      latestDeliveredOrderByShop.set(shopId, row.id);
    }
  }

  const reviewedShopIds = new Set(reviews.map((r) => r.shop_id));
  const reviewableIds = [...latestDeliveredOrderByShop.keys()].filter(
    (id) => !reviewedShopIds.has(id),
  );

  // Resolve shop names in one batch.
  const allShopIds = [...new Set([...reviews.map((r) => r.shop_id), ...reviewableIds])];
  const shopNames = new Map<string, string>();
  if (allShopIds.length > 0) {
    const { data: shops } = await supabase
      .from("shops")
      .select("id, name")
      .in("id", allShopIds);
    for (const s of (shops ?? []) as { id: string; name: string | null }[]) {
      shopNames.set(String(s.id), String(s.name ?? ""));
    }
  }

  const reviewsWithShop = reviews.map((r) => ({
    ...r,
    shop_name: shopNames.get(r.shop_id) || "Store",
  }));

  const reviewableShops = reviewableIds.map((id) => ({
    id,
    name: shopNames.get(id) || "Store",
    orderId: latestDeliveredOrderByShop.get(id),
  }));

  // Combined stats across the customer's own reviews.
  const ratings = reviewsWithShop
    .filter((r) => Number.isInteger(r.rating) && Number(r.rating) >= 1 && Number(r.rating) <= 5)
    .map((r) => Number(r.rating));
  const total = ratings.length;
  const average = total > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / total) * 10) / 10 : 0;

  return NextResponse.json({
    success: true,
    data: {
      reviews: reviewsWithShop,
      reviewableShops,
      stats: { total, average },
    },
  });
}
