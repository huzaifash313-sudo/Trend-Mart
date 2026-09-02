/* -------------------------------------------------------------------------- */
/*  TrendsMart — Storefront React Query Hooks                                   */
/*                                                                             */
/*  Thin adapters over the existing service layer (`services/*`). Every        */
/*  service returns `{ success, data } | { success, error }`; we unwrap that   */
/*  into a throw-on-error promise so React Query manages loading/error/cache.  */
/* -------------------------------------------------------------------------- */

import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { fetchShops, fetchMyShop } from "@/services/shopService";
import { fetchActiveStories } from "@/services/storyService";
import { fetchActiveDeals } from "@/services/dealService";
import { fetchActiveCouponsForShops } from "@/services/couponService";
import { fetchShopDeliveryMetaForIds } from "@/services/shopDeliveryMeta";
import {
  fetchMarketplaceProducts,
  type MarketplaceProductFilters,
} from "@/services/productService";
import { fetchShopById } from "@/services/shopService";
import { fetchStorefrontDisplayPrefs, type StorefrontDisplayPrefs } from "@/services/themePrefsService";
import { fetchCouponsByShopId, type Coupon } from "@/services/couponService";
import { fetchDealsByShopId } from "@/services/dealService";
import type { ShopDeal } from "@/lib/dealSchedule";
import { createClient } from "@/lib/supabase/client";
import { PUBLIC_SHOP_LIMIT, PUBLIC_SHOP_PAGE_SIZE } from "@/lib/mobilePerf";
import type { Product, Shop, Story } from "@/types";

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/** Adapt a service result into a throw-on-error promise for React Query. */
async function unwrap<T>(promise: Promise<ServiceResult<T>>): Promise<T> {
  const result = await promise;
  if (!result.success) throw new Error(result.error);
  return result.data;
}

/* ── Query keys ────────────────────────────────────────────────────────────── */

/** Normalize a list of IDs into a stable, order-independent cache key. */
function idsKey(ids: string[]): string {
  return [...new Set(ids.filter(Boolean))].sort().join(",");
}

export const queryKeys = {
  shops: ["shops", "public"] as const,
  shopsInfinite: ["shops", "public", "infinite"] as const,
  stories: ["stories"] as const,
  deals: (limit: number) => ["deals", limit] as const,
  coupons: (shopIds: string[]) => ["coupons", idsKey(shopIds)] as const,
  myShop: ["my-shop"] as const,
};

/* ── Shops ─────────────────────────────────────────────────────────────────── */

export function useShops(options?: { initialData?: Shop[] }) {
  return useQuery({
    queryKey: queryKeys.shops,
    queryFn: () => unwrap(fetchShops({ publicOnly: true, limit: PUBLIC_SHOP_LIMIT })),
    staleTime: 2 * 60_000,
    // Keep the previous list on screen during refetch so content never flashes
    // blank / skeletons when a merchant publishes or the user pulls to refresh.
    placeholderData: keepPreviousData,
    ...(options?.initialData !== undefined
      ? { initialData: options.initialData }
      : {}),
  });
}

/** Paginated public shops for the homepage — never downloads the full catalog. */
export function useShopsInfinite(options?: { initialData?: Shop[]; pageSize?: number }) {
  const pageSize = options?.pageSize ?? PUBLIC_SHOP_PAGE_SIZE;
  return useInfiniteQuery({
    queryKey: [...queryKeys.shopsInfinite, pageSize] as const,
    queryFn: ({ pageParam }) =>
      unwrap(
        fetchShops({
          publicOnly: true,
          limit: pageSize,
          offset: pageParam as number,
        }),
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.reduce((n, p) => n + p.length, 0);
      return lastPage.length >= pageSize ? fetched : undefined;
    },
    staleTime: 2 * 60_000,
    placeholderData: keepPreviousData,
    ...(options?.initialData !== undefined
      ? {
          initialData: {
            pages: [options.initialData],
            pageParams: [0],
          },
        }
      : {}),
  });
}

