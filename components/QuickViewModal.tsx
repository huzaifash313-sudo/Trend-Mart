"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { useCart } from "@/context/CartContext";
import type { Product, Shop } from "@/types";
import { formatRupees, getProductDiscount } from "@/lib/formatters";
import { getSafeImageUrl } from "@/services/storageService";
import { useToast } from "@/components/Toast";

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

/* -------------------------------------------------------------------------- */
/*  QuickViewModal — Cart-first product detail modal                            */
/*                                                                             */
/*  Single-item "Buy Now" / "Order Now" removed. All purchases go through      */
/*  the multi-item cart → sticky bar → WhatsApp batch checkout flow.           */
/* -------------------------------------------------------------------------- */

interface QuickViewModalProps {
  product: Product;
  shop: Pick<Shop, "id" | "name" | "whatsapp_number">;
  onClose: () => void;
}

export default function QuickViewModal({ product, shop, onClose }: QuickViewModalProps) {
  const { addItem } = useCart();
  const { addToast } = useToast();
  const [added, setAdded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [quantity, setQuantity] = useState(1);

  const handleAddToCart = useCallback(() => {
    addItem(product, shop, quantity);
    setAdded(true);
    addToast(`"${product.name}" added to cart`, "success");
    setTimeout(() => setAdded(false), 2000);
  }, [product, shop, quantity, addItem, addToast]);

  const { hasDiscount, originalPrice, discountPercent: discountPct } = getProductDiscount(product);

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-zinc-900 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Image ────────────────────────────────────────────────────── */}
        <div className="relative h-64 sm:h-72 bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-700">
          {product.image_url && !imgError ? (
            <Image
              src={getSafeImageUrl(product.image_url, "product")}
              alt={product.name}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 28rem"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="text-6xl text-zinc-300 dark:text-zinc-600">📦</span>
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
        </div>

        {/* ── Details ──────────────────────────────────────────────────── */}
        <div className="p-4 space-y-3">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{product.name}</h3>
            {product.description && (
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                {product.description}
              </p>
            )}
          </div>

          {/* Pricing */}
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatRupees(product.price)}
            </span>
            {hasDiscount && originalPrice != null && (
              <>
                <span className="text-sm text-zinc-400 line-through">
                  {formatRupees(originalPrice)}
                </span>
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600 dark:bg-red-900/20 dark:text-red-400">
                  Save {formatRupees(originalPrice - product.price)}
                </span>
              </>
            )}
          </div>

          {/* Quantity selector */}
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

          {/* Action button — cart-first flow */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleAddToCart}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 font-semibold py-2.5 text-sm transition-all active:scale-95 ${
                added
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                  : "border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
              }`}
            >
              {added ? <><CheckIcon /> Added</> : <><CartPlusIcon /> Add to Cart</>}
            </button>
          </div>

          {/* Hint: Checkout via sticky bar */}
          <p className="text-center text-[0.6rem] text-zinc-400 dark:text-zinc-500">
            Items added to your cart — checkout from the cart bar at the bottom
          </p>

          {/* Variant display (non-interactive preview) */}
          {product.variants && product.variants.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-zinc-100 dark:border-zinc-800">
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Available Options</p>
              {product.variants.map((group) => (
                <div key={group.name} className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400 w-16 shrink-0">{group.name}:</span>
                  <div className="flex flex-wrap gap-1">
                    {group.options.map((opt) => (
                      <span
                        key={opt.label}
                        className="rounded-full border border-zinc-200 px-2 py-0.5 text-[0.65rem] text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                      >
                        {opt.label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}