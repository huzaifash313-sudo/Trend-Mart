"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Product } from "@/types";
import { createProduct, updateProduct } from "@/services/productService";
import {
  fetchSubCategories,
  getOthersSubCategoryId,
  resolveSubCategoryId,
  type SubCategoryWithMeta,
} from "@/services/subCategoryService";
import { getProductImages, normalizeProductGallery } from "@/lib/productImages";
import MultiImageUpload from "@/components/MultiImageUpload";
import CustomSelect from "@/components/CustomSelect";
import ToggleSwitch from "@/components/ToggleSwitch";
import { useToast } from "@/components/Toast";

/* -------------------------------------------------------------------------- */
/*  Inline product editor — add + edit, rendered right on the store page.     */
/*  No redirect to the dashboard: merchants manage catalog in place.          */
/* -------------------------------------------------------------------------- */

interface ProductEditorModalProps {
  shopId: string;
  shopCategory: string;
  /** When set, edits this product; otherwise creates a new one. */
  product?: Product | null;
  onClose: () => void;
  onSaved: () => void;
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function ProductEditorModal({
  shopId,
  shopCategory,
  product,
  onClose,
  onSaved,
}: ProductEditorModalProps) {
  const { addToast } = useToast();
  const isEdit = Boolean(product);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [gallery, setGallery] = useState<string[]>([]);
  const [isAvailable, setIsAvailable] = useState(true);
  const [subCategoryId, setSubCategoryId] = useState("");
  const [subs, setSubs] = useState<SubCategoryWithMeta[]>([]);
  const [saving, setSaving] = useState(false);

  // Prefill form on open / when switching between products.
  useEffect(() => {
    if (product) {
      const images = getProductImages(product);
      setName(product.name ?? "");
      setDescription(product.description ?? "");
      setPrice(product.price ? String(product.price) : "");
      setOriginalPrice(
        product.original_price != null ? String(product.original_price) : "",
      );
      setGallery(images);
      setIsAvailable(product.is_available !== false);
      setSubCategoryId(product.sub_category_id ?? "");
    } else {
      setName("");
      setDescription("");
      setPrice("");
      setOriginalPrice("");
      setGallery([]);
      setIsAvailable(true);
      setSubCategoryId("");
    }
  }, [product]);

  // Load sub-categories for the shop's main category.
  useEffect(() => {
    let cancelled = false;
    fetchSubCategories(shopCategory).then((result) => {
      if (cancelled || !result.success) return;
      setSubs(result.data);
      if (!isEdit) {
        const others = result.data.find((s) => s.is_others) ?? result.data[0];
        setSubCategoryId((prev) => prev || others?.id || "");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [shopCategory, isEdit]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!name.trim()) {
        addToast("Product name is required.", "error");
        return;
      }
      const parsedPrice = Number(price);
      if (!(parsedPrice > 0)) {
        addToast("Price must be greater than 0.", "error");
        return;
      }

      setSaving(true);

      // Resolve a valid sub-category UUID (or the category "Others" fallback).
      let subId = subCategoryId;
      if (subId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subId)) {
        subId = (await resolveSubCategoryId(shopCategory, subId)) ?? "";
      }
      if (!subId) {
        subId = (await getOthersSubCategoryId(shopCategory)) ?? "";
      }

      const normalized = normalizeProductGallery(gallery);
      const original = originalPrice.trim() ? Number(originalPrice) : null;
      const hasDeal = original != null && Number.isFinite(original) && original > parsedPrice;

      const payload = {
        name: name.trim(),
        description: description.trim(),
        price: parsedPrice,
        original_price: hasDeal ? original : null,
        image_url: normalized.image_url,
        images: normalized.images,
        is_available: isAvailable,
        stock_status: isAvailable ? "in_stock" : "out_of_stock",
        category_id: shopCategory || null,
        sub_category_id: subId || null,
      };

      const result = isEdit && product
        ? await updateProduct(product.id, payload)
        : await createProduct(shopId, payload);

      setSaving(false);

      if (result.success) {
        addToast(isEdit ? "Product updated." : "Product added.", "success");
        window.dispatchEvent(new Event("trendmart:products-updated"));
        onSaved();
      } else {
        addToast(result.error ?? "Failed to save product.", "error");
      }
    },
    [
      name,
      description,
      price,
      originalPrice,
      gallery,
      isAvailable,
      subCategoryId,
      isEdit,
      product,
      shopId,
      shopCategory,
      addToast,
      onSaved,
    ],
  );

  return (
    <div
      className="fixed inset-0 z-[170] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Edit product" : "Add product"}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            {isEdit ? "Edit product" : "Add product"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 p-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Product name *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              placeholder="Product name"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Description <span className="font-normal text-zinc-400">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Short description"
              className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Price (Rs.) *
              </label>
              <input
                type="number"
                min={1}
                step="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                placeholder="Discounted price"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Original price
                <span className="ml-1 font-normal text-zinc-400">(optional)</span>
              </label>
              <input
                type="number"
                min={0}
                step="1"
                value={originalPrice}
                onChange={(e) => setOriginalPrice(e.target.value)}
                placeholder="Original price"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>

          {originalPrice && price && Number(originalPrice) > Number(price) && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
              Badge: -{Math.round(((Number(originalPrice) - Number(price)) / Number(originalPrice)) * 100)}% OFF
            </p>
          )}

          {subs.length > 0 ? (
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Sub-category
              </label>
              <CustomSelect
                value={subCategoryId}
                onChange={setSubCategoryId}
                options={subs.map((s) => ({ value: s.id, label: s.name }))}
              />
            </div>
          ) : null}

          <MultiImageUpload
            urls={gallery}
            onChange={setGallery}
            folder="products"
            fileIdPrefix={`${shopId}-${product?.id ?? "new"}`}
            label="Product photos"
          />

          <ToggleSwitch
            checked={isAvailable}
            onChange={setIsAvailable}
            label="Toggle product availability"
            visibleLabel={isAvailable ? "In stock — available for ordering" : "Out of stock"}
          />

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add product"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
