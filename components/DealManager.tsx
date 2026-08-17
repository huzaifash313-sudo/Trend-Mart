"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  createShopDeal,
  deleteShopDeal,
  fetchDealsByShopId,
  updateShopDeal,
  updateShopDealStatus,
} from "@/services/dealService";
import { fetchProductsByShopId } from "@/services/productService";
import {
  WEEKDAY_LABELS,
  formatDealSchedule,
  type DealScheduleType,
  type ShopDeal,
} from "@/lib/dealSchedule";
import MultiImageUpload from "@/components/MultiImageUpload";
import Image from "next/image";
import { getSafeImageUrl } from "@/services/storageService";
import { getDealImages, getProductImages, normalizeDealGallery, MAX_DEAL_IMAGES } from "@/lib/productImages";
import type { Product } from "@/types";
import CustomSelect from "@/components/CustomSelect";

interface DealManagerProps {
  shopId: string;
  compact?: boolean;
  onChanged?: () => void;
}

const EMPTY = {
  title: "",
  description: "",
  schedule_type: "weekly" as DealScheduleType,
  weekdays: [] as number[],
  starts_on: "",
  ends_on: "",
  day_of_month: "1",
  gallery: [] as string[],
  badge_text: "",
  is_featured: true,
  product_id: "",
  price: "",
  original_price: "",
};

