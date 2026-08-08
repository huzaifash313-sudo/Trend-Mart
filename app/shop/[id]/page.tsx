"use client";

import { useState, useEffect, use, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Shop, Product, Review } from "@/types";
import { fetchShopById } from "@/services/shopService";
import { fetchReviewsByShopId, submitReview, computeRatingStats } from "@/services/reviewService";
import { logShopView } from "@/services/analyticsService";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { ProductGridSkeleton, ShopBannerSkeleton } from "@/components/Skeletons";
import ContactModal from "@/components/ContactModal";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import ProductGrid from "@/components/ProductGrid";
import QuickViewModal from "@/components/QuickViewModal";
import ShopMediaHeader, { ShopLogoAvatar } from "@/components/ShopMediaHeader";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/components/Toast";
import { getStoreTheme, type StoreTheme, isServiceTheme } from "@/lib/storeThemes";
import { formatRupees } from "@/lib/formatters";
import {
  subscribeToProducts,
  subscribeToReviews,
  unsubscribeAll,
} from "@/lib/supabase/realtime";
import ServiceBookingModal, { type ServicePackageItem } from "@/components/ServiceBookingModal";
import AvailabilitySchedule, { type AvailabilityDay } from "@/components/AvailabilitySchedule";
import type { PortfolioItem } from "@/components/ServicePortfolioManager";
import { createClient } from "@/lib/supabase/client";

// ─── Icons ──────────────────────────────────────────────────────────────────

function ChevronLeftIcon() {
  return (<svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>);
}

function PinIcon() {
  return (<svg className="h-3.5 w-3.5 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>);
}

function WhatsAppIcon() {
  return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" /></svg>);
}

function SearchIcon() {
  return (<svg className="h-4 w-4 shrink-0 text-zinc-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>);
}

function StarIcon({ filled }: { filled: boolean }) {
  return (<svg className={`h-3.5 w-3.5 ${filled ? "text-amber-400" : "text-zinc-300 dark:text-zinc-600"}`} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>);
}

function GridIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>); }

// ─── Star Rating Display ────────────────────────────────────────────────────

function StarRatingDisplay({ rating, size }: { rating: number; size?: "sm" | "md" }) {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(<StarIcon key={i} filled={i <= Math.round(rating)} />);
  }
  return <div className={`flex items-center gap-0.5 ${size === "sm" ? "scale-90" : ""}`} aria-label={`${rating} out of 5 stars`}>{stars}</div>;
}

// ─── Review Form ────────────────────────────────────────────────────────────

function ReviewForm({
  shopId,
  onReviewSubmitted,
  submitting,
  setSubmitting,
  addToast,
}: {
  shopId: string;
  onReviewSubmitted: () => void;
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
  addToast: (msg: string, variant?: "success" | "error" | "info") => void;
}) {
  const [name, setName] = useState("");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || rating === 0) {
      addToast("Please provide your name and rating.", "error");
      return;
    }
    setSubmitting(true);
    const result = await submitReview(shopId, name, rating, comment);
    if (result.success) {
      addToast("Thank you for your review!", "success");
      setName("");
      setRating(0);
      setComment("");
      onReviewSubmitted();
    } else {
      addToast(result.error, "error");
    }
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Write a Review</h3>
      <div>
        <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Your Name *</label>
        <input
          type="text" required value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Your name" maxLength={60}
          className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Rating *</label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button key={star} type="button" onClick={() => setRating(star)} onMouseEnter={() => setHoverRating(star)} onMouseLeave={() => setHoverRating(0)} className="p-0.5 transition-transform hover:scale-110 focus:outline-none" aria-label={`${star} star${star > 1 ? "s" : ""}`}>
              <StarIcon filled={star <= (hoverRating || rating)} />
            </button>
          ))}
          {rating > 0 && <span className="ml-2 text-xs text-zinc-500">{rating} / 5</span>}
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Comment (optional)</label>
        <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Share your experience…" maxLength={500} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 resize-none" />
      </div>
      <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 dark:focus:ring-offset-zinc-900">
        {submitting ? "Submitting…" : "Submit Review"}
      </button>
    </form>
  );
}

