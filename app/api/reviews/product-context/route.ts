/* -------------------------------------------------------------------------- */
/*  GET /api/reviews/product-context?productId=…                              */
/*  Signed-in customer review eligibility for ONE product.                     */
/*                                                                            */
/*  Authoritative check (UI gating only — the POST path re-verifies and is    */
/*  the single write gate). Returns whether this account may rate THIS        */
/*  product: it must own a DELIVERED order line containing the product, must  */
/*  not be the store owner, and must not have already rated the product.      */
/*  No fake/test bypass — real verified orders only.                          */
/* -------------------------------------------------------------------------- */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lockedDisplayName } from "@/lib/reviewRules";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Extract product ids from orders.items_json (supports productId / product_id). */
function productIdsFromItemsJson(raw: unknown): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(raw)) return ids;
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id =
      (typeof row.productId === "string" && row.productId) ||
      (typeof row.product_id === "string" && row.product_id) ||
      "";
    if (UUID_RE.test(id)) ids.add(id);
  }
  return ids;
}

export async function GET(request: NextRequest) {
  const productId = request.nextUrl.searchParams.get("productId")?.trim() ?? "";
  if (!UUID_RE.test(productId)) {
    return NextResponse.json(
      { success: false, error: "Invalid product." },
      { status: 400 },
    );
  }

  const empty = {
    success: true,
    data: {
      signedIn: false,
      isOwner: false,
      displayName: "",
      alreadyReviewed: false,
      canSubmit: false,
    },
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json(empty);

  const { data: product } = await supabase
    .from("products")
    .select("id, shop_id")
    .eq("id", productId)
    .maybeSingle();
  if (!product?.shop_id) {
    return NextResponse.json(
      { success: false, error: "Product not found." },
      { status: 404 },
    );
  }
  const shopId = String(product.shop_id);

  const [shopRes, existing, profileRes, ordersRes] = await Promise.all([
    supabase.from("shops").select("id, owner_id").eq("id", shopId).maybeSingle(),
    supabase
      .from("reviews")
      .select("id")
      .eq("product_id", productId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("user_profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("orders")
      .select("id, items_json")
      .eq("shop_id", shopId)
      .eq("customer_user_id", user.id)
      .eq("status", "Delivered")
      .limit(40),
  ]);

  const isOwner = Boolean(shopRes.data?.owner_id && shopRes.data.owner_id === user.id);
  const alreadyReviewed = Boolean(existing.data);

  const purchasedProduct = (ordersRes.data ?? []).some((row) =>
    productIdsFromItemsJson((row as { items_json?: unknown }).items_json).has(productId),
  );

  const displayName = lockedDisplayName(
    profileRes.data?.full_name,
    typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null,
    user.email,
  );

  return NextResponse.json({
    success: true,
    data: {
      signedIn: true,
      isOwner,
      displayName: displayName ?? "",
      alreadyReviewed,
      canSubmit: !isOwner && !alreadyReviewed && purchasedProduct,
    },
  });
}
