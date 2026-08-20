/* -------------------------------------------------------------------------- */
/*  TrendMart — My Reviews (GET /api/reviews/my-reviews)                       */
/*                                                                            */
/*  Powers the "Give Your Review" entry on the customer account portal.       */
/*  Returns (for the signed-in customer):                                     */
/*    - their own reviews, each decorated with the shop name                  */
/*    - the shops they ordered from (non-cancelled) that they have NOT yet    */
/*      reviewed, so the portal can offer an easy "rate this shop" list       */
/*    - combined stats (average rating + total) across their reviews          */
/*                                                                            */
/*  Guest-checkout fallback: orders placed by phone before sign-up are        */
/*  matched via the profile phone, mirroring the POST /api/reviews rule.      */
/* -------------------------------------------------------------------------- */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { phonesMatch, normalizePhoneDigits } from "@/lib/reviewRules";

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
  customer_phone?: string | null;
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

  const [reviewsRes, accountOrdersRes, profileRes] = await Promise.all([
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
      .select("id, shop_id, status, customer_phone")
      .eq("customer_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("user_profiles")
      .select("phone")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const reviews = (reviewsRes.data ?? []) as ReviewRow[];
  const accountOrders = (accountOrdersRes.data ?? []) as OrderRow[];
  const profile = profileRes.data as { phone?: string | null } | null;

  // Guest-checkout fallback: orders placed before sign-up that match the
  // account's phone number.
  let phoneOrders: OrderRow[] = [];
  const profilePhone = profile?.phone;
  if (profilePhone) {
    const last10 = normalizePhoneDigits(profilePhone).slice(-10);
    if (last10.length === 10) {
      const { data } = await supabase
        .from("orders")
        .select("id, shop_id, status, customer_phone")
        .like("customer_phone", `%${last10}`)
        .order("created_at", { ascending: false })
        .limit(200);
      phoneOrders = ((data ?? []) as OrderRow[]).filter((o) =>
        phonesMatch(o.customer_phone, profilePhone),
      );
    }
  }

  // Shops the customer genuinely ordered from — ONLY delivered orders earn a
  // review (merchant must have marked the order delivered in the app first).
  // Track the latest delivered order per shop so the client can dismiss the
  // review popup PER ORDER — a later order from the same shop re-triggers it.
  const latestDeliveredOrderByShop = new Map<string, string>();
  for (const row of [...accountOrders, ...phoneOrders]) {
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
