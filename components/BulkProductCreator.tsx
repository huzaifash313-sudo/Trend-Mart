"use client";

/* -------------------------------------------------------------------------- */
/*  Multi-item batch product creator                                           */
/*  Desktop: one product = one wide table row · Mobile: stacked cards          */
/* -------------------------------------------------------------------------- */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { PriceTier, ProductFormData, VariantGroup } from "@/types";
import {
  fetchSubCategories,
  getOthersSubCategoryId,
  resolveSubCategoryId,
  type SubCategoryWithMeta,
} from "@/services/subCategoryService";
import { bulkCreateProducts } from "@/services/productService";
import { isValidUUID } from "@/lib/sanitization";
import MultiImageUpload from "@/components/MultiImageUpload";
import VariantEditor from "@/components/VariantEditor";
import PriceTierEditor from "@/components/PriceTierEditor";
import { normalizeProductGallery } from "@/lib/productImages";
import { normalizeTiers } from "@/lib/priceTiers";
import { getProductNamePlaceholder } from "@/lib/productPlaceholders";
import CustomSelect from "@/components/CustomSelect";
import {
  cloneVariantGroups,
  getVariantTemplates,
  sanitizeVariantGroups,
  type VariantTemplatePack,
} from "@/lib/variantTemplates";

export interface BulkProductCreatorProps {
  shopId: string;
  shopCategory: string;
  onCreated?: () => void;
  onToast?: (message: string, variant?: "success" | "error" | "info") => void;
}

interface BulkRow {
  key: string;
  name: string;
  description: string;
  sub_category_id: string;
  price: string;
  original_price: string;
  deal_expires_at: string;
  images: string[];
  variants: VariantGroup[];
  price_tiers: PriceTier[];
}

