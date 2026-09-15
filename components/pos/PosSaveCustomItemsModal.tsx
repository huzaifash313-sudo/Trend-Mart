"use client";

/* -------------------------------------------------------------------------- */
/*  After a sale with misc/custom items — offer to save them as real catalog   */
/*  products so they become scannable/reportable next time.                    */
/* -------------------------------------------------------------------------- */

import { useEffect, useMemo, useState } from "react";
import { formatRupees } from "@/lib/formatters";
import {
  fetchSubCategories,
  getOthersSubCategoryId,
  type SubCategoryWithMeta,
} from "@/services/subCategoryService";
import { createProduct } from "@/services/productService";
import { isValidUUID } from "@/lib/sanitization";
import CustomSelect from "@/components/CustomSelect";

export interface PosSaveCustomItemsModalProps {
  shopId: string;
  shopCategory: string;
  items: { name: string; price: number }[];
  onClose: () => void;
  onToast?: (message: string, variant?: "success" | "error" | "info") => void;
}

export default function PosSaveCustomItemsModal({
  shopId,
  shopCategory,
  items,
  onClose,
  onToast,
}: PosSaveCustomItemsModalProps) {
  const [subs, setSubs] = useState<SubCategoryWithMeta[]>([]);
  const [subCategoryId, setSubCategoryId] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((i) => [i.name, true])),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await fetchSubCategories(shopCategory);
      if (cancelled) return;
      if (result.success) {
        setSubs(result.data);
        const others = result.data.find((s) => s.is_others);
        setSubCategoryId(others?.id ?? result.data[0]?.id ?? "");
      }
      const othersId = await getOthersSubCategoryId(shopCategory);
      if (!cancelled && isValidUUID(othersId)) {
        setSubCategoryId((prev) => prev || othersId);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [shopCategory]);

  const subOptions = useMemo(
    () => subs.map((s) => ({ value: s.id, label: `${s.icon ? `${s.icon} ` : ""}${s.name}` })),
    [subs],
  );

  const selectedCount = items.filter((i) => checked[i.name]).length;

  async function handleSave() {
    if (!isValidUUID(subCategoryId)) {
      onToast?.("Pick a sub-category first.", "error");
      return;
    }
    const toSave = items.filter((i) => checked[i.name]);
    if (toSave.length === 0) {
      onToast?.("Select at least one item.", "error");
      return;
    }
    setSaving(true);
    let created = 0;
    for (const item of toSave) {
      const result = await createProduct(shopId, {
        name: item.name,
        description: "",
        price: item.price,
        original_price: null,
        deal_expires_at: null,
        image_url: "",
        images: [],
        is_available: true,
        category_id: shopCategory,
        sub_category_id: subCategoryId,
        variants: [],
        price_tiers: null,
      });
      if (result.success) created++;
    }
    setSaving(false);
    onToast?.(
      created === toSave.length
        ? `${created} product${created === 1 ? "" : "s"} added to catalog.`
        : `${created}/${toSave.length} added — some failed.`,
      created > 0 ? "success" : "error",
    );
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl dark:bg-[color:var(--tm-surface)]">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
          Save custom items to catalog?
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Ye items is bill mein custom the — save karo to agli baar search/scan se add ho saken.
        </p>

        <div className="mt-3 space-y-1.5">
          {items.map((item) => (
            <label
              key={item.name}
              className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-2.5 py-2 text-sm dark:border-zinc-700"
            >
              <span className="flex items-center gap-2 min-w-0">
                <input
                  type="checkbox"
                  checked={!!checked[item.name]}
                  onChange={(e) =>
                    setChecked((prev) => ({ ...prev, [item.name]: e.target.checked }))
                  }
                />
                <span className="truncate font-medium text-zinc-800 dark:text-zinc-100">
                  {item.name}
                </span>
              </span>
              <span className="shrink-0 text-zinc-500">{formatRupees(item.price)}</span>
            </label>
          ))}
        </div>

        <div className="mt-3">
          <label className="mb-1 block text-[11px] font-semibold text-zinc-500">
            Sub-category (for all selected)
          </label>
          <CustomSelect value={subCategoryId} onChange={setSubCategoryId} options={subOptions} />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-zinc-600 dark:text-zinc-300"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || selectedCount === 0}
            className="tm-cta rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {saving ? "Saving…" : `Save ${selectedCount || ""} Product${selectedCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
