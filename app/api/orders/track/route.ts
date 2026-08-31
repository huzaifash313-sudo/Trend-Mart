/* -------------------------------------------------------------------------- */
/*  TrendsMart — Strict Order Tracking API (GET /api/orders/track)              */
/*                                                                            */
/*  Server-side "Trace Order" entry point used by the order-tracking service. */
/*                                                                            */
/*  Strict Order Ownership rule:                                               */
/*    - A phone-number match alone is NEVER enough to return an order.        */
/*    - Even when the RPC finds an order, the current session's auth.uid()    */
/*      must be the order's `customer_user_id`, or the owner of the shop,     */
/*      or a platform admin. Anonymous callers always get zero rows.          */
/*                                                                            */
/*  Defense-in-depth: the RPCs (`track_orders_by_phone` / `track_order_by_id`)*/
/*  enforce the same predicate in SQL; this route re-checks every returned    */
/*  row so a stale RPC version can never leak an order to the wrong user.     */
/* -------------------------------------------------------------------------- */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizePkPhoneDigits, isValidUUID } from "@/lib/sanitization";

export const runtime = "nodejs";

/** Raw row shape returned by the tracking RPCs. */
interface TrackedOrderRow {
  id: string;
  shop_id: string;
  shop_name?: string | null;
  shop_whatsapp?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_user_id?: string | null;
  items_json?: unknown;
  total_amount?: number | null;
  status?: string | null;
  tracking_number?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const phone = (searchParams.get("phone") ?? "").trim();
  const orderId = (searchParams.get("orderId") ?? "").trim();

  if (!phone && !orderId) {
    return NextResponse.json(
      { success: false, error: "Provide a phone number or order reference ID." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Strict order ownership: without a signed-in session there is no verifiable
  // relationship to the order, so guests receive zero rows.
  if (!user) {
    return NextResponse.json({ success: true, orders: [] });
  }

  let rows: TrackedOrderRow[] = [];
  try {
    if (orderId) {
      if (!isValidUUID(orderId)) {
        return NextResponse.json(
          { success: false, error: "Please enter a valid order reference ID." },
          { status: 400 },
        );
      }
      const { data, error } = await supabase
        .rpc("track_order_by_id", { p_order_id: orderId })
        .maybeSingle();
      if (error) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 },
        );
      }
      if (data) rows = [data as TrackedOrderRow];
    } else {
      const cleaned = normalizePkPhoneDigits(phone) || phone.replace(/\D/g, "");
      if (cleaned.length < 10) {
        return NextResponse.json(
          { success: false, error: "Please enter a valid phone number (min 10 digits)." },
          { status: 400 },
        );
      }
      const { data, error } = await supabase.rpc("track_orders_by_phone", {
        p_phone: cleaned,
      });
      if (error) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 },
        );
      }
      rows = (data as TrackedOrderRow[] | null) ?? [];
    }
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to look up the order.",
      },
      { status: 500 },
    );
  }

  // Even when the phone number matched, only return orders owned by the
  // current session's auth.uid() (direct buyer, shop owner, or admin).
  const allowed = await filterOwnedOrders(supabase, rows, user.id);

  return NextResponse.json({ success: true, orders: allowed });
}

/**
 * Keep only the orders the signed-in user genuinely owns:
 *   - `customer_user_id = auth.uid()` — the buyer who placed it, OR
 *   - the user owns the order's shop (`shops.owner_id`), OR
 *   - the user is a platform admin.
 */
async function filterOwnedOrders(
  supabase: ServerSupabase,
  rows: TrackedOrderRow[],
  uid: string,
): Promise<TrackedOrderRow[]> {
  if (rows.length === 0) return rows;

  // Fast path: the caller is the direct buyer of every returned order.
  if (rows.every((row) => row.customer_user_id === uid)) return rows;

  const { data: shopRows } = await supabase
    .from("shops")
    .select("id")
    .eq("owner_id", uid);
  const ownedShopIds = new Set(
    (shopRows ?? []).map((s) => String((s as { id: string }).id)),
  );

  const { data: isAdminRaw } = await supabase.rpc("is_admin");
  const isAdmin = isAdminRaw === true;

  return rows.filter((row) => {
    if (row.customer_user_id && row.customer_user_id === uid) return true;
    if (isAdmin) return true;
    return ownedShopIds.has(row.shop_id);
  });
}
