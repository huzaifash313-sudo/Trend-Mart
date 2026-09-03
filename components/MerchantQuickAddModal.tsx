"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { PriceTier, VariantGroup } from "@/types";
import { isUnlimitedStoryQuota } from "@/types";
import { useMerchantQuickAdd } from "@/context/MerchantQuickAddContext";
import { createProduct } from "@/services/productService";
import { createStory, fetchShopStoryQuota } from "@/services/storyService";
import {
  fetchSubCategories,
  type SubCategoryWithMeta,
} from "@/services/subCategoryService";
import BulkProductCreator from "@/components/BulkProductCreator";
import ImageUpload from "@/components/ImageUpload";
import VariantEditor from "@/components/VariantEditor";
import PriceTierEditor from "@/components/PriceTierEditor";
import { normalizeTiers } from "@/lib/priceTiers";
import { sanitizeVariantGroups } from "@/lib/variantTemplates";
import QuickCouponPanel from "@/components/QuickCouponPanel";
import DealManager from "@/components/DealManager";
import { useToast } from "@/components/Toast";
import { getProductNamePlaceholder } from "@/lib/productPlaceholders";
import CustomSelect from "@/components/CustomSelect";

function CloseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function MerchantQuickAddModal() {
  const { open, tab, shopId, shopCategory, closeQuickAdd, setTab } = useMerchantQuickAdd();
  const { addToast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [subCategoryId, setSubCategoryId] = useState("");
  const [subs, setSubs] = useState<SubCategoryWithMeta[]>([]);
  const [variants, setVariants] = useState<VariantGroup[]>([]);
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([]);
  const [saving, setSaving] = useState(false);
  const [storyImage, setStoryImage] = useState("");
  const [storyCaption, setStoryCaption] = useState("");
  const [storySaving, setStorySaving] = useState(false);
  const [storyQuota, setStoryQuota] = useState<{
    quota: number;
    activeCount: number;
    tier: "free" | "pro";
  } | null>(null);

  useEffect(() => {
    if (!open || !shopCategory) return;
    let cancelled = false;
    fetchSubCategories(shopCategory).then((result) => {
      if (cancelled || !result.success) return;
      setSubs(result.data);
      const others = result.data.find((s) => /others/i.test(s.name))?.id;
      setSubCategoryId((prev) => prev || others || result.data[0]?.id || "");
    });
    return () => {
      cancelled = true;
    };
  }, [open, shopCategory]);

  useEffect(() => {
    if (!open || !shopId || tab !== "story") return;
    let cancelled = false;
    fetchShopStoryQuota(shopId).then((result) => {
      if (cancelled || !result.success) return;
      setStoryQuota(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [open, shopId, tab]);

  const resetProduct = useCallback(() => {
    setName("");
    setDescription("");
    setPrice("");
    setOriginalPrice("");
    setImageUrl("");
    setVariants([]);
    setPriceTiers([]);
  }, []);

  const handleCreateProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!shopId) return;
    const parsedPrice = Number(price);
    if (!name.trim() || !(parsedPrice > 0)) {
      addToast("Enter a product name and price.", "error");
      return;
    }
    setSaving(true);
    const cleanTiers = normalizeTiers(priceTiers);
    const result = await createProduct(shopId, {
      name: name.trim(),
      description: description.trim(),
      price: parsedPrice,
      original_price: originalPrice ? Number(originalPrice) : null,
      image_url: imageUrl,
      images: imageUrl ? [imageUrl] : [],
      is_available: true,
      category_id: shopCategory,
      sub_category_id: subCategoryId || null,
      variants: sanitizeVariantGroups(variants),
      price_tiers: cleanTiers.length > 0 ? cleanTiers : null,
    });
    if (result.success) {
      addToast("Product saved.", "success");
      resetProduct();
      closeQuickAdd();
      window.dispatchEvent(new Event("trendsmart:products-updated"));
    } else {
      addToast(result.error, "error");
    }
    setSaving(false);
  };

  const handleCreateStory = async (e: FormEvent) => {
    e.preventDefault();
    if (!shopId || !storyImage.trim()) {
      addToast("Upload a story image first.", "error");
      return;
    }
    setStorySaving(true);
    // createStory enforces a soft quota — posting at the limit replaces the oldest story.
    const result = await createStory(shopId, storyImage.trim(), storyCaption.trim());
    if (result.success) {
      const atLimit = storyQuota ? storyQuota.activeCount >= storyQuota.quota : false;
      addToast(atLimit ? "Story posted — oldest replaced." : "Story posted.", "success");
      setStoryImage("");
      setStoryCaption("");
      closeQuickAdd();
      window.dispatchEvent(new Event("trendsmart:stories-updated"));
    } else {
      addToast(result.error, "error");
    }
    setStorySaving(false);
  };

  if (!open || !shopId) return null;

  return (
    <div className="fixed inset-0 z-[160] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center" onClick={closeQuickAdd}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Store tools</h2>
          <button type="button" onClick={closeQuickAdd} className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="flex flex-wrap gap-1 px-4 pt-3">
          {(
            [
              ["product", "Add product"],
              ["bulk", "Bulk"],
              ["story", "Story"],
              ["coupon", "Coupon"],
              ["deal", "Deal"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                tab === key
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === "product" ? (
            <form onSubmit={handleCreateProduct} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Product name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={120}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  placeholder={getProductNamePlaceholder(shopCategory)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Description <span className="font-normal text-zinc-400">(optional)</span></label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  maxLength={300}
                  className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  placeholder="Short description"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Price (Rs.)</label>
                  <input
                    type="number"
                    min={1}
                    step="1"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Original (optional)</label>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={originalPrice}
                    onChange={(e) => setOriginalPrice(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
              </div>
              {subs.length > 0 ? (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Sub-category</label>
                  <CustomSelect
                    value={subCategoryId}
                    onChange={setSubCategoryId}
                    options={subs.map((s) => ({ value: s.id, label: s.name }))}
                  />
                </div>
              ) : null}
              <ImageUpload
                label="Product image"
                currentUrl={imageUrl}
                onUploaded={setImageUrl}
                folder="products"
                fileId={`${shopId}-quick`}
                showPreview
              />
              <VariantEditor
                variants={variants}
                onChange={setVariants}
                basePrice={Number(price) || 0}
                shopCategory={shopCategory}
              />
              <PriceTierEditor tiers={priceTiers} onChange={setPriceTiers} basePrice={Number(price) || 0} />
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Done"}
              </button>
            </form>
          ) : null}

          {tab === "bulk" ? (
            <BulkProductCreator
              shopId={shopId}
              shopCategory={shopCategory}
              onCreated={() => {
                closeQuickAdd();
                window.dispatchEvent(new Event("trendsmart:products-updated"));
              }}
              onToast={(msg, variant) => addToast(msg, variant)}
            />
          ) : null}

          {tab === "story" ? (
            <form onSubmit={handleCreateStory} className="space-y-3">
              {storyQuota ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {isUnlimitedStoryQuota(storyQuota.quota)
                    ? `Post unlimited stories — no limit (${storyQuota.activeCount} live now).`
                    : storyQuota.tier === "pro"
                      ? `Pro plan: up to ${storyQuota.quota} active stories at once (${storyQuota.activeCount} live now).`
                      : `${storyQuota.quota} active stor${storyQuota.quota === 1 ? "y" : "ies"} on the free plan (${storyQuota.activeCount} live now).`}{" "}
                  Stories stay visible on the homepage for 24 hours.
                </p>
              ) : (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Stories stay visible on the homepage for 24 hours.
                </p>
              )}
              {storyQuota && storyQuota.activeCount >= storyQuota.quota ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  {storyQuota.quota === 1
                    ? "You already have an active story. Posting a new one will replace it."
                    : `You're at your story limit (${storyQuota.quota}). Posting will replace the oldest one.`}
                </p>
              ) : null}
              <ImageUpload
                label="Story image"
                currentUrl={storyImage}
                onUploaded={setStoryImage}
                folder="stories"
                fileId={shopId}
                showPreview
              />
              <input
                value={storyCaption}
                onChange={(e) => setStoryCaption(e.target.value)}
                maxLength={80}
                placeholder="Caption"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <button
                type="submit"
                disabled={storySaving || !storyImage.trim()}
                className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {storySaving
                  ? "Posting…"
                  : storyQuota && storyQuota.activeCount >= storyQuota.quota
                    ? "Replace story"
                    : "Post story"}
              </button>
            </form>
          ) : null}

          {tab === "coupon" ? <QuickCouponPanel shopId={shopId} /> : null}

          {tab === "deal" ? <DealManager shopId={shopId} compact /> : null}
        </div>
      </div>
    </div>
  );
}
