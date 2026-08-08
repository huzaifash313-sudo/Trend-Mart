/* -------------------------------------------------------------------------- */
/*  TrendMart — Promotional Ads / Sponsored Banners Service                    */
/*                                                                             */
/*  Merchants request a paid homepage banner slot; requests default to       */
/*  'pending' and only become publicly visible once a Super-Admin approves    */
/*  them (see the `guard_promotional_ads_review_fields` trigger + RLS in      */
/*  `20250808040000_promotional_ads.sql` — merchants cannot self-approve).    */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import { sanitizeText } from "@/lib/validations";
import type { PromoAdPlacement, PromoAdStatus, PromotionalAd, PromotionalAdFormData } from "@/types";

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

/** Accepts absolute http(s) URLs or internal relative paths ("/shop/abc"). */
function sanitizeAdLink(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/")) {
    return sanitizeText(trimmed).slice(0, 300);
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href.slice(0, 300);
    }
  } catch { /* fall through */ }
  return "";
}

function sanitizeAdForm(form: PromotionalAdFormData) {
  return {
    title: sanitizeText(form.title).slice(0, 120),
    subtitle: form.subtitle ? sanitizeText(form.subtitle).slice(0, 220) : null,
    image_url: sanitizeAdLink(form.image_url) || form.image_url.trim().slice(0, 500),
    link_url: sanitizeAdLink(form.link_url) || "/",
    badge_label: form.badge_label ? sanitizeText(form.badge_label).slice(0, 24) : null,
    placement: (form.placement === "homepage_feed" ? "homepage_feed" : "homepage_top") as PromoAdPlacement,
    starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
    ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Public read (homepage carousel)                                           */
/* -------------------------------------------------------------------------- */

/**
 * Fetch currently live, approved, in-date ads for a given placement.
 * RLS already restricts this to `status = 'approved' AND is_active = true`
 * within the active date window — no extra filtering needed here.
 */
export async function fetchActiveAds(
  placement: PromoAdPlacement = "homepage_top",
): Promise<ServiceResult<PromotionalAd[]>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("promotional_ads")
      .select("*")
      .eq("placement", placement)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(12);

    if (error) throw error;
    return { success: true, data: (data as PromotionalAd[]) ?? [] };
  } catch (err) {
    logError(err, { module: "adsService.fetchActiveAds", meta: { placement } });
    return { success: false, error: toError(err) };
  }
}

/** Best-effort impression ping — never throws, safe to fire on render. */
export async function pingAdImpression(adId: string): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.rpc("increment_ad_impression", { p_ad_id: adId });
  } catch { /* analytics only — never block the UI */ }
}

/** Best-effort click ping — never throws, safe to fire before navigation. */
export async function pingAdClick(adId: string): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.rpc("increment_ad_click", { p_ad_id: adId });
  } catch { /* analytics only — never block the UI */ }
}

/* -------------------------------------------------------------------------- */
/*  Merchant management                                                       */
/* -------------------------------------------------------------------------- */

export async function fetchShopAds(shopId: string): Promise<ServiceResult<PromotionalAd[]>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("promotional_ads")
      .select("*")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, data: (data as PromotionalAd[]) ?? [] };
  } catch (err) {
    logError(err, { module: "adsService.fetchShopAds", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}

export async function createAdRequest(
  shopId: string,
  form: PromotionalAdFormData,
): Promise<ServiceResult<PromotionalAd>> {
  const supabase = createClient();
  try {
    const sanitized = sanitizeAdForm(form);
    if (!sanitized.title) return { success: false, error: "Please enter a title for your ad." };
    if (!sanitized.image_url) return { success: false, error: "Please upload a banner image." };

    const { data, error } = await supabase
      .from("promotional_ads")
      .insert({ shop_id: shopId, ...sanitized })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as PromotionalAd };
  } catch (err) {
    logError(err, { module: "adsService.createAdRequest", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}

export async function updateAdCreative(
  adId: string,
  form: PromotionalAdFormData,
): Promise<ServiceResult<PromotionalAd>> {
  const supabase = createClient();
  try {
    const sanitized = sanitizeAdForm(form);
    const { data, error } = await supabase
      .from("promotional_ads")
      .update(sanitized)
      .eq("id", adId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as PromotionalAd };
  } catch (err) {
    logError(err, { module: "adsService.updateAdCreative", meta: { adId } });
    return { success: false, error: toError(err) };
  }
}

export async function setAdActive(adId: string, isActive: boolean): Promise<ServiceResult<null>> {
  const supabase = createClient();
  try {
    const { error } = await supabase
      .from("promotional_ads")
      .update({ is_active: isActive })
      .eq("id", adId);

    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "adsService.setAdActive", meta: { adId, isActive } });
    return { success: false, error: toError(err) };
  }
}

export async function deleteAd(adId: string): Promise<ServiceResult<null>> {
  const supabase = createClient();
  try {
    const { error } = await supabase.from("promotional_ads").delete().eq("id", adId);
    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "adsService.deleteAd", meta: { adId } });
    return { success: false, error: toError(err) };
  }
}

/* -------------------------------------------------------------------------- */
/*  Admin management                                                          */
/* -------------------------------------------------------------------------- */

export async function fetchAllAdsForAdmin(): Promise<ServiceResult<PromotionalAd[]>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("promotional_ads")
      .select("*, shops(name)")
      .order("created_at", { ascending: false });

    if (error) throw error;
    const rows = ((data as Array<Record<string, unknown>>) ?? []).map((row) => ({
      ...row,
      shop_name: (row.shops as { name?: string } | null)?.name ?? "Platform Ad",
    })) as PromotionalAd[];
    return { success: true, data: rows };
  } catch (err) {
    logError(err, { module: "adsService.fetchAllAdsForAdmin" });
    return { success: false, error: toError(err) };
  }
}

export async function reviewAd(
  adId: string,
  decision: PromoAdStatus,
  rejectionReason?: string,
): Promise<ServiceResult<null>> {
  const supabase = createClient();
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("promotional_ads")
      .update({
        status: decision,
        reviewed_by: user?.id ?? null,
        reviewed_at: new Date().toISOString(),
        rejection_reason: decision === "rejected" ? sanitizeText(rejectionReason ?? "").slice(0, 300) || null : null,
      })
      .eq("id", adId);

    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "adsService.reviewAd", meta: { adId, decision } });
    return { success: false, error: toError(err) };
  }
}

/** Admin-only: create a platform-wide "house ad" (shop_id = NULL), pre-approved. */
export async function createPlatformAd(
  form: PromotionalAdFormData,
  sortOrder: number = 0,
): Promise<ServiceResult<PromotionalAd>> {
  const supabase = createClient();
  try {
    const sanitized = sanitizeAdForm(form);
    if (!sanitized.title) return { success: false, error: "Please enter a title for the ad." };
    if (!sanitized.image_url) return { success: false, error: "Please upload a banner image." };

    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("promotional_ads")
      .insert({
        shop_id: null,
        ...sanitized,
        sort_order: sortOrder,
        status: "approved",
        reviewed_by: user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as PromotionalAd };
  } catch (err) {
    logError(err, { module: "adsService.createPlatformAd" });
    return { success: false, error: toError(err) };
  }
}

export async function setAdSortOrder(adId: string, sortOrder: number): Promise<ServiceResult<null>> {
  const supabase = createClient();
  try {
    const { error } = await supabase
      .from("promotional_ads")
      .update({ sort_order: sortOrder })
      .eq("id", adId);

    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "adsService.setAdSortOrder", meta: { adId, sortOrder } });
    return { success: false, error: toError(err) };
  }
}
