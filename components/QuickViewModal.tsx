"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { computeVariantPricing } from "@/lib/variantPricing";
import { getProductImages } from "@/lib/productImages";
import { getSafeImageUrl } from "@/services/storageService";
import type { Product, Shop } from "@/types";
import { formatRupees, getProductDiscount } from "@/lib/formatters";
import { hasPriceTiers, priceForQuantity, tierPreviewLabels } from "@/lib/priceTiers";
import { useToast } from "@/components/Toast";
import VariantSelector, { type SelectedVariant } from "@/components/VariantSelector";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                      */
/* -------------------------------------------------------------------------- */

function CloseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CartPlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dir === "left" ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  QuickViewModal — cart-first detail + multi-image gallery                   */
/* -------------------------------------------------------------------------- */

interface QuickViewModalProps {
  product: Product;
  shop: Pick<Shop, "id" | "name" | "whatsapp_number">;
  onClose: () => void;
  isWishlisted?: boolean;
  onWishlistToggle?: () => void;
  /** Direct "Order" (opens WhatsApp checkout) with selected variants/qty/notes. */
  onOrder?: (order: {
    product: Product;
    variant?: string;
    quantity: number;
    notes?: string;
  }) => void;
}

export default function QuickViewModal({
  product,
  shop,
  onClose,
  isWishlisted = false,
  onWishlistToggle,
  onOrder,
}: QuickViewModalProps) {
  const { addItem } = useCart();
  const { addToast } = useToast();
  const [added, setAdded] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [broken, setBroken] = useState<Set<number>>(() => new Set());
  const [selectedVariants, setSelectedVariants] = useState<SelectedVariant[]>([]);
  const [itemNotes, setItemNotes] = useState("");

  const images = useMemo(() => getProductImages(product), [product]);
  const safeIndex = images.length ? Math.min(activeIndex, images.length - 1) : 0;
  const currentUrl = images[safeIndex];
  const hasVariants = Boolean(product.variants && product.variants.length > 0);
  const variantLabel = useMemo(
    () => selectedVariants.map((v) => `${v.groupName}: ${v.optionLabel}`).join(" · "),
    [selectedVariants],
  );
  // Unit price + original ("before discount") price for the selected combo so
  // the badge/strikethrough are per-variant (never a wrong % / negative Save).
  const { price: displayPrice, originalPrice: variantOriginal } = computeVariantPricing(
    product.price,
    product.original_price ?? product.compare_at_price ?? null,
    product.variants,
    variantLabel,
  );
  const variantsReady = !hasVariants || selectedVariants.length === (product.variants?.length ?? 0);
  // Quantity tiers apply only when no variant overrides the base price —
  // otherwise the variant's own price (absolute/add-on) wins.
  const tiersActive = hasPriceTiers(product.price_tiers) && displayPrice === product.price;
  const tierLabels = useMemo(
    () => (tiersActive ? tierPreviewLabels(product.price_tiers) : []),
    [tiersActive, product.price_tiers],
  );
  const lineTotal = tiersActive
    ? priceForQuantity(product.price, product.price_tiers, quantity)
    : Math.round(displayPrice * quantity);

  const { hasDiscount, originalPrice, discountPercent: discountPct } = getProductDiscount({
    price: displayPrice,
    original_price: variantOriginal,
    compare_at_price: null,
    deal_expires_at: product.deal_expires_at,
  });

  // The exact Product handed to cart/order: per-variant price + discount
  // applied. Extracted so the callbacks below keep stable deps (the React
  // Compiler can't preserve manual memoization around the inline ternary).
  const cartItem = useMemo<Product>(
    () => {
      const variantOriginal = hasDiscount ? originalPrice : null;
      return displayPrice !== product.price ||
        variantOriginal !== (product.original_price ?? null) ||
        !tiersActive
        ? {
            ...product,
            price: displayPrice,
            original_price: variantOriginal,
            price_tiers: tiersActive ? product.price_tiers : null,
          }
        : product;
    },
    [product, displayPrice, tiersActive, hasDiscount, originalPrice],
  );

  const pauseAutoUntil = useRef(0);

  useEffect(() => {
    setActiveIndex(0);
    setBroken(new Set());
    setGalleryOpen(false);
    setSelectedVariants([]);
    setItemNotes("");
    setQuantity(1);
    setAdded(false);
    pauseAutoUntil.current = 0;
  }, [product.id]);

  // Keep page scroll where the user was — don't jump to top when modal opens.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const scrollY = window.scrollY;
    const body = document.body;
    const html = document.documentElement;
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      htmlOverflow: html.style.overflow,
    };
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    html.style.overflow = "hidden";
    return () => {
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      html.style.overflow = prev.htmlOverflow;
      // Instant restore — a global `scroll-behavior: smooth` would otherwise
      // animate this from the top, making the list visibly "jump back down".
      window.scrollTo({ top: scrollY, behavior: "instant" });
    };
  }, []);

  // Auto-advance gallery when user isn't interacting.
  useEffect(() => {
    if (images.length <= 1) return;
    const timer = window.setInterval(() => {
      if (Date.now() < pauseAutoUntil.current) return;
      if (galleryOpen) return;
      setActiveIndex((i) => (i + 1) % images.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [images.length, galleryOpen, product.id]);

  const goManual = useCallback(
    (delta: number) => {
      if (images.length <= 1) return;
      pauseAutoUntil.current = Date.now() + 6000;
      setActiveIndex((i) => (i + delta + images.length) % images.length);
    },
    [images.length],
  );

  const selectManual = useCallback((index: number) => {
    pauseAutoUntil.current = Date.now() + 6000;
    setActiveIndex(index);
  }, []);

  const handleAddToCart = useCallback(() => {
    if (!variantsReady) {
      addToast("Please choose flavour / options first.", "error");
      return;
    }
    addItem(cartItem, shop, quantity, variantLabel || undefined, itemNotes.trim() || undefined);
    setAdded(true);
    addToast(`"${product.name}" added to cart`, "success");
    setTimeout(() => setAdded(false), 2000);
  }, [product, shop, quantity, addItem, addToast, variantsReady, cartItem, variantLabel, itemNotes]);

  const handleOrder = useCallback(() => {
    if (!variantsReady) {
      addToast("Please choose flavour / options first.", "error");
      return;
    }
    if (!shop.whatsapp_number) {
      addToast("This store has no WhatsApp number yet — please contact them directly.", "info");
      return;
    }
    onOrder?.({
      product: cartItem,
      variant: variantLabel || undefined,
      quantity,
      notes: itemNotes.trim() || undefined,
    });
  }, [shop, quantity, addToast, variantsReady, cartItem, variantLabel, itemNotes, onOrder]);

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-zinc-900 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Image carousel (thumbs below — no top dots) ──────────────── */}
        <div className="relative h-56 sm:h-64 bg-gradient-to-br from-teal-50 to-zinc-100 dark:from-zinc-800 dark:to-zinc-700">
          {currentUrl && !broken.has(safeIndex) ? (
            <button
              type="button"
              className="absolute inset-0"
              onClick={() => setGalleryOpen(true)}
              aria-label="Open image gallery"
            >
              <Image
                key={`${product.id}-${safeIndex}`}
                src={getSafeImageUrl(currentUrl, "product")}
                alt={`${product.name} photo ${safeIndex + 1}`}
                fill
                priority
                className="object-contain transition-opacity duration-500 ease-out"
                sizes="(max-width: 640px) 100vw, 28rem"
                onError={() => setBroken((prev) => new Set(prev).add(safeIndex))}
              />
            </button>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="text-5xl text-zinc-300 dark:text-zinc-600">📦</span>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 z-10 rounded-full bg-black/40 p-1.5 text-white backdrop-blur-sm hover:bg-black/60 transition-colors"
            aria-label="Close"
          >
            <CloseIcon />
          </button>

          {hasDiscount && (
            <span className="absolute left-3 top-3 z-10 rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white">
              -{discountPct}% OFF
            </span>
          )}

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); goManual(-1); }}
                className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/35 p-1.5 text-white backdrop-blur-sm hover:bg-black/55"
                aria-label="Previous photo"
              >
                <Chevron dir="left" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); goManual(1); }}
                className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/35 p-1.5 text-white backdrop-blur-sm hover:bg-black/55"
                aria-label="Next photo"
              >
                <Chevron dir="right" />
              </button>
              <span className="absolute bottom-2 right-3 z-10 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                {safeIndex + 1}/{images.length}
              </span>
            </>
          )}
        </div>

        {/* Thumbnail strip — primary jump control */}
        {images.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto px-3 py-1.5 scrollbar-none">
            {images.map((url, i) => (
              <button
                key={`${url}-${i}`}
                type="button"
                onClick={() => selectManual(i)}
                className={`relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border-2 transition-all duration-200 ${
                  i === safeIndex
                    ? "border-teal-500"
                    : "border-transparent opacity-75 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getSafeImageUrl(url, "product")}
                  alt=""
                  loading={i < 4 ? "eager" : "lazy"}
                  className="h-full w-full object-contain bg-zinc-50 dark:bg-zinc-800"
                />
              </button>
            ))}
          </div>
        )}

        {/* ── Details ──────────────────────────────────────────────────── */}
        <div className="space-y-2.5 p-3.5 sm:p-4 sm:pb-6">
          <div>
            <h3 className="text-base font-bold leading-snug text-zinc-900 dark:text-zinc-100">{product.name}</h3>
            {product.description && (
              <p className="mt-0.5 line-clamp-3 text-sm leading-snug text-zinc-500 dark:text-zinc-400">
                {product.description}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {formatRupees(lineTotal)}
            </span>
            {quantity > 1 && (
              <span className="text-xs text-zinc-400">
                ({formatRupees(Math.round(lineTotal / quantity))} each)
              </span>
            )}
            {hasDiscount && originalPrice != null && (
              <>
                <span className="text-sm text-zinc-400 line-through">
                  {formatRupees(originalPrice * quantity)}
                </span>
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600 dark:bg-red-900/20 dark:text-red-400">
                  Save {formatRupees(originalPrice * quantity - lineTotal)}
                </span>
              </>
            )}
          </div>

          {tierLabels.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tierLabels.map((label) => (
                <span key={label} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                  {label}
                </span>
              ))}
              <span className="rounded-full bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-400 dark:bg-zinc-800">
                bulk price
              </span>
            </div>
          )}

          {hasVariants && product.variants ? (
            <VariantSelector
              variants={product.variants}
              basePrice={product.price}
              onSelectionChange={setSelectedVariants}
              compact
            />
          ) : null}

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Special instructions (optional)
            </label>
            <textarea
              value={itemNotes}
              onChange={(e) => setItemNotes(e.target.value.slice(0, 200))}
              rows={2}
              maxLength={200}
              placeholder="Any special instructions"
              className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-300/50 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Qty:</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                aria-label="Decrease quantity"
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
              <span className="w-8 text-center text-sm font-semibold text-zinc-900 dark:text-zinc-100">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity(Math.min(99, quantity + 1))}
                disabled={quantity >= 99}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                aria-label="Increase quantity"
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={!product.is_available || !variantsReady}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 py-2.5 text-sm font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
                added
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                  : "border-teal-300 text-teal-800 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-300 dark:hover:bg-teal-950/30"
              }`}
            >
              {added ? <><CheckIcon /> Added</> : <><CartPlusIcon /> Add to Cart</>}
            </button>
            {onOrder && (
              <button
                type="button"
                onClick={handleOrder}
                disabled={!product.is_available || !variantsReady}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-600/25 transition-all hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Order
              </button>
            )}
            {onWishlistToggle && (
              <button
                type="button"
                onClick={onWishlistToggle}
                className={`inline-flex items-center justify-center rounded-xl border-2 px-3.5 py-2.5 text-sm font-semibold transition-all active:scale-95 ${
                  isWishlisted
                    ? "border-red-300 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
                    : "border-zinc-200 text-zinc-500 hover:border-red-200 hover:text-red-500 dark:border-zinc-700 dark:text-zinc-400"
                }`}
                aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
              >
                <HeartIcon filled={isWishlisted} />
              </button>
            )}
          </div>

          <Link
            href={`/shop/${shop.id}`}
            onClick={onClose}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-600/25 transition hover:bg-emerald-700 active:scale-[0.98]"
          >
            View {shop.name.length > 22 ? "Store" : shop.name}
          </Link>

          <p className="text-center text-[0.6rem] text-zinc-400 dark:text-zinc-500">
            From <span className="font-medium text-zinc-500 dark:text-zinc-400">{shop.name}</span>
            {" · "}order directly or add to cart below
          </p>
        </div>
      </div>

      {/* Full-screen horizontal gallery */}
      {galleryOpen && images.length > 0 && (
        <div
          className="fixed inset-0 z-[160] flex flex-col bg-black/95"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Product gallery"
        >
          <div
            className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3 text-white"
          >
            <p className="text-sm font-semibold">
              {safeIndex + 1} / {images.length}
            </p>
            <button
              type="button"
              onClick={() => setGalleryOpen(false)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 p-0 text-white ring-1 ring-white/30 transition-colors hover:bg-white/25 active:scale-95"
              aria-label="Close gallery"
            >
              <CloseIcon />
            </button>
          </div>
          <div className="relative flex flex-1 items-center justify-center px-2">
            {images.length > 1 && (
              <button
                type="button"
                onClick={() => goManual(-1)}
                className="absolute left-3 z-10 rounded-full bg-white/15 p-3 text-white hover:bg-white/25"
                aria-label="Previous"
              >
                <Chevron dir="left" />
              </button>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getSafeImageUrl(images[safeIndex]!, "product")}
              alt={`${product.name} ${safeIndex + 1}`}
              className="max-h-[75vh] max-w-full object-contain transition-opacity duration-300"
            />
            {images.length > 1 && (
              <button
                type="button"
                onClick={() => goManual(1)}
                className="absolute right-3 z-10 rounded-full bg-white/15 p-3 text-white hover:bg-white/25"
                aria-label="Next"
              >
                <Chevron dir="right" />
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-none">
            {images.map((url, i) => (
              <button
                key={`g-${url}-${i}`}
                type="button"
                onClick={() => selectManual(i)}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${
                  i === safeIndex ? "border-teal-400" : "border-white/20"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={getSafeImageUrl(url, "product")} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
