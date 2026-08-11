/* -------------------------------------------------------------------------- */
/*  TrendMart — Story Service Layer                                           */
/*  Handles 24-hour merchant story operations.                                */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import type { Story } from "@/types";
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
function mapStoryRow(row: Record<string, unknown>): Story {
  const shop = row.shops as { name?: string; logo_url?: string | null } | null | undefined;
  return {
    id: String(row.id),
    shop_id: String(row.shop_id),
    image_url: (row.image_url as string | null) ?? null,
    caption: (row.caption as string | null) ?? null,
    created_at: (row.created_at as string | undefined) ?? undefined,
    expires_at: (row.expires_at as string | undefined) ?? undefined,
    shop_name: shop?.name ?? null,
    shop_logo_url: shop?.logo_url ?? null,
  };
}

export async function fetchActiveStories(): Promise<ServiceResult<Story[]>> {
  const supabase = createClient();

  try {
    // Prefer join so tray/viewer can show merchant shop name
    const withShop = await supabase
      .from("stories")
      .select("*, shops:shop_id ( name, logo_url )")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

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
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, data: (data as Story[]) ?? [] };
  } catch (err) {
    logError(err, { module: "storyService.fetchActiveStories" });
    return { success: false, error: toError(err) };
  }
}

/**
 * Fetch active stories for a single shop.
 */
export async function fetchStoriesByShopId(
  shopId: string,
): Promise<ServiceResult<Story[]>> {
  const supabase = createClient();

  try {
    const { data, error } = await supabase
      .from("stories")
      .select("*")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, data: (data as Story[]) ?? [] };
  } catch (err) {
    logError(err, { module: "storyService.fetchStoriesByShopId", meta: { shopId } });
    return { success: false, error: toError(err) };
  }
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Authenticated Mutations (called from dashboard)                            */
/* ──────────────────────────────────────────────────────────────────────────── */

/**
 * Create a new story for a shop.
 * Strict rule: one active story per shop — replace any existing ones first.
 * RLS ensures only the shop owner can insert/delete.
 */
export async function createStory(
  shopId: string,
  imageUrl: string,
  caption: string,
): Promise<ServiceResult<Story>> {
  const supabase = createClient();

  try {
    // Enforce 1 active story per merchant store
    const { data: existing } = await supabase
      .from("stories")
      .select("id")
      .eq("shop_id", shopId);

    if (existing && existing.length > 0) {
      const ids = existing.map((row) => String(row.id));
      const { error: deleteError } = await supabase
        .from("stories")
        .delete()
        .in("id", ids);
      if (deleteError) throw deleteError;
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
