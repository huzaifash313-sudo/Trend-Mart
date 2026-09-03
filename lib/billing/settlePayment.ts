import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { MONTHLY_STORE_FEE_PKR } from "@/lib/billing/plans";

function db(): any {
  return getSupabaseAdminClient();
}

/** Mark shop subscription active for +30 days after a successful payment. */
export async function activatePaidSubscription(shopId: string): Promise<boolean> {
  const admin = db();
  if (!admin) return false;

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const { data: existing } = await admin
    .from("merchant_subscriptions")
    .select("id")
    .eq("shop_id", shopId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await admin
      .from("merchant_subscriptions")
      .update({
        tier: "starter",
        status: "active",
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        grace_period_until: null,
        suspended_at: null,
        suspended_reason: null,
        updated_at: now.toISOString(),
      })
      .eq("id", existing.id);
    if (error) {
      console.error("[activatePaidSubscription] update", error);
      return false;
    }
  } else {
    const { error } = await admin.from("merchant_subscriptions").insert({
      shop_id: shopId,
      tier: "starter",
      status: "active",
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      trial_started_at: null,
      trial_ends_at: null,
      products_used: 0,
      storage_used_mb: 0,
    });
    if (error) {
      console.error("[activatePaidSubscription] insert", error);
      return false;
    }
  }

  await admin
    .from("shops")
    .update({
      subscription_tier: "pro",
      stories_quota: 10,
      pro_expires_at: periodEnd.toISOString(),
    })
    .eq("id", shopId);

  try {
    await admin.from("billing_invoices").insert({
      shop_id: shopId,
      amount_pkr: MONTHLY_STORE_FEE_PKR,
      commission_pkr: 0,
      status: "paid",
      period_start: now.toISOString(),
      period_end: periodEnd.toISOString(),
      due_date: now.toISOString(),
      paid_at: now.toISOString(),
    });
  } catch {
    /* optional */
  }

  return true;
}

/** Credit tokens + mark payment_orders paid (idempotent). */
export async function settlePaidOrder(
  orderId: string,
  providerRef: string | null,
): Promise<boolean> {
  const admin = db();
  if (!admin) return false;

  const { data: order } = await admin
    .from("payment_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return false;
  if (order.status === "paid") return true;
  if (order.status !== "pending") return false;

  if (order.kind === "tokens") {
    const tokens = Number(order.tokens_credit) || 0;
    if (tokens > 0) {
      const { error } = await admin.rpc("credit_shop_tokens", {
        p_shop_id: order.shop_id,
        p_tokens: tokens,
        p_reason: "token_pack_purchase",
        p_ref_type: "payment_order",
        p_ref_id: order.id,
      });
      if (error) {
        console.error("[settlePaidOrder] credit_shop_tokens", error);
        return false;
      }
    }
  } else if (order.kind === "subscription") {
    const ok = await activatePaidSubscription(String(order.shop_id));
    if (!ok) return false;
  }

  await admin
    .from("payment_orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      provider_ref: providerRef || order.provider_ref,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  return true;
}
