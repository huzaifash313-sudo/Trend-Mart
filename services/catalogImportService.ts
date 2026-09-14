/**
 * Import curated starter catalogs into a merchant shop.
 */

import {
  getGroceryStarterPack,
  groceryStarterImageUrl,
  type GroceryStarterItem,
} from "@/lib/catalog/groceryStarterPack";
import { createProduct, fetchProductsByShopId } from "@/services/productService";
import { fetchSubCategories } from "@/services/subCategoryService";
import type { ProductFormData } from "@/types";

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type StarterImportProgress = {
  total: number;
  done: number;
  created: number;
  skipped: number;
  failed: number;
};

export type StarterImportResult = {
  created: number;
  skipped: number;
  failed: number;
  total: number;
};

function itemToForm(
  item: GroceryStarterItem,
  subCategoryId: string | null,
): ProductFormData {
  const image = groceryStarterImageUrl(item.imageKey);
  return {
    name: item.name,
    title: item.name,
    description: `${item.description} · Unit: ${item.unit} · Internal code: ${item.barcode}`,
    price: item.price,
    image_url: image,
    images: [image],
    is_available: true,
    category_id: "Grocery & Kiryana",
    sub_category_id: subCategoryId,
    barcode: item.barcode,
  };
}

/**
 * Import grocery loose/staples pack with internal TMG-#### barcodes.
 * Skips rows that already exist by barcode or exact name (case-insensitive).
 */
export async function importGroceryStarterPack(
  shopId: string,
  opts?: {
    onProgress?: (p: StarterImportProgress) => void;
  },
): Promise<ServiceResult<StarterImportResult>> {
  const pack = getGroceryStarterPack();
  const existing = await fetchProductsByShopId(shopId);
  if (!existing.success) {
    return { success: false, error: existing.error };
  }

  const byBarcode = new Set(
    existing.data
      .map((p) => (p.barcode || "").trim().toLowerCase())
      .filter(Boolean),
  );
  const byName = new Set(
    existing.data.map((p) => p.name.trim().toLowerCase()).filter(Boolean),
  );

  const subs = await fetchSubCategories("Grocery & Kiryana");
  const subByName = new Map<string, string>();
  if (subs.success) {
    for (const s of subs.data) {
      subByName.set(s.name.trim().toLowerCase(), s.id);
    }
  }

  let created = 0;
  let skipped = 0;
  let failed = 0;
  const total = pack.length;

  const report = (done: number) => {
    opts?.onProgress?.({ total, done, created, skipped, failed });
  };

  for (let i = 0; i < pack.length; i++) {
    const item = pack[i];
    const bc = item.barcode.trim().toLowerCase();
    const nm = item.name.trim().toLowerCase();

    if (byBarcode.has(bc) || byName.has(nm)) {
      skipped += 1;
      report(i + 1);
      continue;
    }

    // Fuzzy sub-category: exact name, else first that includes a keyword
    let subId: string | null =
      subByName.get(item.subCategory.toLowerCase()) ?? null;
    if (!subId && subs.success) {
      const key = item.subCategory.split("/")[0]?.trim().toLowerCase() ?? "";
      const hit = subs.data.find((s) =>
        s.name.toLowerCase().includes(key.split(" ")[0] || "___"),
      );
      subId = hit?.id ?? null;
    }

    const form = itemToForm(item, subId);
    const res = await createProduct(shopId, form);
    if (res.success) {
      created += 1;
      byBarcode.add(bc);
      byName.add(nm);
    } else {
      failed += 1;
    }
    report(i + 1);
  }

  return {
    success: true,
    data: { created, skipped, failed, total },
  };
}

export { groceryStarterPackCount } from "@/lib/catalog/groceryStarterPack";