// ─── Rating Breakdown ───────────────────────────────────────────────────────

function RatingBreakdown({ reviews }: { reviews: Review[] }) {
  const { average, total, distribution } = computeRatingStats(reviews);
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-3">
        <div className="text-center">
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{average}</p>
          <StarRatingDisplay rating={average} />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{total} review{total !== 1 && "s"}</p>
        </div>
        <div className="flex-1 space-y-1">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = distribution[star - 1];
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={star} className="flex items-center gap-1.5 text-xs">
                <span className="w-2 text-zinc-500 dark:text-zinc-400">{star}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                  <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-5 text-right text-zinc-400">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Review List ────────────────────────────────────────────────────────────

function ReviewList({ reviews, loading }: { reviews: Review[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-1.5 h-3 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="mb-1.5 h-2 w-1/4 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-2 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
          </div>
        ))}
      </div>
    );
  }
  if (reviews.length === 0) {
    return <p className="py-4 text-center text-sm text-zinc-400 dark:text-zinc-500">No reviews yet. Be the first to review!</p>;
  }
  return (
    <div className="space-y-2">
      {reviews.map((review) => (
        <div key={review.id} className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-0.5 flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{review.customer_name}</span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">{new Date(review.created_at!).toLocaleDateString()}</span>
          </div>
          <StarRatingDisplay rating={review.rating} size="sm" />
          {review.comment && <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">{review.comment}</p>}
        </div>
      ))}
    </div>
  );
}

// ─── Shop Detail Inner ──────────────────────────────────────────────────────

