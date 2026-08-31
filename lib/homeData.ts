/* -------------------------------------------------------------------------- */
/*  TrendsMart — Homepage server-side data                                      */
/*                                                                             */
/*  Server Component support for the storefront: fetches the core homepage     */
/*  datasets (public shops + active stories) on the server so the first paint  */
/*  ships real content instead of skeletons, and seeds the client React Query  */
/*  cache with `initialData` (no duplicate network round-trip).                */
/*                                                                             */
/*  SCALABILITY: the public catalog (shops + stories) is cached for 5 minutes  */
/*  with `unstable_cache` using a plain anon client (no cookies), so 1,000s of */
/*  concurrent anonymous homepage hits are served from the Next.js data cache  */
/*  instead of hammering Supabase. Only the per-request merchant-shop lookup   */
/*  (which needs auth cookies) stays dynamic.                                  */
/* -------------------------------------------------------------------------- */

import { unstable_cache } from "next/cache";
import { createClient as createAnonClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Shop, Story } from "@/types";

export interface HomeInitialData {
  shops: Shop[];
  stories: Story[];
  /** Merchant's own shop id (server-resolved) so their store never flickers
   *  into the public grid before the client auth query resolves. */
  myShopId: string | null;
}

/** Anon-only client for cacheable public queries — no cookies, no session. */
function createPublicClient(): AnonClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) return null;
  return createAnonClient(url, key, { auth: { persistSession: false } });
}

type AnonClient = SupabaseClient;

/** Mirrors `shopService.fetchShops({ publicOnly: true })` row shape. */
const SHOP_LIST_SELECT = [
  "id",
  "name",
  "slug",
  "category",
  "location",
  "logo_url",
  "banner_url",
  "is_live",
  "verification_status",
  "latitude",
  "longitude",
  "service_radius_km",
  "delivery_zones",
  "address_display",
  "free_delivery_threshold",
  "delivery_fee_flat",
  "delivery_fee_per_km",
  "min_order_amount",
  "avg_rating",
  "review_count",
  "announcement",
  "announcement_expires_at",
  "whatsapp_number",
  "created_at",
].join(", ");

async function fetchPublicShops(supabase: AnonClient): Promise<Shop[]> {
  try {
    const query = supabase
      .from("shops")
      .select(SHOP_LIST_SELECT)
      .eq("is_live", true)
      .eq("verification_status", "approved")
      .order("name", { ascending: true })
      .limit(300);

    const { data, error } = await query;
    if (error && /column .* does not exist|PGRST204|schema cache/i.test(String(error.message))) {
      const retry = await supabase
        .from("shops")
        .select("*")
        .eq("is_live", true)
        .eq("verification_status", "approved")
        .limit(300);
      if (retry.error) throw retry.error;
      return (retry.data as unknown as Shop[]) ?? [];
    }
    if (error) throw error;
    return (data as unknown as Shop[]) ?? [];
  } catch {
    // SSR is a progressive enhancement — fall back to client-side fetch.
    return [];
  }
}

/** Mirrors `storyService.fetchActiveStories()` (join + mapping). */
async function fetchActiveStories(supabase: AnonClient): Promise<Story[]> {
  try {
    const withShop = await supabase
      .from("stories")
      .select(
        "*, shops:shop_id ( name, logo_url, latitude, longitude, service_radius_km, delivery_zones, location, is_live, verification_status )",
      )
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(150);

    if (!withShop.error && withShop.data) {
      return (withShop.data as Record<string, unknown>[]).map((row) => {
        const shop = row.shops as Record<string, unknown> | null | undefined;
        return {
          id: String(row.id),
          shop_id: String(row.shop_id),
          image_url: (row.image_url as string | null) ?? null,
          caption: (row.caption as string | null) ?? null,
          created_at: (row.created_at as string | undefined) ?? undefined,
          expires_at: (row.expires_at as string | undefined) ?? undefined,
          shop_name: (shop?.name as string | null) ?? null,
          shop_logo_url: (shop?.logo_url as string | null) ?? null,
          shop_latitude: typeof shop?.latitude === "number" ? (shop.latitude as number) : null,
          shop_longitude: typeof shop?.longitude === "number" ? (shop.longitude as number) : null,
          shop_service_radius_km:
            typeof shop?.service_radius_km === "number" ? (shop.service_radius_km as number) : null,
          shop_delivery_zones: Array.isArray(shop?.delivery_zones)
            ? (shop.delivery_zones as string[])
            : null,
          shop_location: (shop?.location as string | null) ?? null,
          shop_is_live: (shop?.is_live as boolean | null) ?? null,
          shop_verification_status: (shop?.verification_status as string | null) ?? null,
        } as Story;
      });
    }

    const { data, error } = await supabase
      .from("stories")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(150);
    if (error) throw error;
    return (data as unknown as Story[]) ?? [];
  } catch {
    return [];
  }
}

/**
 * Cached public catalog — served from the data cache for 5 minutes.
 * Wrapped functions must not touch request-scoped APIs (cookies), so they use
 * the anon-only client. Safe to call on every homepage request.
 */
const getCachedCatalog = unstable_cache(
  async (): Promise<{ shops: Shop[]; stories: Story[] }> => {
    const supabase = createPublicClient();
    if (!supabase) return { shops: [], stories: [] };
    const [shops, stories] = await Promise.all([
      fetchPublicShops(supabase),
      fetchActiveStories(supabase),
    ]);
    return { shops, stories };
  },
  ["home-catalog-v1"],
  { revalidate: 300 }, // 5 minutes
);

/** Resolve the requesting merchant's own shop id (auth-cookie aware). */
async function fetchMyShopId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from("shops")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return (data as { id: string } | null)?.id ?? null;
  } catch {
    return null;
  }
}

/** Fetch everything the homepage needs for a content-rich first paint. */
export async function fetchHomeInitialData(): Promise<HomeInitialData> {
  const [{ shops, stories }, myShopId] = await Promise.all([
    getCachedCatalog(),
    fetchMyShopIdWithCookieCheck(),
  ]);
  return { shops, stories, myShopId };
}

/**
 * Request-scoped wrapper: only performs the auth getUser() when a Supabase
 * session cookie is actually present (guests skip straight to null).
 */
async function fetchMyShopIdWithCookieCheck(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    const hasAuthCookie = store
      .getAll()
      .some((c) => c.name.startsWith("sb-") && c.value.length > 0);
    if (!hasAuthCookie) return null;
    const supabase = await createClient();
    return fetchMyShopId(supabase);
  } catch {
    return null;
  }
}
