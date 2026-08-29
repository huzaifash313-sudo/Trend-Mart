/* -------------------------------------------------------------------------- */
/*  TrendMart — Multi-Vendor Commission & Subscription Tier Management         */
/*  Manages merchant billing cycles, free trial quotas, subscription statuses  */
/*  (active, grace_period, suspended), and automated access checks.            */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";

// ─── Types ────────────────────────────────────────────────────────────────────

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

/**
 * Subscription tiers available to merchants.
 *
 * TrendMart runs a SINGLE-Plan model (confirmed business decision):
 *   • ZERO commission for every merchant (no % cut on orders).
 *   • One flat monthly fee: Rs 1,000/month.
 *   • NO product limits, NO storage limits — every shop is effectively unlimited.
 *   • Free trial = 1 MONTH (30 days), not 14.
 *   • EVERY merchant gets the same best features (no feature tiers).
 *
 * The four enum values are kept for database/schema compatibility (the
 * `merchant_subscriptions.tier` column may hold legacy values like 'starter'
 * / 'pro' / 'enterprise'), but they all resolve to the SAME plan config below.
 */
export type SubscriptionTier = "free_trial" | "starter" | "pro" | "enterprise";

/** Possible subscription lifecycle statuses. */
export type SubscriptionStatus =
  | "active"
  | "grace_period"
  | "suspended"
  | "cancelled"
  | "expired";

/** Commission rate structure per subscription tier. */
export interface TierConfig {
  name: string;
  commission_rate_pct: number;
  max_products: number;
  monthly_fee_pkr: number;
  free_trial_days: number;
  features: string[];
  max_storage_mb: number;
  priority_support: boolean;
}

/* ── Single-Plan constants ─────────────────────────────────────────────── */

/** Flat monthly fee for every paid merchant — Rs 1,000. */
export const TRENDMART_MONTHLY_FEE_PKR = 1000;

/** Zero commission — TrendMart never takes a % of merchant orders. */
export const TRENDMART_COMMISSION_PCT = 0;

/** Free trial length — 1 month (30 days). */
export const TRENDMART_FREE_TRIAL_DAYS = 30;

/** Effectively unlimited product count (100k is beyond any real shop). */
export const TRENDMART_MAX_PRODUCTS = 100_000;

/** Effectively unlimited storage (100 GB). */
export const TRENDMART_MAX_STORAGE_MB = 100_000;

/** The full best-feature set — granted to EVERY merchant (paid or trial). */
export const TRENDMART_ALL_FEATURES = [
  "basic_storefront",
  "whatsapp_orders",
  "advanced_analytics",
  "coupon_codes",
  "stories",
  "csv_export",
  "inventory_matrix",
  "variant_manager",
  "invoice_generator",
  "api_access",
  "white_label",
  "dedicated_support",
] as const;

/** Single paid plan (Rs 1,000/mo, 0% commission, unlimited, best features). */
export const TRENDMART_PAID_PLAN: Omit<TierConfig, "name" | "free_trial_days"> = {
  commission_rate_pct: TRENDMART_COMMISSION_PCT,
  max_products: TRENDMART_MAX_PRODUCTS,
  monthly_fee_pkr: TRENDMART_MONTHLY_FEE_PKR,
  features: [...TRENDMART_ALL_FEATURES],
  max_storage_mb: TRENDMART_MAX_STORAGE_MB,
  priority_support: true,
};

/**
 * Tier configuration lookup table — every tier resolves to the SAME plan.
 * The trial is free; all paid tiers share one price/commission/limits.
 */
export const SUBSCRIPTION_TIERS: Record<SubscriptionTier, TierConfig> = {
  free_trial: {
    name: "Free Trial (1 Month)",
    commission_rate_pct: TRENDMART_COMMISSION_PCT,
    max_products: TRENDMART_MAX_PRODUCTS,
    monthly_fee_pkr: 0,
    free_trial_days: TRENDMART_FREE_TRIAL_DAYS,
    features: [...TRENDMART_ALL_FEATURES],
    max_storage_mb: TRENDMART_MAX_STORAGE_MB,
    priority_support: true,
  },
  starter: {
    ...TRENDMART_PAID_PLAN,
    name: "TrendMart Standard",
    free_trial_days: 0,
  },
  pro: {
    ...TRENDMART_PAID_PLAN,
    name: "TrendMart Standard",
    free_trial_days: 0,
  },
  enterprise: {
    ...TRENDMART_PAID_PLAN,
    name: "TrendMart Standard",
    free_trial_days: 0,
  },
};

