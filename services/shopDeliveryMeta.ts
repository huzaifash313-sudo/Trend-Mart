import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export interface ShopDeliveryMeta {
  free_delivery_threshold: number | null;
  delivery_fee_flat: number | null;
  delivery_fee_per_km: number | null;
}

/** Batch delivery / free-delivery fields for marketplace tickers. */
export async function fetchShopDeliveryMetaForIds(
  shopIds: string[],
): Promise<ServiceResult<Record<string, ShopDeliveryMeta>>> {
  const unique = [...new Set(shopIds.filter(Boolean))];
  if (!unique.length) return { success: true, data: {} };

  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("shops")
      .select("id, free_delivery_threshold, delivery_fee_flat, delivery_fee_per_km")
      .in("id", unique);

    if (error) throw error;

    const map: Record<string, ShopDeliveryMeta> = {};
    for (const row of (data as Array<Record<string, unknown>>) ?? []) {
      const id = String(row.id);
      map[id] = {
        free_delivery_threshold:
          row.free_delivery_threshold == null
            ? null
            : Number(row.free_delivery_threshold) || null,
        delivery_fee_flat:
          row.delivery_fee_flat == null ? null : Number(row.delivery_fee_flat) || null,
        delivery_fee_per_km:
          row.delivery_fee_per_km == null ? null : Number(row.delivery_fee_per_km) || null,
      };
    }
    return { success: true, data: map };
  } catch (err) {
    logError(err, {
      module: "shopService.fetchShopDeliveryMetaForIds",
      meta: { count: unique.length },
    });
    return { success: false, error: err instanceof Error ? err.message : "Failed to load delivery." };
  }
}
