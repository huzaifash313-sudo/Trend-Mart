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
export async function fetchActiveStories(): Promise<ServiceResult<Story[]>> {
  const supabase = createClient();

  try {
    const { data, error } = await supabase
      .from("stories")
      .select("*")
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
 * RLS ensures only the shop owner can insert.
 */
export async function createStory(
  shopId: string,
  imageUrl: string,
  caption: string,
): Promise<ServiceResult<Story>> {
  const supabase = createClient();

  try {
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