/** Database row shape for merchant_subscriptions table. */
export interface MerchantSubscription {
  id: string;
  shop_id: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  products_used: number;
  storage_used_mb: number;
  grace_period_until: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** Billing cycle invoice record. */
export interface BillingInvoice {
  id: string;
  shop_id: string;
  subscription_id: string;
  amount_pkr: number;
  commission_pkr: number;
  status: "paid" | "pending" | "overdue" | "waived";
  period_start: string;
  period_end: string;
  due_date: string;
  paid_at: string | null;
  created_at: string;
}

/** Result of an access check for merchant dashboard actions. */
export interface AccessCheckResult {
  allowed: boolean;
  reason?: string;
  subscription?: MerchantSubscription;
  tier_config?: TierConfig;
}

/** Audit log entry shape. */
export interface SubscriptionAuditEntry {
  id: string;
  shop_id: string;
  subscription_id: string | null;
  event_type: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  performed_by: string | null;
  ip_address: string | null;
  created_at: string;
}

/** Subscription row with optional joined shop name. */
export interface SubscriptionWithShop extends MerchantSubscription {
  shop_name?: string;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Initialize a merchant subscription when a new shop is created.
 * Starts a free trial for 14 days.
 */
export async function initializeSubscription(
  shopId: string,
  tier: SubscriptionTier = "free_trial",
): Promise<ServiceResult<MerchantSubscription>> {
  const supabase = createClient();
  try {
    const tierConfig = SUBSCRIPTION_TIERS[tier];
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + (tierConfig.free_trial_days || 30));
    const trialEnds = tierConfig.free_trial_days > 0
      ? new Date(now.getTime() + tierConfig.free_trial_days * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { data, error } = await supabase
      .from("merchant_subscriptions")
      .insert({
        shop_id: shopId,
        tier,
        status: "active",
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        trial_started_at: tierConfig.free_trial_days > 0 ? now.toISOString() : null,
        trial_ends_at: trialEnds,
        products_used: 0,
        storage_used_mb: 0,
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as MerchantSubscription };
  } catch (err) {
    logError(err, { module: "subscriptionService.initializeSubscription", meta: { shopId, tier } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Fetch the active subscription for a given shop.
 */
export async function fetchSubscription(
  shopId: string,
): Promise<ServiceResult<MerchantSubscription | null>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("merchant_subscriptions")
      .select("*")
      .eq("shop_id", shopId)
      .maybeSingle();

    if (error) throw error;
    return { success: true, data: data as MerchantSubscription | null };
  } catch (err) {
    logError(err, { module: "subscriptionService.fetchSubscription", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Check if a merchant has write-access to their dashboard.
 * Evaluates subscription status, billing cycle expiry, usage thresholds,
 * and grace periods. Returns an AccessCheckResult with detailed reasoning
 * if access is denied.
 */
export async function checkMerchantAccess(
  shopId: string,
): Promise<AccessCheckResult> {
  const supabase = createClient();
  try {
    const subResult = await fetchSubscription(shopId);

    if (!subResult.success) {
      return { allowed: false, reason: "Failed to verify subscription status." };
    }

    const sub = subResult.data;

    // No subscription record → allow (backward compatibility during rollout)
    if (!sub) {
      void initializeSubscription(shopId);
      return { allowed: true };
    }

    const tierConfig = SUBSCRIPTION_TIERS[sub.tier];
    if (!tierConfig) {
      return { allowed: false, reason: "Unknown subscription tier.", subscription: sub };
    }

    const now = new Date();

    // Check 1: Suspended status
    if (sub.status === "suspended") {
      return {
        allowed: false,
        reason: sub.suspended_reason ?? "Your store has been suspended. Please contact support.",
        subscription: sub,
        tier_config: tierConfig,
      };
    }

    // Check 2: Cancelled or expired status
    if (sub.status === "cancelled" || sub.status === "expired") {
      return {
        allowed: false,
        reason: "Your subscription has ended. Please renew to regain access.",
        subscription: sub,
        tier_config: tierConfig,
      };
    }

    // Check 3: Grace period expired
    if (sub.status === "grace_period" && sub.grace_period_until) {
      if (now > new Date(sub.grace_period_until)) {
        await suspendSubscription(sub.shop_id, "Grace period expired without payment.");
        return {
          allowed: false,
          reason: "Grace period has expired. Your store is now suspended.",
          subscription: sub,
          tier_config: tierConfig,
        };
      }
      return {
        allowed: true,
        reason: `Grace period active until ${new Date(sub.grace_period_until).toLocaleDateString()}. Please settle your invoice to avoid suspension.`,
        subscription: sub,
        tier_config: tierConfig,
      };
    }

    // Check 4: Billing cycle expired
    if (now > new Date(sub.current_period_end)) {
      const { data: unpaidInvoices } = await supabase
        .from("billing_invoices")
        .select("id, amount_pkr, due_date")
        .eq("shop_id", shopId)
        .eq("status", "pending")
        .order("due_date", { ascending: false })
        .limit(1);

      const hasUnpaid = unpaidInvoices && unpaidInvoices.length > 0;

      if (sub.tier !== "free_trial" && hasUnpaid) {
        if (sub.status !== "grace_period") {
          const graceUntil = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
          await supabase
            .from("merchant_subscriptions")
            .update({
              status: "grace_period",
              grace_period_until: graceUntil.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq("id", sub.id);

          return {
            allowed: true,
            reason: `Your billing period has ended. You have a 5-day grace period until ${graceUntil.toLocaleDateString()} to settle your invoice.`,
            subscription: { ...sub, status: "grace_period", grace_period_until: graceUntil.toISOString() },
            tier_config: tierConfig,
          };
        }
      }

      if (sub.tier === "free_trial") {
        await supabase
          .from("merchant_subscriptions")
          .update({ status: "expired", updated_at: now.toISOString() })
          .eq("id", sub.id);

        return {
          allowed: false,
          reason: "Your free trial has ended. Please upgrade to a paid plan to continue selling.",
          subscription: { ...sub, status: "expired" },
          tier_config: tierConfig,
        };
      }
    }

    // Check 5: Product usage threshold exceeded
    if (sub.products_used >= tierConfig.max_products) {
      return {
        allowed: true,
        reason: `You have reached the product limit (${tierConfig.max_products}) for the ${tierConfig.name} tier. Upgrade to add more products.`,
        subscription: sub,
        tier_config: tierConfig,
      };
    }

    // Check 6: Storage threshold exceeded
    if (sub.storage_used_mb >= tierConfig.max_storage_mb) {
      return {
        allowed: true,
        reason: `You have exceeded the storage limit (${tierConfig.max_storage_mb} MB) for the ${tierConfig.name} tier. Upgrade for more storage.`,
        subscription: sub,
        tier_config: tierConfig,
      };
    }

    return { allowed: true, subscription: sub, tier_config: tierConfig };
  } catch (err) {
    logError(err, { module: "subscriptionService.checkMerchantAccess", meta: { shopId } });
    return { allowed: false, reason: "An error occurred while checking access." };
  }
}

/**
 * Check if a storefront should remain visible to customers.
 */
export async function checkStorefrontVisibility(
  shopId: string,
): Promise<{ visible: boolean; reason?: string }> {
  const access = await checkMerchantAccess(shopId);
  if (!access.allowed) {
    if (access.subscription?.status === "suspended") {
      return { visible: false, reason: access.reason };
    }
    if (
      access.subscription?.status === "cancelled" ||
      access.subscription?.status === "expired"
    ) {
      return { visible: false, reason: access.reason };
    }
  }
  return { visible: true };
}

/**
 * Upgrade the subscription tier for a shop (admin action or post-payment).
 */
export async function upgradeSubscription(
  shopId: string,
  newTier: SubscriptionTier,
  performedBy?: string,
): Promise<ServiceResult<MerchantSubscription>> {
  const supabase = createClient();
  try {
    const subResult = await fetchSubscription(shopId);
    if (!subResult.success || !subResult.data) {
      return { success: false, error: "No subscription found for this shop." };
    }

    const existing = subResult.data;
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const { data, error } = await supabase
      .from("merchant_subscriptions")
      .update({
        tier: newTier,
        status: "active",
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        grace_period_until: null,
        suspended_at: null,
        suspended_reason: null,
        updated_at: now.toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) throw error;

    await supabase.from("subscription_audit_log").insert({
      shop_id: shopId,
      subscription_id: existing.id,
      event_type: "tier_changed",
      old_value: { tier: existing.tier },
      new_value: { tier: newTier },
      performed_by: performedBy ?? null,
    });

    return { success: true, data: data as MerchantSubscription };
  } catch (err) {
    logError(err, { module: "subscriptionService.upgradeSubscription", meta: { shopId, newTier } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Suspend a merchant's subscription (admin or automated action).
 * Also sets the shop's is_live to false to hide the storefront.
 */
export async function suspendSubscription(
  shopId: string,
  reason: string,
  performedBy?: string,
): Promise<ServiceResult<MerchantSubscription>> {
  const supabase = createClient();
  try {
    const now = new Date();
    const subResult = await fetchSubscription(shopId);
    if (!subResult.success || !subResult.data) {
      return { success: false, error: "No subscription found." };
    }

    const { data, error } = await supabase
      .from("merchant_subscriptions")
      .update({
        status: "suspended",
        suspended_at: now.toISOString(),
        suspended_reason: reason,
        updated_at: now.toISOString(),
      })
      .eq("id", subResult.data.id)
      .select()
      .single();

    if (error) throw error;

    await supabase
      .from("shops")
      .update({ is_live: false })
      .eq("id", shopId);

    await supabase.from("subscription_audit_log").insert({
      shop_id: shopId,
      subscription_id: subResult.data.id,
      event_type: "suspended",
      old_value: { status: subResult.data.status },
      new_value: { status: "suspended", reason },
      performed_by: performedBy ?? null,
    });

    return { success: true, data: data as MerchantSubscription };
  } catch (err) {
    logError(err, { module: "subscriptionService.suspendSubscription", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Reactivate a suspended subscription and restore storefront visibility.
 */
export async function reactivateSubscription(
  shopId: string,
  performedBy?: string,
): Promise<ServiceResult<MerchantSubscription>> {
  const supabase = createClient();
  try {
    const subResult = await fetchSubscription(shopId);
    if (!subResult.success || !subResult.data) {
      return { success: false, error: "No subscription found." };
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const { data, error } = await supabase
      .from("merchant_subscriptions")
      .update({
        status: "active",
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        suspended_at: null,
        suspended_reason: null,
        grace_period_until: null,
        updated_at: now.toISOString(),
      })
      .eq("id", subResult.data.id)
      .select()
      .single();

    if (error) throw error;

    await supabase
      .from("shops")
      .update({ is_live: true })
      .eq("id", shopId);

    await supabase.from("subscription_audit_log").insert({
      shop_id: shopId,
      subscription_id: subResult.data.id,
      event_type: "reactivated",
      old_value: { status: subResult.data.status },
      new_value: { status: "active" },
      performed_by: performedBy ?? null,
    });

    return { success: true, data: data as MerchantSubscription };
  } catch (err) {
    logError(err, { module: "subscriptionService.reactivateSubscription", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Generate a billing invoice for the current period.
 */
export async function generateBillingInvoice(
  shopId: string,
): Promise<ServiceResult<BillingInvoice>> {
  const supabase = createClient();
  try {
    const subResult = await fetchSubscription(shopId);
    if (!subResult.success || !subResult.data) {
      return { success: false, error: "No subscription found." };
    }

    const sub = subResult.data;
    const tierConfig = SUBSCRIPTION_TIERS[sub.tier];

    const { data: orders, error: orderError } = await supabase
      .from("orders")
      .select("total_amount, created_at")
      .eq("shop_id", shopId)
      .gte("created_at", sub.current_period_start)
      .lte("created_at", sub.current_period_end);

    if (orderError) throw orderError;

    const totalRevenue = (orders ?? []).reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const commissionAmount = Math.round(totalRevenue * (tierConfig.commission_rate_pct / 100));
    const totalDue = tierConfig.monthly_fee_pkr + commissionAmount;

    const periodEnd = new Date(sub.current_period_end);
    const dueDate = new Date(periodEnd.getTime() + 3 * 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from("billing_invoices")
      .insert({
        shop_id: shopId,
        subscription_id: sub.id,
        amount_pkr: totalDue,
        commission_pkr: commissionAmount,
        status: totalDue === 0 ? "waived" : "pending",
        period_start: sub.current_period_start,
        period_end: sub.current_period_end,
        due_date: dueDate.toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as BillingInvoice };
  } catch (err) {
    logError(err, { module: "subscriptionService.generateBillingInvoice", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Fetch billing invoices for a shop.
 */
export async function fetchBillingInvoices(
  shopId: string,
): Promise<ServiceResult<BillingInvoice[]>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("billing_invoices")
      .select("*")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(24);

    if (error) throw error;
    return { success: true, data: (data as BillingInvoice[]) ?? [] };
  } catch (err) {
    logError(err, { module: "subscriptionService.fetchBillingInvoices", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Sync product count to the subscription record.
 */
export async function syncProductCount(shopId: string): Promise<void> {
  const supabase = createClient();
  try {
    const { count, error } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("shop_id", shopId);

    if (error) throw error;

    await supabase
      .from("merchant_subscriptions")
      .update({
        products_used: count ?? 0,
        updated_at: new Date().toISOString(),
      })
      .eq("shop_id", shopId);
  } catch (err) {
    logError(err, { module: "subscriptionService.syncProductCount", meta: { shopId } });
  }
}

/**
 * Sync storage usage to the subscription record.
 */
export async function syncStorageUsage(shopId: string, storageUsedMb: number): Promise<void> {
  const supabase = createClient();
  try {
    await supabase
      .from("merchant_subscriptions")
      .update({
        storage_used_mb: storageUsedMb,
        updated_at: new Date().toISOString(),
      })
      .eq("shop_id", shopId);
  } catch (err) {
    logError(err, { module: "subscriptionService.syncStorageUsage", meta: { shopId } });
  }
}

/**
 * Fetch subscription audit log (for a shop or all shops for admin).
 */
export async function fetchSubscriptionAuditLog(
  shopId?: string,
  limit = 50,
): Promise<ServiceResult<SubscriptionAuditEntry[]>> {
  const supabase = createClient();
  try {
    let query = supabase
      .from("subscription_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (shopId) {
      query = query.eq("shop_id", shopId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { success: true, data: (data as SubscriptionAuditEntry[]) ?? [] };
  } catch (err) {
    logError(err, { module: "subscriptionService.fetchSubscriptionAuditLog", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Fetch all subscriptions (admin dashboard).
 */
export async function fetchAllSubscriptions(
  filters?: { status?: SubscriptionStatus; tier?: SubscriptionTier },
): Promise<ServiceResult<SubscriptionWithShop[]>> {
  const supabase = createClient();
  try {
    let query = supabase
      .from("merchant_subscriptions")
      .select("*, shops(name)")
      .order("updated_at", { ascending: false });

    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.tier) query = query.eq("tier", filters.tier);

    const { data, error } = await query;
    if (error) throw error;

     
    const flattened: SubscriptionWithShop[] = (data ?? []).map((row: Record<string, unknown>) => ({
      ...row,
      shop_name: (row.shops as { name?: string } | undefined)?.name ?? "Unknown",
      shops: undefined,
    })) as unknown as SubscriptionWithShop[];

    return { success: true, data: flattened };
  } catch (err) {
    logError(err, { module: "subscriptionService.fetchAllSubscriptions" });
    return { success: false, error: toError(err) };
  }
}