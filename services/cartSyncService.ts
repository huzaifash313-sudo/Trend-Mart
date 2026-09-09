/* -------------------------------------------------------------------------- */
/*  TrendsMart — Cart DB sync (signed-in users)                                 */
/*  LocalStorage remains source-of-truth for the active session; DB keeps a    */
/*  snapshot so another phone/browser can restore the same cart on login.      */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import type { CartItem } from "@/store/cartStore";

const MAX_ITEMS = 80;

function sanitizeItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const out: CartItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.slice(0, 200) : "";
    const productId = typeof r.productId === "string" ? r.productId.slice(0, 200) : "";
    const shopId = typeof r.shopId === "string" ? r.shopId.slice(0, 200) : "";
    const name = typeof r.name === "string" ? r.name.slice(0, 200) : "";
    if (!id || !productId || !shopId || !name) continue;
    const quantity = Math.max(1, Math.min(99, Math.round(Number(r.quantity) || 1)));
    const price = Math.max(0, Number(r.price) || 0);
    out.push({
      id,
      productId,
      shopId,
      shopName: typeof r.shopName === "string" ? r.shopName.slice(0, 200) : "Shop",
      shopWhatsapp: typeof r.shopWhatsapp === "string" ? r.shopWhatsapp.slice(0, 50) : "",
      name,
      price,
      basePrice: r.basePrice != null ? Number(r.basePrice) || price : price,
      originalPrice: r.originalPrice != null ? Number(r.originalPrice) : null,
      imageUrl: typeof r.imageUrl === "string" ? r.imageUrl.slice(0, 500) : null,
      quantity,
      variant: typeof r.variant === "string" ? r.variant.slice(0, 220) : undefined,
      notes: typeof r.notes === "string" ? r.notes.slice(0, 200) : undefined,
      currency: typeof r.currency === "string" ? r.currency.slice(0, 10) : undefined,
      shortCode: typeof r.shortCode === "string" ? r.shortCode.slice(0, 32) : null,
      priceTiers: Array.isArray(r.priceTiers) ? (r.priceTiers as CartItem["priceTiers"]) : null,
    });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

function mergeCartItems(local: CartItem[], remote: CartItem[]): CartItem[] {
  const map = new Map<string, CartItem>();
  for (const item of remote) map.set(item.id, item);
  for (const item of local) {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
      continue;
    }
    // Prefer the newer-looking line: same id → keep local (this device's last edit)
    // without inflating quantity via Math.max across devices.
    map.set(item.id, { ...existing, ...item });
  }
  return Array.from(map.values()).slice(0, MAX_ITEMS);
}

/** Load remote cart and merge into local items. Returns merged list. */
export async function pullAndMergeCart(localItems: CartItem[]): Promise<CartItem[]> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return localItems;

    const { data, error } = await supabase
      .from("customer_carts")
      .select("items")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data) return localItems;
    const remote = sanitizeItems((data as { items?: unknown }).items);
    if (remote.length === 0) return localItems;
    return mergeCartItems(localItems, remote);
  } catch {
    return localItems;
  }
}

/** Persist current cart snapshot for the signed-in user (best-effort). */
export async function pushCartToDb(items: CartItem[]): Promise<void> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const payload = {
      user_id: user.id,
      items: sanitizeItems(items),
      updated_at: new Date().toISOString(),
    };

    await supabase.from("customer_carts").upsert(payload as never, { onConflict: "user_id" });
  } catch {
    /* offline / table missing — local cart still works */
  }
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;

export function schedulePushCartToDb(items: CartItem[]): void {
  if (typeof window === "undefined") return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void pushCartToDb(items);
  }, 600);
}
