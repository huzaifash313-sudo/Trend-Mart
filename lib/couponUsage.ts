/* -------------------------------------------------------------------------- */
/*  Coupon usage increment/decrement helpers (service-role admin client)       */
/* -------------------------------------------------------------------------- */

type QueryResult = Promise<{ data: unknown; error: unknown }>;
type SupabaseQueryBuilder = QueryResult & {
  select: (columns: string) => SupabaseQueryBuilder;
  update: (values: Record<string, unknown>) => SupabaseQueryBuilder;
  eq: (column: string, value: unknown) => SupabaseQueryBuilder;
  maybeSingle: () => QueryResult;
};

type AdminLike = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  from: (table: string) => SupabaseQueryBuilder;
};

/** Best-effort refund of one coupon use (failed insert, duplicate race, cancel). */
export async function refundCouponUsage(
  admin: AdminLike,
  shopId: string,
  code: string,
): Promise<void> {
  const coupon = code.trim().toUpperCase();
  if (!shopId || !coupon) return;

  const adminRpc = admin.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;

  try {
    const { error } = await adminRpc("decrement_coupon_usage", {
      p_shop_id: shopId,
      p_code: coupon,
    });
    if (!error) return;
    console.error("[refundCouponUsage] decrement_coupon_usage RPC failed, falling back", error);
  } catch (err) {
    console.error("[refundCouponUsage] decrement_coupon_usage RPC threw, falling back", err);
  }

  try {
    const { data: cur } = await admin
      .from("coupons")
      .select("usage_count")
      .eq("shop_id", shopId)
      .eq("code", coupon)
      .maybeSingle();
    const current = Number((cur as { usage_count?: number | null } | null)?.usage_count ?? 0);
    if (!Number.isFinite(current) || current <= 0) return;
    await admin
      .from("coupons")
      .update({ usage_count: current - 1 })
      .eq("shop_id", shopId)
      .eq("code", coupon)
      .eq("usage_count", current);
  } catch (err) {
    // soft-launch: merchant can honour manually, but log so it isn't invisible.
    console.error("[refundCouponUsage] read-modify-write fallback failed", err);
  }
}