function newRow(defaultSubId = ""): BulkRow {
  return {
    key: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    description: "",
    sub_category_id: defaultSubId,
    price: "",
    original_price: "",
    deal_expires_at: "",
    images: [],
    variants: [],
    price_tiers: [],
  };
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fieldClass =
  "w-full min-w-0 rounded-lg border border-teal-200/70 bg-white px-2.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-300/50 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-teal-900/50 dark:bg-zinc-900 dark:text-zinc-100";

const labelClass =
  "mb-1 block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400";

export default function BulkProductCreator({
  shopId,
  shopCategory,
  onCreated,
  onToast,
}: BulkProductCreatorProps) {
  const [subs, setSubs] = useState<SubCategoryWithMeta[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(true);
  const [rows, setRows] = useState<BulkRow[]>([newRow()]);
  const [saving, setSaving] = useState(false);
  const [defaultSubId, setDefaultSubId] = useState("");
  const [expandedVariants, setExpandedVariants] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!shopCategory) {
        setSubs([]);
        setLoadingSubs(false);
        return;
      }
      setLoadingSubs(true);
      const result = await fetchSubCategories(shopCategory);
      if (cancelled) return;
      if (result.success) {
        setSubs(result.data);
        const others = result.data.find((s) => s.is_others);
        const id = others?.id ?? result.data[0]?.id ?? "";
        setDefaultSubId(id);
        setRows((prev) =>
          prev.map((r) => (r.sub_category_id ? r : { ...r, sub_category_id: id })),
        );
      } else {
        setSubs([]);
        onToast?.(result.error, "error");
      }
      setLoadingSubs(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [shopCategory, onToast]);

  const updateRow = useCallback((key: string, patch: Partial<BulkRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, newRow(defaultSubId)]);
  }, [defaultSubId]);

  const addFiveRows = useCallback(() => {
    setRows((prev) => [...prev, ...Array.from({ length: 5 }, () => newRow(defaultSubId))]);
  }, [defaultSubId]);

  const removeRow = useCallback((key: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  }, []);

  const toggleVariants = useCallback((key: string) => {
    setExpandedVariants((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const anyVariants = useMemo(
    () => rows.some((r) => r.variants.length > 0 || r.price_tiers.length > 0),
    [rows],
  );

  const copyVariantsToAll = useCallback(() => {
    const source = rows.find((r) => r.variants.length > 0 || r.price_tiers.length > 0);
    if (!source) return;
    setRows((prev) =>
      prev.map((r) =>
        r.key === source.key
          ? r
          : {
              ...r,
              variants: JSON.parse(JSON.stringify(source.variants)),
              price_tiers: JSON.parse(JSON.stringify(source.price_tiers)),
            },
      ),
    );
  }, [rows]);

  const clearAllVariants = useCallback(() => {
    setRows((prev) => prev.map((r) => ({ ...r, variants: [], price_tiers: [] })));
  }, []);

  const categoryPacks = useMemo(
    () => getVariantTemplates(shopCategory),
    [shopCategory],
  );

  const applyPackToAllRows = useCallback(
    (pack: VariantTemplatePack) => {
      setRows((prev) => {
        const next = prev.map((r) => ({
          ...r,
          variants: cloneVariantGroups(pack.groups),
        }));
        setExpandedVariants((exp) => {
          const opened = { ...exp };
          for (const r of next) opened[r.key] = true;
          return opened;
        });
        return next;
      });
      onToast?.(
        `"${pack.label}" options har row pe lag gaye — chips se hata / add kar lo.`,
        "success",
      );
    },
    [onToast],
  );

  const applyPackToEmptyRows = useCallback(
    (pack: VariantTemplatePack) => {
      const emptyCount = rows.filter((r) => r.variants.length === 0).length;
      if (emptyCount === 0) {
        onToast?.("Har row pe pehle se options hain.", "info");
        return;
      }
      setRows((prev) => {
        const next = prev.map((r) =>
          r.variants.length > 0
            ? r
            : { ...r, variants: cloneVariantGroups(pack.groups) },
        );
        setExpandedVariants((exp) => {
          const opened = { ...exp };
          for (const r of next) {
            if (r.variants.length > 0) opened[r.key] = true;
          }
          return opened;
        });
        return next;
      });
      onToast?.(
        `"${pack.label}" ${emptyCount} empty row(s) pe lagaya.`,
        "success",
      );
    },
    [rows, onToast],
  );

  const filledCount = useMemo(
    () => rows.filter((r) => r.name.trim() && Number(r.price) > 0).length,
    [rows],
  );

  const handleSubmit = useCallback(async () => {
    if (!shopId) {
      onToast?.("Select a shop first.", "error");
      return;
    }
    if (!shopCategory) {
      onToast?.("Set your shop category in Store Settings first.", "error");
      return;
    }

    const validRows = rows.filter((r) => r.name.trim() && Number(r.price) > 0);
    if (validRows.length === 0) {
      onToast?.("Fill at least one row with a name and price.", "error");
      return;
    }

        setSaving(true);

    const forms: ProductFormData[] = [];
    for (const r of validRows) {
      const price = Number(r.price);
      const original = r.original_price.trim() ? Number(r.original_price) : null;
      const hasDeal =
        original != null && Number.isFinite(original) && original > price;
      let subId =
        r.sub_category_id && isValidUUID(r.sub_category_id)
          ? r.sub_category_id
          : await resolveSubCategoryId(shopCategory, r.sub_category_id);

      if (!subId || !isValidUUID(subId)) {
        const othersFallback = await getOthersSubCategoryId(shopCategory);
        subId = isValidUUID(othersFallback) ? othersFallback : null;
      }

      const gallery = normalizeProductGallery(r.images);
      const cleanTiers = normalizeTiers(r.price_tiers);

      forms.push({
        name: r.name.trim(),
        description: r.description.trim(),
        price,
        original_price: hasDeal ? original : null,
        deal_expires_at:
          hasDeal && r.deal_expires_at.trim()
            ? new Date(r.deal_expires_at).toISOString()
            : null,
        image_url: gallery.image_url,
        images: gallery.images,
        is_available: true,
        category_id: shopCategory,
        sub_category_id: subId,
        variants: sanitizeVariantGroups(r.variants),
        price_tiers: cleanTiers.length > 0 ? cleanTiers : null,
      });
    }

    const result = await bulkCreateProducts(shopId, forms);
    setSaving(false);

    if (!result.success) {
      onToast?.(result.error, "error");
      return;
    }

    const { created, failed } = result.data;
    if (failed.length === 0) {
      onToast?.(`${created.length} product${created.length === 1 ? "" : "s"} added!`, "success");
    } else {
      onToast?.(
        `${created.length} added, ${failed.length} failed (check names/prices).`,
        "info",
      );
    }

    setRows([newRow(defaultSubId)]);
    setExpandedVariants({});
    onCreated?.();
  }, [shopId, shopCategory, rows, defaultSubId, onToast, onCreated]);

  const subSelectOptions = [
    ...(subs.length === 0 ? [{ value: "", label: "No sub-categories" }] : []),
    ...subs.map((s) => ({
      value: s.id,
      label: `${s.icon ? `${s.icon} ` : ""}${s.name}`,
    })),
  ];

  return (
    <div className="space-y-3 rounded-2xl border border-teal-200/70 bg-white p-3 shadow-sm dark:border-teal-900/40 dark:bg-[color:var(--tm-surface)] sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            Add Multiple Products
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Store type:{" "}
            <span className="font-semibold text-teal-700 dark:text-teal-300">
              {shopCategory || "—"}
            </span>
            {" · "}Ek line = ek product · upar se Size/Color pack lagao, ya skip karo.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {anyVariants && (
            <>
              <button
                type="button"
                onClick={copyVariantsToAll}
                className="btn-compact rounded-full border border-emerald-200 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                title="Copy the first row's options/variants to every row"
              >
                Copy options to all rows
              </button>
              <button
                type="button"
                onClick={clearAllVariants}
                className="btn-compact rounded-full border border-red-200 px-3 text-xs font-semibold text-red-500 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/40"
              >
                Clear options
              </button>
            </>
          )}
          <button
            type="button"
            onClick={addRow}
            className="btn-compact rounded-full border border-teal-200 px-3 text-xs font-semibold text-teal-800 hover:bg-teal-50 dark:border-teal-800 dark:text-teal-300 dark:hover:bg-teal-950/40"
          >
            + Row
          </button>
          <button
            type="button"
            onClick={addFiveRows}
            className="btn-compact rounded-full border border-teal-200 px-3 text-xs font-semibold text-teal-800 hover:bg-teal-50 dark:border-teal-800 dark:text-teal-300 dark:hover:bg-teal-950/40"
          >
            +5 Rows
          </button>
        </div>
      </div>

      {/* Category option packs — one tap for every / empty rows */}
      {shopCategory && categoryPacks.length > 0 ? (
        <div className="rounded-xl border border-teal-200/80 bg-gradient-to-r from-teal-50/90 to-emerald-50/50 p-3 dark:border-teal-900/50 dark:from-teal-950/40 dark:to-emerald-950/20">
          <p className="text-xs font-bold text-teal-900 dark:text-teal-200">
            Quick options for {shopCategory}
          </p>
          <p className="mt-0.5 text-[11px] text-teal-800/80 dark:text-teal-300/80">
            Ek tap — Size/Color/Portion waghera saari rows pe. Phir chips se jo nahi bechte woh hata do.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {categoryPacks.map((pack) => (
              <div key={pack.id} className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => applyPackToAllRows(pack)}
                  className="rounded-full bg-teal-700 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
                  title={`${pack.hint} — apply to every row`}
                >
                  {pack.label} → all rows
                </button>
                <button
                  type="button"
                  onClick={() => applyPackToEmptyRows(pack)}
                  className="rounded-full border border-teal-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-teal-800 hover:bg-teal-50 dark:border-teal-700 dark:bg-zinc-900 dark:text-teal-300 dark:hover:bg-teal-950/40"
                  title="Only rows that still have no options"
                >
                  Empty only
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {loadingSubs && (
        <p className="animate-pulse text-xs text-zinc-400">Loading sub-categories…</p>
      )}

      {/* Desktop / laptop — wide single-line table */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-teal-100 text-[0.65rem] uppercase tracking-wider text-zinc-400 dark:border-teal-900/40">
              <th className="min-w-[200px] px-2 py-2 font-semibold">Name *</th>
              <th className="min-w-[160px] px-2 py-2 font-semibold">Sub-category *</th>
              <th className="w-[110px] min-w-[110px] px-2 py-2 font-semibold">Price *</th>
              <th className="w-[110px] min-w-[110px] px-2 py-2 font-semibold">Was</th>
              <th className="w-[190px] min-w-[190px] px-2 py-2 font-semibold">Deal ends</th>
              <th className="min-w-[280px] px-2 py-2 font-semibold">Photos</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const priceN = Number(row.price);
              const wasN = Number(row.original_price);
              const dealOk =
                !!row.original_price && Number.isFinite(wasN) && wasN > priceN;
              return (
                <Fragment key={row.key}>
                <tr
                  className="border-b border-zinc-100 align-top dark:border-[color:var(--tm-border)]"
                >
                  <td className="px-2 py-2.5">
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) => updateRow(row.key, { name: e.target.value })}
                      placeholder={`Product ${idx + 1} name`}
                      className={fieldClass}
                    />
                    <input
                      type="text"
                      value={row.description}
                      onChange={(e) =>
                        updateRow(row.key, { description: e.target.value })
                      }
                      maxLength={300}
                      placeholder="Description"
                      className={`${fieldClass} mt-1.5`}
                    />
                    <button
                      type="button"
                      onClick={() => toggleVariants(row.key)}
                      className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold ${
                        row.variants.length > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400"
                      }`}
                    >
                      <span className={`inline-block transition-transform ${expandedVariants[row.key] ? "rotate-90" : ""}`}>▸</span>
                      {row.variants.length > 0
                        ? `Options (${row.variants.reduce((acc, g) => acc + g.options.length, 0)})`
                        : "＋ Add Options / Variants (optional)"}
                    </button>
                  </td>
                  <td className="px-2 py-2.5">
                    <CustomSelect
                      value={row.sub_category_id}
                      onChange={(val) =>
                        updateRow(row.key, { sub_category_id: val })
                      }
                      options={subSelectOptions}
                      disabled={loadingSubs || subs.length === 0}
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={row.price}
                      onChange={(e) => updateRow(row.key, { price: e.target.value })}
                      placeholder="Price"
                      className={fieldClass}
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={row.original_price}
                      onChange={(e) =>
                        updateRow(row.key, { original_price: e.target.value })
                      }
                      placeholder="Original price"
                      className={fieldClass}
                      title="Original / was price"
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <input
                      type="datetime-local"
                      value={
                        row.deal_expires_at
                          ? toDatetimeLocalValue(row.deal_expires_at)
                          : ""
                      }
                      onChange={(e) =>
                        updateRow(row.key, {
                          deal_expires_at: e.target.value
                            ? new Date(e.target.value).toISOString()
                            : "",
                        })
                      }
                      disabled={!dealOk}
                      className={`${fieldClass} disabled:opacity-40`}
                      title="Deal end date"
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <MultiImageUpload
                      label="Photos"
                      urls={row.images}
                      onChange={(urls) => updateRow(row.key, { images: urls })}
                      folder="products"
                      fileIdPrefix={`${shopId}-${row.key}`}
                      variant="compact"
                    />
                  </td>
                  <td className="px-1 py-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      disabled={rows.length <= 1}
                      className="text-lg font-bold leading-none text-red-500 hover:text-red-600 disabled:opacity-30"
                      aria-label="Remove row"
                    >
                      ×
                    </button>
                  </td>
                </tr>
                {expandedVariants[row.key] && (
                  <tr className="border-b border-zinc-100 dark:border-[color:var(--tm-border)]">
                    <td colSpan={7} className="space-y-2 px-2 pb-3 pt-1">
                      <VariantEditor
                        variants={row.variants}
                        onChange={(v) => updateRow(row.key, { variants: v })}
                        shopCategory={shopCategory}
                        basePrice={Number(row.price) || 0}
                        compact
                      />
                      <PriceTierEditor
                        tiers={row.price_tiers}
                        onChange={(t) => updateRow(row.key, { price_tiers: t })}
                        basePrice={Number(row.price) || 0}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
            );
            })}
          </tbody>
        </table>
      </div>

      {/* Phone / tablet — stacked cards (readable on narrow screens) */}
      <div className="space-y-3 lg:hidden">
        {rows.map((row, idx) => {
          const priceN = Number(row.price);
          const wasN = Number(row.original_price);
          const dealOk =
            !!row.original_price && Number.isFinite(wasN) && wasN > priceN;
          return (
            <div
              key={row.key}
              className="space-y-2.5 rounded-2xl border border-teal-200/70 bg-gradient-to-b from-white to-teal-50/30 p-3 dark:border-teal-900/40 dark:from-zinc-900 dark:to-teal-950/20"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-teal-800 dark:text-teal-300">
                  Product {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  disabled={rows.length <= 1}
                  className="text-xs font-semibold text-red-500 disabled:opacity-30"
                >
                  Remove
                </button>
              </div>

              <div>
                <label className={labelClass}>Product name *</label>
                <input
                  type="text"
                  value={row.name}
                  onChange={(e) => updateRow(row.key, { name: e.target.value })}
                  placeholder={getProductNamePlaceholder(shopCategory)}
                  className={fieldClass}
                />
              </div>

              <div>
                <label className={labelClass}>
                  Description <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={row.description}
                  onChange={(e) =>
                    updateRow(row.key, { description: e.target.value })
                  }
                  maxLength={300}
                  placeholder="Short description"
                  className={fieldClass}
                />
              </div>

              <div>
                <label className={labelClass}>Sub-category *</label>
                <CustomSelect
                  value={row.sub_category_id}
                  onChange={(val) =>
                    updateRow(row.key, { sub_category_id: val })
                  }
                  options={subSelectOptions}
                  disabled={loadingSubs || subs.length === 0}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Price (PKR) *</label>
                  <input
                    type="number"
                    min={0}
                    value={row.price}
                    onChange={(e) => updateRow(row.key, { price: e.target.value })}
                    placeholder="Price"
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Was price</label>
                  <input
                    type="number"
                    min={0}
                    value={row.original_price}
                    onChange={(e) =>
                      updateRow(row.key, { original_price: e.target.value })
                    }
                    placeholder="Original price"
                    className={fieldClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Deal ends</label>
                <input
                  type="datetime-local"
                  value={
                    row.deal_expires_at
                      ? toDatetimeLocalValue(row.deal_expires_at)
                      : ""
                  }
                  onChange={(e) =>
                    updateRow(row.key, {
                      deal_expires_at: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : "",
                    })
                  }
                  disabled={!dealOk}
                  className={`${fieldClass} disabled:opacity-40`}
                />
              </div>

              <button
                type="button"
                onClick={() => toggleVariants(row.key)}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-semibold ${
                  row.variants.length > 0
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                    : "border-dashed border-zinc-300 text-zinc-500 dark:border-zinc-600 dark:text-zinc-400"
                }`}
              >
                <span>
                  {row.variants.length > 0
                    ? `Options / Variants (${row.variants.reduce((acc, g) => acc + g.options.length, 0)})`
                    : "＋ Add Options / Variants (optional)"}
                </span>
                <span className={`transition-transform ${expandedVariants[row.key] ? "rotate-180" : ""}`}>▾</span>
              </button>
              {expandedVariants[row.key] && (
                <div className="space-y-2">
                  <VariantEditor
                    variants={row.variants}
                    onChange={(v) => updateRow(row.key, { variants: v })}
                    shopCategory={shopCategory}
                    basePrice={Number(row.price) || 0}
                    compact
                  />
                  <PriceTierEditor
                    tiers={row.price_tiers}
                    onChange={(t) => updateRow(row.key, { price_tiers: t })}
                    basePrice={Number(row.price) || 0}
                  />
                </div>
              )}

              <MultiImageUpload
                label="Product photos"
                urls={row.images}
                onChange={(urls) => updateRow(row.key, { images: urls })}
                folder="products"
                fileIdPrefix={`${shopId}-${row.key}`}
                variant="compact"
              />
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-teal-100 pt-3 dark:border-teal-900/40">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {filledCount} ready · {rows.length} row{rows.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving || filledCount === 0 || loadingSubs}
          className="tm-cta inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {saving
            ? "Saving…"
            : `Done · Save ${filledCount || ""} Product${filledCount === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
