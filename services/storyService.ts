/* -------------------------------------------------------------------------- */
/*  TrendsMart — Story Service Layer                                           */
/*  Handles 24-hour merchant story operations.                                */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import type { Story, StoryQuota } from "@/types";
import { getStoriesQuota } from "@/types";
import { logError } from "@/services/errorService";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Public Queries                                                             */
/* ──────────────────────────────────────────────────────────────────────────── */

/**
 * Fetch all active stories (created within the last 24 hours).
 * The RLS policy on the `stories` table automatically filters expired stories,
 * but we also apply a client-side cutoff as a safety net.
 */
interface StoryShopJoin {
  name?: string | null;
  logo_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  service_radius_km?: number | null;
  delivery_zones?: string[] | null;
  location?: string | null;
  is_live?: boolean | null;
  verification_status?: string | null;
}

function mapStoryRow(row: Record<string, unknown>): Story {
  const shop = (row.shops as StoryShopJoin | StoryShopJoin[] | null | undefined);
  const s = Array.isArray(shop) ? shop[0] : shop;
  return {
    id: String(row.id),
    shop_id: String(row.shop_id),
    image_url: (row.image_url as string | null) ?? null,
    caption: (row.caption as string | null) ?? null,
    created_at: (row.created_at as string | undefined) ?? undefined,
    expires_at: (row.expires_at as string | undefined) ?? undefined,
    shop_name: s?.name ?? null,
    shop_logo_url: s?.logo_url ?? null,
    shop_latitude: typeof s?.latitude === "number" ? s.latitude : null,
    shop_longitude: typeof s?.longitude === "number" ? s.longitude : null,
    shop_service_radius_km:
      typeof s?.service_radius_km === "number" ? s.service_radius_km : null,
    shop_delivery_zones: Array.isArray(s?.delivery_zones)
      ? (s.delivery_zones as string[])
      : null,
    shop_location: s?.location ?? null,
    shop_is_live: s?.is_live ?? null,
    shop_verification_status: s?.verification_status ?? null,
  };
}

export async function fetchActiveStories(): Promise<ServiceResult<Story[]>> {
  const supabase = createClient();

  try {
    // Prefer join so tray/viewer can show merchant shop name + geo for filtering.
    const withShop = await supabase
      .from("stories")
      .select(
        "*, shops:shop_id ( name, logo_url, latitude, longitude, service_radius_km, delivery_zones, location, is_live, verification_status )",
      )
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(150);

    if (!withShop.error && withShop.data) {
      return {
        success: true,
        data: (withShop.data as Record<string, unknown>[]).map(mapStoryRow),
      };
    }

    // Fallback if join fails on older schemas
    const { data, error } = await supabase
      .from("stories")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(150);

    if (error) throw error;
    return { success: true, data: (data as Story[]) ?? [] };
  } catch (err) {
    logError(err, { module: "storyService.fetchActiveStories" });
    return { success: false, error: toError(err) };
  }
}

/**
 * Resolve a shop's story quota + live usage in one round-trip.
 * Drives the merchant UI ("unlimited", "3 live now", …).
 */
export async function fetchShopStoryQuota(
  shopId: string,
): Promise<ServiceResult<StoryQuota>> {
  const supabase = createClient();

  try {
    const { data: shop, error } = await supabase
      .from("shops")
      .select("id, subscription_tier, stories_quota, pro_expires_at")
      .eq("id", shopId)
      .maybeSingle();
    if (error) throw error;

    const { data: stories, error: storiesErr } = await supabase
      .from("stories")
      .select("id, expires_at, created_at")
      .eq("shop_id", shopId);
    if (storiesErr) throw storiesErr;

    const now = Date.now();
    const activeCount = (stories ?? []).filter((s) => {
      if (s.expires_at) return new Date(s.expires_at).getTime() > now;
      return s.created_at
        ? now - new Date(s.created_at).getTime() < 24 * 60 * 60 * 1000
        : true;
    }).length;

    const tier = (shop?.subscription_tier === "pro" ? "pro" : "free") as StoryQuota["tier"];
    const quota = getStoriesQuota(shop);
    const expiry = shop?.pro_expires_at ? new Date(shop.pro_expires_at).getTime() : null;

    return {
      success: true,
      data: {
        tier,
        quota,
        activeCount,
        remaining: Math.max(quota - activeCount, 0),
        isProLapsed: tier === "pro" && expiry !== null && expiry <= now,
      },
    };
  } catch (err) {
    logError(err, { module: "storyService.fetchShopStoryQuota", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Authenticated Mutations (called from dashboard)                            */
/* ──────────────────────────────────────────────────────────────────────────── */

/**
 * Create a new story for a shop.
 * Soft quota enforcement ("help merchants, never harm a business"):
 * posting is ALWAYS allowed, but once a shop hits its story ceiling (an
 * effectively-unlimited soft cap by default) the OLDEST story is replaced
 * first — a merchant is never blocked from refreshing their storefront.
 * RLS ensures only the shop owner can insert/delete.
 */
export async function createStory(
  shopId: string,
  imageUrl: string,
  caption: string,
): Promise<ServiceResult<Story>> {
  const supabase = createClient();

  try {
    const quotaRes = await fetchShopStoryQuota(shopId);
    if (!quotaRes.success) return { success: false, error: quotaRes.error };
    const { quota, activeCount } = quotaRes.data;

    // At the ceiling → drop the oldest story so the new one always lands.
    if (activeCount >= quota) {
      const { data: existing } = await supabase
        .from("stories")
        .select("id")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: true })
        .limit(1);
      const oldestId = existing && existing.length > 0 ? String(existing[0].id) : null;
      if (oldestId) {
        const { error: deleteError } = await supabase
          .from("stories")
          .delete()
          .eq("id", oldestId);
        if (deleteError) throw deleteError;
      }
    }

    const { data, error } = await supabase
      .from("stories")
      .insert({ shop_id: shopId, image_url: imageUrl, caption })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as Story };
  } catch (err) {
    logError(err, { module: "storyService.createStory", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Delete a story by its ID.
 * RLS ensures only the story owner (via shop ownership) can delete.
 */
export async function deleteStory(
  storyId: string,
): Promise<ServiceResult<null>> {
  const supabase = createClient();

  try {
    const { error } = await supabase
      .from("stories")
      .delete()
      .eq("id", storyId);

    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "storyService.deleteStory", meta: { storyId } });
    return { success: false, error: toError(err) };
  }
}