function ShopDetailInner({ id }: { id: string }) {
  const router = useRouter();
  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [priceSort, setPriceSort] = useState<"default" | "low" | "high">("default");
  const [showContactModal, setShowContactModal] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const { addToast } = useToast();
  const { addItem } = useCart();

  // Quick view modal state — cart-first: no single-item checkout
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);

  // ── Service-specific state ─────────────────────────────────────────────────
  const [servicePackages, setServicePackages] = useState<ServicePackageItem[]>([]);
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [availabilityDays, setAvailabilityDays] = useState<AvailabilityDay[]>([]);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  // ── Theme ──────────────────────────────────────────────────────────────────
  const theme: StoreTheme = useMemo(() => getStoreTheme(shop?.category), [shop?.category]);
  const isService = isServiceTheme(shop?.category);

  // ── Data Loading ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      setError(null);
      const result = await fetchShopById(id);
      if (!cancelled) {
        if (result.success) { setShop(result.data.shop); setProducts(result.data.products); }
        else { setError(result.error); }
      }
      if (!cancelled) setLoading(false);
    }
    fetchData();
    logShopView(id);
    fetchReviewsByShopId(id).then((r) => {
      if (!cancelled && r.success) setReviews(r.data);
      if (!cancelled) setReviewsLoading(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  // ── Real-time Subscriptions ──────────────────────────────────────────────
  useEffect(() => {
    const unsubProducts = subscribeToProducts(id, (payload) => {
      const updated = payload.new as Product;
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
    }, (payload) => {
      const newProduct = payload.new as Product;
      setProducts((prev) => [...prev, newProduct]);
    }, (payload) => {
      const deleted = payload.old as { id: string };
      setProducts((prev) => prev.filter((p) => p.id !== deleted.id));
    });
    const unsubReviews = subscribeToReviews(id, (payload) => {
      const newReview = payload.new as Review;
      setReviews((prev) => [newReview, ...prev]);
    });
    return () => { unsubProducts(); unsubReviews(); };
  }, [id]);

  useEffect(() => () => { unsubscribeAll(); }, []);

  // ── Service Data Fetching ─────────────────────────────────────────────────
  useEffect(() => {
    if (!shop || !isService) return;
    const fetchServiceData = async () => {
      try {
        const { data: pkgData } = await supabase.from("service_packages").select("*").eq("shop_id", shop.id).eq("is_active", true).order("sort_order", { ascending: true });
        if (pkgData) setServicePackages(pkgData as ServicePackageItem[]);
        const { data: portData } = await supabase.from("service_portfolio").select("*").eq("shop_id", shop.id).eq("is_published", true).order("project_date", { ascending: false }).limit(6);
        if (portData) setPortfolioItems(portData as PortfolioItem[]);
      } catch { /* ignore */ }
    };
    fetchServiceData();
  }, [shop, isService, supabase]);

  // ── Filtered & Sorted Products ────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    let result = products;
    const q = searchQuery.toLowerCase().trim();
    if (q) result = result.filter((p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
    if (priceSort === "low") result = [...result].sort((a, b) => a.price - b.price);
    else if (priceSort === "high") result = [...result].sort((a, b) => b.price - a.price);
    return result;
  }, [products, searchQuery, priceSort]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleProductClick = useCallback((product: Product) => {
    setQuickViewProduct(product);
  }, []);

  const handleAddToCart = useCallback((product: Product) => {
    if (!shop) return;
    addItem(product, { id: shop.id, name: shop.name, whatsapp_number: shop.whatsapp_number });
    addToast(`"${product.name}" added to cart`, "success");
  }, [shop, addItem, addToast]);

  const gridColumns = theme.productColumns;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 space-y-3 px-3 py-3 pb-24 md:space-y-4 md:px-4 md:py-5 md:pb-8">
      {loading && (<div className="space-y-4"><ShopBannerSkeleton /><ProductGridSkeleton count={4} /></div>)}
      {!loading && error && (<ErrorState title="Failed to load shop" message={error} onRetry={() => window.location.reload()} />)}
      {!loading && !error && shop && (<>
        {/* Announcement Banner */}
        {shop.announcement && (
          <section className="section-spacing-sm">
            <AnnouncementBanner text={shop.announcement} variant="marquee" accentColor={shop.accent_color ?? theme.accentHex} dismissible />
          </section>
        )}

        {/* Hero — banner wide; logo beside shop name */}
        <section className="trend-card overflow-hidden">
          <ShopMediaHeader
            shopName={shop.name}
            bannerUrl={shop.banner_url}
            logoUrl={shop.logo_url}
            size="hero"
            logoPlacement="hidden"
          >
            {shop.is_live && (
              <span className="absolute left-3 top-3 z-[1] animate-pulse rounded-full bg-red-500 px-2 py-0.5 text-[0.65rem] font-semibold text-white shadow">
                ● LIVE
              </span>
            )}
            <span
              className={`absolute right-3 top-3 z-[1] rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold text-white backdrop-blur-sm ${
                shop.category === "Food"
                  ? "bg-amber-500/80"
                  : shop.category === "Boutique"
                    ? "bg-pink-500/80"
                    : shop.category === "Electronics"
                      ? "bg-blue-500/80"
                      : shop.category === "Grocery"
                        ? "bg-emerald-500/80"
                        : shop.category === "Cosmetics"
                          ? "bg-fuchsia-500/80"
                          : "bg-zinc-500/80"
              }`}
            >
              {theme.icon} {shop.category}
            </span>
          </ShopMediaHeader>
          <div className="space-y-2 p-3 sm:p-4">
            <div className="flex items-start gap-3">
              <ShopLogoAvatar shopName={shop.name} logoUrl={shop.logo_url} size="md" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 sm:text-xl">{shop.name}</h2>
                  <span className={`rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold ${theme.badgeClass}`}>{shop.category}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400"><PinIcon />{shop.location}</div>
              </div>
            </div>
            {shop.store_bio && (<p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{shop.store_bio}</p>)}
            {((shop.min_order_amount ?? 0) > 0 || (shop.free_delivery_threshold ?? 0) > 0) && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {(shop.min_order_amount ?? 0) > 0 && (
                  <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[0.65rem] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    Min. order Rs. {shop.min_order_amount!.toLocaleString("en-PK")}
                  </span>
                )}
                {(shop.free_delivery_threshold ?? 0) > 0 && (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[0.65rem] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    Free delivery over Rs. {shop.free_delivery_threshold!.toLocaleString("en-PK")}
                  </span>
                )}
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={() => setShowContactModal(true)} disabled={!shop.whatsapp_number} className={`inline-flex items-center gap-1.5 rounded-full ${theme.buttonClass} px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50`}><WhatsAppIcon />Chat with seller</button>
            </div>
            {(shop.instagram_handle || shop.facebook_url || shop.secondary_phone) && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {shop.instagram_handle && (
                  <a href={`https://instagram.com/${shop.instagram_handle.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 px-3 py-1 text-[0.65rem] font-semibold text-white transition-opacity hover:opacity-90">
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 0 2.5 1.25 1.25 0 0 1 0-2.5M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z" /></svg>
                    @{shop.instagram_handle.replace(/^@/, "")}
                  </a>
                )}
                {shop.facebook_url && (
                  <a href={shop.facebook_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-[#1877F2] px-3 py-1 text-[0.65rem] font-semibold text-white transition-opacity hover:opacity-90">
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                    Facebook
                  </a>
                )}
                {shop.secondary_phone && (
                  <a href={`https://wa.me/${shop.secondary_phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-zinc-700 px-3 py-1 text-[0.65rem] font-semibold text-white transition-opacity hover:opacity-90 dark:bg-zinc-600">
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.62 10.79a15.053 15.053 0 0 0 6.59 6.59l2.2-2.2a1.003 1.003 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1.02 1.02 0 0 1-.25 1.02l-2.2 2.2z" /></svg>
                    {shop.secondary_phone}
                  </a>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Category Description */}
        <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{theme.categoryDescription}</p>
        </div>

        {/* ── SERVICE Section ──────────────────────────────────────── */}
        {isService && (
          <section className="space-y-3">
            <AvailabilitySchedule shopId={shop.id} compact showLiveStatus onDataLoaded={setAvailabilityDays} />
            <div className="grid grid-cols-2 gap-2">
              {shop.hourly_rate ? (
                <div className="rounded-xl border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-[0.65rem] text-zinc-500 dark:text-zinc-400">Hourly Rate</p>
                  <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">{formatRupees(shop.hourly_rate)}</p>
                </div>
              ) : null}
              {shop.call_out_charge ? (
                <div className="rounded-xl border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-[0.65rem] text-zinc-500 dark:text-zinc-400">Call-Out Charge</p>
                  <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">{formatRupees(shop.call_out_charge)}</p>
                </div>
              ) : null}
              {shop.service_area ? (
                <div className="rounded-xl border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900 col-span-2">
                  <p className="text-[0.65rem] text-zinc-500 dark:text-zinc-400">Service Area</p>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{shop.service_area}</p>
                </div>
              ) : null}
            </div>
            <button type="button" onClick={() => setShowBookingModal(true)} disabled={!shop.whatsapp_number} className={`w-full rounded-full ${theme.buttonClass} py-3 text-sm font-bold shadow-md transition-all disabled:opacity-50`}>
              <span className="flex items-center justify-center gap-2"><WhatsAppIcon /> Book via WhatsApp</span>
            </button>
          </section>
        )}

        {/* ── SERVICE: Packages Grid ──────────────────────────────── */}
        {isService && servicePackages.length > 0 && (
          <section aria-label="Service Packages">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">📋 Service Packages</h2>
              <span className="text-xs text-zinc-500">{servicePackages.length} package{servicePackages.length !== 1 && "s"}</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {servicePackages.map(pkg => (
                <div key={pkg.id} className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{pkg.name}</h3>
                    <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[0.65rem] font-bold text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">{formatRupees(pkg.price)}</span>
                  </div>
                  {pkg.description && (<p className="mt-1 text-[0.65rem] text-zinc-500 dark:text-zinc-400 line-clamp-2">{pkg.description}</p>)}
                  {pkg.estimated_duration && (<p className="mt-1 inline-flex items-center gap-1 text-[0.6rem] text-zinc-400">⏱ {pkg.estimated_duration}</p>)}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── RETAIL: Search + Sort ──────────────────────────────── */}
        {!isService && (
          <section>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2"><SearchIcon /></span>
                <input type="search" placeholder="Search products..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full rounded-full border border-zinc-200 bg-white py-2 pl-9 pr-8 text-sm text-zinc-900 placeholder-zinc-400 transition-shadow focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" aria-label="Search products" />
                {searchQuery && (<button type="button" onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-xs text-zinc-400 hover:text-zinc-600" aria-label="Clear search">✕</button>)}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <select value={priceSort} onChange={(e) => setPriceSort(e.target.value as "default" | "low" | "high")} className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" aria-label="Sort products">
                  <option value="default">All Items</option>
                  <option value="low">Price: Low to High</option>
                  <option value="high">Price: High to Low</option>
                </select>
                {priceSort !== "default" && (<button type="button" onClick={() => setPriceSort("default")} className="rounded-full px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" aria-label="Reset sort">✕</button>)}
              </div>
            </div>
          </section>
        )}

        {/* ── RETAIL: Products Grid ──────────────────────────────── */}
        {!isService && (
          <section aria-label="Products">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-zinc-900 dark:text-zinc-100"><GridIcon /> Products</h2>
              <span className="text-xs text-zinc-500">{filteredProducts.length} item{filteredProducts.length !== 1 && "s"}</span>
            </div>
            {filteredProducts.length === 0 ? (
              <EmptyState title={searchQuery ? "No products match your search" : "No products yet"} description={searchQuery ? "Try a different keyword." : "Check back later."} />
            ) : (
              <ProductGrid
                products={filteredProducts}
                columns={gridColumns}
                compact={true}
                categoryLabel={shop.category}
                onProductClick={handleProductClick}
                onAddToCart={handleAddToCart}
              />
            )}
          </section>
        )}

        {/* Reviews & Ratings */}
        <section aria-label="Customer Reviews" className="mt-4">
          <h2 className="mb-3 text-sm font-bold text-zinc-900 dark:text-zinc-100">Customer Reviews</h2>
          <div className="space-y-3">
            <RatingBreakdown reviews={reviews} />
            <ReviewForm shopId={id} onReviewSubmitted={() => fetchReviewsByShopId(id).then((r) => { if (r.success) setReviews(r.data); })} submitting={reviewSubmitting} setSubmitting={setReviewSubmitting} addToast={addToast} />
            <ReviewList reviews={reviews} loading={reviewsLoading} />
          </div>
        </section>
      </>)}

      {/* ── Contact Modal ─────────────────────────────────────────────── */}
      {showContactModal && shop && (
        <ContactModal shopName={shop.name} whatsappNumber={shop.whatsapp_number} shopId={shop.id} onClose={() => setShowContactModal(false)} />
      )}

      {/* ── Quick View Modal (cart-first, no single-item checkout) ────── */}
      {quickViewProduct && shop && (
        <QuickViewModal
          product={quickViewProduct}
          shop={{ id: shop.id, name: shop.name, whatsapp_number: shop.whatsapp_number }}
          onClose={() => setQuickViewProduct(null)}
        />
      )}

      {/* ── Service Booking Modal ─────────────────────────────────────── */}
      {showBookingModal && shop && (
        <ServiceBookingModal shop={shop} packages={servicePackages} onClose={() => setShowBookingModal(false)} onBookingPlaced={() => { setShowBookingModal(false); addToast("Booking request sent!", "success"); }} />
      )}
    </div>
  );
}

// ─── Page Export ─────────────────────────────────────────────────────────────

export default function ShopDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (<ErrorBoundary fallback={<ErrorState title="Something crashed" message="An unexpected error occurred." onRetry={() => window.location.reload()} />}><ShopDetailInner id={id} /></ErrorBoundary>);
}