/* Offline POS sale queue — sync when back online */

import type { PosOfflineSale } from "@/lib/pos/types";

function key(shopId: string) {
  return `trendsmart_pos_offline_${shopId}`;
}

export function loadOfflineQueue(shopId: string): PosOfflineSale[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key(shopId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PosOfflineSale[];
    return Array.isArray(parsed) ? parsed.slice(0, 40) : [];
  } catch {
    return [];
  }
}

export function saveOfflineQueue(shopId: string, items: PosOfflineSale[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key(shopId), JSON.stringify(items.slice(0, 40)));
  } catch {
    /* ignore */
  }
}

export function enqueueOfflineSale(shopId: string, payload: Record<string, unknown>) {
  const items = loadOfflineQueue(shopId);
  items.unshift({
    id: `off_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    payload,
    createdAt: new Date().toISOString(),
  });
  saveOfflineQueue(shopId, items);
  return items;
}

export function removeOfflineSale(shopId: string, id: string) {
  const items = loadOfflineQueue(shopId).filter((x) => x.id !== id);
  saveOfflineQueue(shopId, items);
  return items;
}
