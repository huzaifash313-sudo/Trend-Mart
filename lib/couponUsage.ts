/* -------------------------------------------------------------------------- */
/*  Coupon usage increment/decrement helpers (service-role admin client)       */
/* -------------------------------------------------------------------------- */

type AdminLike = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  from: (table: string) => any;
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
  } catch {
    /* fall through to RMW */
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
  } catch {
    /* soft-launch: merchant can honour manually */
  }
}