export function useMyShop() {
  return useQuery({
    queryKey: queryKeys.myShop,
    queryFn: async (): Promise<Shop | null> => {
      const result = await fetchMyShop();
      // "Not authenticated" / fetch errors are not UI errors here — just no shop.
      return result.success ? result.data : null;
    },
    retry: false,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

/* ── Enrichment (non-blocking on homepage) ─────────────────────────────────── */

export function useStories(options?: { initialData?: Story[] }) {
  return useQuery({
    queryKey: queryKeys.stories,
    queryFn: () => unwrap(fetchActiveStories()),
    staleTime: 2 * 60_000,
    placeholderData: keepPreviousData,
    ...(options?.initialData !== undefined
      ? { initialData: options.initialData }
      : {}),
  });
}

export function useDeals(limit = 48) {
  return useQuery({
    queryKey: queryKeys.deals(limit),
    queryFn: () => unwrap(fetchActiveDeals(limit)),
    staleTime: 2 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useShopCoupons(shopIds: string[]) {
  return useQuery({
    queryKey: queryKeys.coupons(shopIds),
    queryFn: () => unwrap(fetchActiveCouponsForShops(shopIds)),
    enabled: shopIds.length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useShopDeliveryMeta(shopIds: string[]) {
  return useQuery({
    queryKey: ["delivery-meta", idsKey(shopIds)],
    queryFn: () => unwrap(fetchShopDeliveryMetaForIds(shopIds)),
    enabled: shopIds.length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

/* ── Shop detail page ──────────────────────────────────────────────────────── */

export interface ShopDetailData {
  shop: Shop;
  products: Product[];
  prefs: StorefrontDisplayPrefs;
  coupons: Coupon[];
  deals: ShopDeal[];
  isOwner: boolean;
}

export function useShopDetail(id: string) {
  return useQuery({
    queryKey: ["shop-detail", id],
    queryFn: async (): Promise<ShopDetailData> => {
      const shopResult = await fetchShopById(id);
      if (!shopResult.success) throw new Error(shopResult.error);
      const resolvedShop = shopResult.data.shop;

      const supabase = createClient();
      const [prefs, couponsResult, dealsResult, auth] = await Promise.all([
        fetchStorefrontDisplayPrefs(resolvedShop.id),
        fetchCouponsByShopId(resolvedShop.id),
        fetchDealsByShopId(resolvedShop.id),
        supabase.auth.getUser(),
      ]);

      const uid = auth.data.user?.id;
      return {
        shop: resolvedShop,
        products: shopResult.data.products,
        prefs,
        coupons: couponsResult.success ? couponsResult.data : [],
        deals: dealsResult.success ? dealsResult.data.filter((d) => d.is_active) : [],
        isOwner: Boolean(resolvedShop.owner_id && uid && resolvedShop.owner_id === uid),
      };
    },
    staleTime: 2 * 60_000,
    retry: 1,
  });
}

/* ── Marketplace (products page) ───────────────────────────────────────────── */

export function useMarketplaceProducts(filters: MarketplaceProductFilters) {
  // Build a stable primitive key (NOT the filters object) so the query caches
  // correctly and doesn't refetch on every re-render.
  const queryKey = [
    "marketplace-products",
    filters.query ?? "",
    filters.category ?? "",
    filters.subCategoryId ?? "",
    filters.sort ?? "for_you",
    filters.limit ?? 48,
    filters.availableOnly ?? true,
  ] as const;

  return useQuery({
    queryKey,
    queryFn: () => unwrap(fetchMarketplaceProducts(filters)),
    // Keep the previous list on screen while the next one loads — this is the
    // core fix for the "data disappears then reappears" flicker.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

/**
 * Infinite-scroll marketplace products: fetches pages server-side via a cursor
 * `offset`, so the app scales to large catalogues ("lakh products") without
 * loading everything up front. Pages accumulate in `data.pages`.
 */
export function useMarketplaceProductsInfinite(filters: MarketplaceProductFilters) {
  const pageSize = filters.limit ?? 48;
  const queryKey = [
    "marketplace-products-infinite",
    filters.query ?? "",
    filters.category ?? "",
    filters.subCategoryId ?? "",
    filters.sort ?? "for_you",
    pageSize,
    filters.availableOnly ?? true,
  ] as const;

  return useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      unwrap(fetchMarketplaceProducts({ ...filters, offset: pageParam as number })),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.reduce((n, p) => n + p.length, 0);
      // A full page means there may be more rows to fetch.
      return lastPage.length >= pageSize ? fetched : undefined;
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