export default function DealManager({ shopId, compact = false, onChanged }: DealManagerProps) {
  const [deals, setDeals] = useState<ShopDeal[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(!compact);

  const load = useCallback(async () => {
    setLoading(true);
    const [dealsRes, productsRes] = await Promise.all([
      fetchDealsByShopId(shopId),
      fetchProductsByShopId(shopId),
    ]);
    if (dealsRes.success) setDeals(dealsRes.data);
    else setError(dealsRes.error);
    if (productsRes.success) {
      setProducts(productsRes.data.filter((p) => p.is_available !== false));
    }
    setLoading(false);
  }, [shopId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleWeekday = (day: number) => {
    setForm((prev) => {
      const has = prev.weekdays.includes(day);
      return {
        ...prev,
        weekdays: has ? prev.weekdays.filter((d) => d !== day) : [...prev.weekdays, day].sort(),
      };
    });
  };

  const notify = () => {
    onChanged?.();
    window.dispatchEvent(new Event("trendmart:deals-updated"));
  };

  const applyProduct = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) {
      setForm((f) => ({ ...f, product_id: productId }));
      return;
    }
    const gallery = getProductImages(product);
    setForm((f) => ({
      ...f,
      product_id: product.id,
      title: f.title.trim() || product.name || product.title || "",
      gallery: gallery.length ? gallery : f.gallery,
      price: f.price || String(product.price ?? ""),
      original_price:
        f.original_price ||
        (product.original_price != null && product.original_price > product.price
          ? String(product.original_price)
          : product.price
            ? String(product.price)
            : ""),
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const gallery = normalizeDealGallery(form.gallery);
    if (!gallery.image_url) {
      setSaving(false);
      setError("Add at least one photo (or pick a product that has photos).");
      return;
    }
    const price = form.price.trim() ? Number(form.price) : null;
    if (price == null || !Number.isFinite(price) || price < 0) {
      setSaving(false);
      setError("Enter the deal price (what customer pays).");
      return;
    }
    const original = form.original_price.trim() ? Number(form.original_price) : null;
    const result = await createShopDeal(shopId, {
      title: form.title,
      description: form.description,
      schedule_type: form.schedule_type,
      weekdays: form.weekdays,
      starts_on: form.starts_on || undefined,
      ends_on: form.ends_on || undefined,
      day_of_month: form.day_of_month ? Number(form.day_of_month) : undefined,
      image_url: gallery.image_url || null,
      images: gallery.images,
      badge_text: form.badge_text || null,
      is_featured: form.is_featured,
      product_id: form.product_id || null,
      price,
      original_price: original != null && Number.isFinite(original) ? original : null,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setForm(EMPTY);
    setShowForm(false);
    await load();
    notify();
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Store deals</h3>
          <p className="text-[0.7rem] text-zinc-500 dark:text-zinc-400">
            Photos, name, and price are enough — no listed product needed. Link a product only if you want. Customers can cart anytime; Order works on the deal day.
          </p>
        </div>
        {!showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Add deal
          </button>
        ) : null}
      </div>

      {showForm ? (
        <form
          onSubmit={handleSubmit}
          className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/60"
        >
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Link product (optional)
            </label>
            <CustomSelect
              value={form.product_id}
              onChange={(val) => applyProduct(val)}
              options={[
                { value: "", label: "Custom deal (no product link)" },
                ...products.map((p) => ({
                  value: p.id,
                  label: `${p.name} — Rs ${p.price}`,
                })),
              ]}
            />
            <p className="mt-1 text-[0.65rem] text-zinc-400">
              Picking a product fills title, photos, and prices — you can still edit.
            </p>
          </div>

          <MultiImageUpload
            urls={form.gallery}
            onChange={(urls) => setForm((f) => ({ ...f, gallery: urls }))}
            folder="deals"
            fileIdPrefix={`${shopId}-deal`}
            label="Deal photos"
            maxImages={MAX_DEAL_IMAGES}
          />

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Deal title
            </label>
            <input
              required
              maxLength={80}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Friday Biryani Deal"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Deal price (Rs)
              </label>
              <input
                required
                type="number"
                min={0}
                step="1"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="940"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Original price
              </label>
              <input
                type="number"
                min={0}
                step="1"
                value={form.original_price}
                onChange={(e) => setForm((f) => ({ ...f, original_price: e.target.value }))}
                placeholder="1000"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Badge (optional)
            </label>
            <input
              maxLength={24}
              value={form.badge_text}
              onChange={(e) => setForm((f) => ({ ...f, badge_text: e.target.value }))}
              placeholder="e.g. 20% OFF · BOGO"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Schedule — Order only works on these days
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ["weekly", "Weekly"],
                  ["date_range", "Date range"],
                  ["monthly", "Monthly"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, schedule_type: key }))}
                  className={`rounded-lg px-2 py-2 text-[0.7rem] font-semibold ${
                    form.schedule_type === key
                      ? "bg-emerald-600 text-white"
                      : "bg-white text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {form.schedule_type === "weekly" ? (
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_LABELS.map((label, day) => {
                const on = form.weekdays.includes(day);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleWeekday(day)}
                    className={`rounded-full px-2.5 py-1 text-[0.7rem] font-semibold ${
                      on
                        ? "bg-emerald-600 text-white"
                        : "bg-white text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}

          {form.schedule_type === "date_range" ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[0.65rem] font-medium text-zinc-500">From</label>
                <input
                  type="date"
                  required
                  value={form.starts_on}
                  onChange={(e) => setForm((f) => ({ ...f, starts_on: e.target.value }))}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-[0.65rem] font-medium text-zinc-500">To</label>
                <input
                  type="date"
                  required
                  value={form.ends_on}
                  onChange={(e) => setForm((f) => ({ ...f, ends_on: e.target.value }))}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>
          ) : null}

          {form.schedule_type === "monthly" ? (
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Day of month
              </label>
              <CustomSelect
                value={form.day_of_month}
                onChange={(val) => setForm((f) => ({ ...f, day_of_month: val }))}
                options={Array.from({ length: 31 }, (_, i) => i + 1).map((d) => ({
                  value: String(d),
                  label: String(d),
                }))}
              />
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Description <span className="font-normal text-zinc-400">(optional)</span>
            </label>
            <input
              maxLength={160}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Short detail for customers"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-emerald-200/70 bg-emerald-50/60 px-3 py-2.5 dark:border-emerald-900/40 dark:bg-emerald-950/30">
            <input
              type="checkbox"
              checked={form.is_featured}
              onChange={(e) => setForm((f) => ({ ...f, is_featured: e.target.checked }))}
              className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
              Feature on For You / homepage deals strip
            </span>
          </label>

          {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save deal"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
              className="rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p className="text-xs text-zinc-400">Loading deals…</p>
      ) : deals.length === 0 ? (
        <p className="text-xs text-zinc-400">
          No deals yet. Link a product, add photos + deal price + schedule.
        </p>
      ) : (
        <ul className="space-y-2">
          {deals.map((deal) => {
            const thumbs = getDealImages(deal);
            const cover = thumbs[0];
            return (
              <li
                key={deal.id}
                className="flex items-start gap-2.5 rounded-xl border border-zinc-200 bg-white px-2.5 py-2.5 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                  {cover ? (
                    <Image
                      src={getSafeImageUrl(cover, "product")}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="56px"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[0.55rem] font-bold uppercase text-zinc-400">
                      Deal
                    </div>
                  )}
                  {thumbs.length > 1 ? (
                    <span className="absolute bottom-0.5 right-0.5 rounded bg-zinc-950/70 px-1 text-[8px] font-bold text-white">
                      {thumbs.length}
                    </span>
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {deal.title}
                  </p>
                  <p className="text-[0.7rem] text-zinc-500 dark:text-zinc-400">
                    {formatDealSchedule(deal)}
                    {deal.price != null ? ` · Rs ${deal.price}` : ""}
                    {deal.badge_text ? ` · ${deal.badge_text}` : ""}
                  </p>
                  <div className="mt-0.5 flex flex-wrap gap-1.5">
                    {!deal.is_active ? (
                      <span className="text-[0.65rem] font-semibold text-amber-600">Paused</span>
                    ) : null}
                    {deal.is_featured ? (
                      <span className="text-[0.65rem] font-semibold text-emerald-600">Featured</span>
                    ) : null}
                    {deal.product_id ? (
                      <span className="text-[0.65rem] font-semibold text-zinc-500">Product linked</span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={async () => {
                      await updateShopDeal(deal.id, { is_featured: !deal.is_featured });
                      await load();
                      notify();
                    }}
                    className="rounded-lg px-2 py-1 text-[0.65rem] font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                  >
                    {deal.is_featured ? "Unfeature" : "Feature"}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await updateShopDealStatus(deal.id, !deal.is_active);
                      await load();
                      notify();
                    }}
                    className="rounded-lg px-2 py-1 text-[0.65rem] font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {deal.is_active ? "Pause" : "Resume"}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteShopDeal(deal.id);
                      await load();
                      notify();
                    }}
                    className="rounded-lg px-2 py-1 text-[0.65rem] font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
