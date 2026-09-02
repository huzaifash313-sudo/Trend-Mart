/* -------------------------------------------------------------------------- */
/*  GET /api/reviews/my-reviews                                                 */
/*  Product-first reviewables from delivered orders + user's past reviews.     */
/* -------------------------------------------------------------------------- */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ReviewRow {
  id: string;
  shop_id: string;
  product_id?: string | null;
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
  items_json?: unknown;
}

interface LineProduct {
  productId: string;
  name: string;
  imageUrl?: string | null;
  shopId: string;
  orderId: string;
}

function extractLineProducts(order: OrderRow): LineProduct[] {
  const shopId = order.shop_id ? String(order.shop_id) : "";
  if (!shopId || !Array.isArray(order.items_json)) return [];
  const out: LineProduct[] = [];
  const seen = new Set<string>();
  for (const item of order.items_json) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const productId =
      (typeof row.productId === "string" && row.productId) ||
      (typeof row.product_id === "string" && row.product_id) ||
      "";
    if (!UUID_RE.test(productId) || seen.has(productId)) continue;
    seen.add(productId);
    const name =
      (typeof row.name === "string" && row.name.trim()) ||
      (typeof row.title === "string" && row.title.trim()) ||
      "Product";
    const imageUrl =
      (typeof row.imageUrl === "string" && row.imageUrl) ||
      (typeof row.image_url === "string" && row.image_url) ||
      null;
    out.push({
      productId,
      name,
      imageUrl,
      shopId,
      orderId: order.id,
    });
  }
  return out;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Sign in required." }, { status: 401 });
  }

  const [reviewsRes, accountOrdersRes] = await Promise.all([
    supabase
      .from("reviews")
      .select(
        "id, shop_id, product_id, customer_name, rating, comment, created_at, user_id, merchant_reply, merchant_reply_at, verified_purchase",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("orders")
      .select("id, shop_id, status, items_json")
      .eq("customer_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  // Graceful if product_id column missing yet
  let reviews = (reviewsRes.data ?? []) as ReviewRow[];
  if (reviewsRes.error && /product_id/i.test(reviewsRes.error.message || "")) {
    const fallback = await supabase
      .from("reviews")
      .select(
        "id, shop_id, customer_name, rating, comment, created_at, user_id, merchant_reply, merchant_reply_at, verified_purchase",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);
    reviews = (fallback.data ?? []) as ReviewRow[];
  }

  const accountOrders = (accountOrdersRes.data ?? []) as OrderRow[];

  const reviewedProductIds = new Set(
    reviews.map((r) => r.product_id).filter((id): id is string => Boolean(id)),
  );
  const reviewedShopOnlyIds = new Set(
    reviews.filter((r) => !r.product_id).map((r) => r.shop_id),
  );

  // Latest delivered line products not yet rated
  const reviewableByProduct = new Map<string, LineProduct>();
  const latestDeliveredOrderByShop = new Map<string, string>();

  for (const row of accountOrders) {
    if (String(row.status ?? "").toLowerCase() !== "delivered") continue;
    if (!row.shop_id) continue;
    const shopId = String(row.shop_id);
    if (!latestDeliveredOrderByShop.has(shopId)) {
      latestDeliveredOrderByShop.set(shopId, row.id);
    }
    for (const line of extractLineProducts(row)) {
      if (reviewedProductIds.has(line.productId)) continue;
      if (!reviewableByProduct.has(line.productId)) {
        reviewableByProduct.set(line.productId, line);
      }
    }
  }

  const reviewableProducts = [...reviewableByProduct.values()].slice(0, 40);

  // Legacy: shops with delivered orders and no shop-only review AND no product
  // reviewables left for that shop (so we don't double-prompt).
  const shopsWithPendingProducts = new Set(reviewableProducts.map((p) => p.shopId));
  const reviewableShopIds = [...latestDeliveredOrderByShop.keys()].filter(
    (id) => !reviewedShopOnlyIds.has(id) && !shopsWithPendingProducts.has(id),
  );

  const allShopIds = [
    ...new Set([
      ...reviews.map((r) => r.shop_id),
      ...reviewableProducts.map((p) => p.shopId),
      ...reviewableShopIds,
    ]),
  ];
  const shopNames = new Map<string, string>();
  if (allShopIds.length > 0) {
    const { data: shops } = await supabase.from("shops").select("id, name").in("id", allShopIds);
    for (const s of (shops ?? []) as { id: string; name: string | null }[]) {
      shopNames.set(String(s.id), String(s.name ?? ""));
    }
  }

  // Enrich product names/images from products table when order JSON is thin
  const productMeta = new Map<string, { name: string; imageUrl: string | null }>();
  const productIds = reviewableProducts.map((p) => p.productId);
  const reviewedProductIdsList = reviews
    .map((r) => r.product_id)
    .filter((id): id is string => Boolean(id));
  const metaIds = [...new Set([...productIds, ...reviewedProductIdsList])];
  if (metaIds.length > 0) {
    const { data: products } = await supabase
      .from("products")
      .select("id, name, title, image_url")
      .in("id", metaIds);
    for (const p of (products ?? []) as {
      id: string;
      name: string | null;
      title: string | null;
      image_url: string | null;
    }[]) {
      productMeta.set(String(p.id), {
        name: String(p.name || p.title || "Product"),
        imageUrl: p.image_url,
      });
    }
  }

  const reviewsWithShop = reviews.map((r) => ({
    ...r,
    shop_name: shopNames.get(r.shop_id) || "Store",
    product_name: r.product_id ? productMeta.get(r.product_id)?.name ?? null : null,
  }));

  const reviewableProductsOut = reviewableProducts.map((p) => {
    const meta = productMeta.get(p.productId);
    return {
      id: p.productId,
      productId: p.productId,
      name: meta?.name || p.name,
      imageUrl: p.imageUrl || meta?.imageUrl || null,
      shopId: p.shopId,
      shopName: shopNames.get(p.shopId) || "Store",
      orderId: p.orderId,
    };
  });

  const reviewableShops = reviewableShopIds.map((id) => ({
    id,
    name: shopNames.get(id) || "Store",
    orderId: latestDeliveredOrderByShop.get(id),
  }));

  const ratings = reviewsWithShop
    .filter((r) => Number.isInteger(r.rating) && Number(r.rating) >= 1 && Number(r.rating) <= 5)
    .map((r) => Number(r.rating));
  const total = ratings.length;
  const average =
    total > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / total) * 10) / 10 : 0;

  return NextResponse.json({
    success: true,
    data: {
      reviews: reviewsWithShop,
      reviewableProducts: reviewableProductsOut,
      reviewableShops,
      stats: { total, average },
    },
  });
}
