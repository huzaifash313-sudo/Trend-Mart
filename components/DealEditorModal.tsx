"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { ShopDeal } from "@/lib/dealSchedule";
import { updateShopDeal } from "@/services/dealService";
import { getDealImages, normalizeDealGallery, MAX_DEAL_IMAGES } from "@/lib/productImages";
import MultiImageUpload from "@/components/MultiImageUpload";
import { useToast } from "@/components/Toast";

/* -------------------------------------------------------------------------- */
/*  DealEditorModal — inline edit for an existing deal, opened from the       */
/*  3-dot menu on "Your deals". Edits title, price, discount, badge, note,    */
/*  and photos in place — no dashboard redirect. Schedule is set at creation. */
/* -------------------------------------------------------------------------- */

interface DealEditorModalProps {
  deal: ShopDeal;
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

export default function DealEditorModal({ deal, onClose, onSaved }: DealEditorModalProps) {
  const { addToast } = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [badgeText, setBadgeText] = useState("");
  const [gallery, setGallery] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(deal.title ?? "");
    setDescription(deal.description ?? "");
    setPrice(deal.price != null ? String(deal.price) : "");
    setOriginalPrice(deal.original_price != null ? String(deal.original_price) : "");
    setBadgeText(deal.badge_text ?? "");
    setGallery(getDealImages(deal));
  }, [deal]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!title.trim()) {
        addToast("Deal title is required.", "error");
        return;
      }
      const parsedPrice = price.trim() ? Number(price) : null;
      if (parsedPrice == null || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
        addToast("Enter a valid deal price.", "error");
        return;
      }
      const original = originalPrice.trim() ? Number(originalPrice) : null;
      const normalized = normalizeDealGallery(gallery);

      setSaving(true);
      const result = await updateShopDeal(deal.id, {
        title: title.trim(),
        description: description.trim() || null,
        badge_text: badgeText.trim() || null,
        price: parsedPrice,
        original_price: original != null && Number.isFinite(original) ? original : null,
        image_url: normalized.image_url || null,
        images: normalized.images,
      });
      setSaving(false);

      if (result.success) {
        addToast("Deal updated.", "success");
        window.dispatchEvent(new Event("trendmart:deals-updated"));
        onSaved();
      } else {
        addToast(result.error, "error");
      }
    },
    [title, description, price, originalPrice, badgeText, gallery, deal.id, addToast, onSaved],
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
        aria-label="Edit deal"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Edit deal</h2>
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
              Deal title *
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={80}
              placeholder="e.g. Friday Biryani Deal"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Deal price (Rs.) *
              </label>
              <input
                type="number"
                min={0}
                step="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                placeholder="940"
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
                placeholder="1000"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>

          {originalPrice && price && Number(originalPrice) > Number(price) && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
              Badge: -{Math.round(((Number(originalPrice) - Number(price)) / Number(originalPrice)) * 100)}% OFF
            </p>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Badge (optional)
            </label>
            <input
              maxLength={24}
              value={badgeText}
              onChange={(e) => setBadgeText(e.target.value)}
              placeholder="e.g. 20% OFF · BOGO"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Note (optional)
            </label>
            <input
              maxLength={160}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short detail for customers"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <MultiImageUpload
            urls={gallery}
            onChange={setGallery}
            folder="deals"
            fileIdPrefix={`${deal.shop_id}-deal`}
            label="Deal photos"
            maxImages={MAX_DEAL_IMAGES}
          />

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
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
