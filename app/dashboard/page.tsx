"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  subscribeToOrders,
  subscribeToInquiries,
  unsubscribeAll,
} from "@/lib/supabase/realtime";
import type { Shop, Product, ShopFormData, ProductFormData, AnalyticsSummary } from "@/types";
import { PRODUCT_CATEGORIES, CATEGORY_ICONS } from "@/types";
import {
  fetchShops,
  createShop,
  updateShop,
} from "@/services/shopService";
import {
  fetchProductsByShopId,
  createProduct,
  updateProduct,
  deleteProduct,
} from "@/services/productService";
import { getOthersSubCategoryId } from "@/services/subCategoryService";
import { isValidUUID } from "@/lib/sanitization";
import { recordLegalAcceptance } from "@/services/legalService";
import { fetchAnalyticsSummary } from "@/services/analyticsService";
import ImageUpload from "@/components/ImageUpload";
import { useToast } from "@/components/Toast";
import ToggleSwitch from "@/components/ToggleSwitch";
import ShopLocationRadiusPicker from "@/components/ShopLocationRadiusPicker";
import { createStory } from "@/services/storyService";
import { fetchOrdersByShopId } from "@/services/orderService";
import { transitionOrderStatus, getValidTransitions, getStatusLabel } from "@/services/notificationService";
import { fetchCouponsByShopId, createCoupon, updateCouponStatus, deleteCoupon } from "@/services/couponService";
import { downloadProductsCSV, downloadOrdersCSV } from "@/services/exportService";
import type { Order, OrderStatus } from "@/types";
import type { Coupon } from "@/services/couponService";

const INITIAL_SHOP_FORM: ShopFormData = {
  name: "",
  category: "Others / Universal",
  location: "",
  whatsapp_number: "",
  logo_url: "",
  banner_url: "",
  is_live: false,
  instagram_handle: "",
  facebook_url: "",
  secondary_phone: "",
  business_hours: "",
  operating_status: "",
  accent_color: "",
  store_bio: "",
  announcement: "",
  service_area: "",
  hourly_rate: "",
  call_out_charge: "",
  emergency_available: false,
  shop_type: "retail",
  latitude: null,
  longitude: null,
  service_radius_km: 10,
  address_display: "",
  min_order_amount: "",
  free_delivery_threshold: "",
  delivery_fee_flat: "",
  delivery_fee_per_km: "",
};

const INITIAL_PRODUCT_FORM: ProductFormData = {
  name: "",
  description: "",
  price: 0,
  original_price: null,
  category_id: "",
  image_url: "",
  is_available: true,
};

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function ShoppingBagIcon() {
  return (
    <svg className="h-8 w-8 text-zinc-300 dark:text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function MousePointerIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /><path d="M13 13l6 6" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function ProductRow({
  product,
  onEdit,
  onDelete,
  onToggleAvailability,
  deleting,
  selected,
  onToggleSelect,
}: {
  product: Product;
  onEdit: (p: Product) => void;
  onDelete: (id: string) => void;
  onToggleAvailability: (p: Product) => void;
  deleting: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const priceLabel = new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: product.currency || "PKR",
    minimumFractionDigits: 0,
  }).format(product.price);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 transition-shadow hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={selected ?? false}
          onChange={() => onToggleSelect(product.id)}
          className="h-4 w-4 shrink-0 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-600"
          aria-label={`Select ${product.name}`}
        />
      )}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
        {product.image_url ? (
          <img src={product.image_url} alt="" className="h-full w-full rounded-lg object-cover" />
        ) : (
          <span className="text-lg font-bold text-zinc-400">P</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{product.name}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{priceLabel}</p>
      </div>
      {/* Instant availability toggle — pause/resume selling without deleting */}
      <button
        type="button"
        onClick={() => onToggleAvailability(product)}
        aria-pressed={product.is_available}
        aria-label={`${product.is_available ? "Mark out of stock" : "Mark in stock"}: ${product.name}`}
        className={`shrink-0 rounded-full px-2.5 py-1 text-[0.65rem] font-semibold transition-colors ${
          product.is_available
            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50"
            : "bg-zinc-200 text-zinc-500 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
        }`}
      >
        {product.is_available ? "✓ In Stock" : "Out of Stock"}
      </button>
      <div className="flex gap-1">
        <button type="button" onClick={() => onEdit(product)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">Edit</button>
        <button type="button" onClick={() => onDelete(product.id)} disabled={deleting} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-40"><TrashIcon /></button>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Multi-shop state
  const [allShops, setAllShops] = useState<Shop[]>([]);
  const [activeShopId, setActiveShopId] = useState<string | null>(null);
  const shop = allShops.find((s) => s.id === activeShopId) ?? null;

  const [shopForm, setShopForm] = useState<ShopFormData>(INITIAL_SHOP_FORM);
  const [shopSaving, setShopSaving] = useState(false);
  const [agreedMerchantGuidelines, setAgreedMerchantGuidelines] = useState(false);
  const [merchantTermsTouched, setMerchantTermsTouched] = useState(false);
  const { addToast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productForm, setProductForm] = useState<ProductFormData>(INITIAL_PRODUCT_FORM);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productSaving, setProductSaving] = useState(false);
  const [showMoreProductOptions, setShowMoreProductOptions] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);

  const [storyImageUrl, setStoryImageUrl] = useState("");
  const [storyCaption, setStoryCaption] = useState("");
  const [storyCreating, setStoryCreating] = useState(false);
  const [showStoryForm, setShowStoryForm] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Analytics state
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);

  // ── Live notification badges & counters (Prompt 2) ─────────────────────────
  const [newOrdersSinceRefresh, setNewOrdersSinceRefresh] = useState(0);
  const [newInquiriesSinceRefresh, setNewInquiriesSinceRefresh] = useState(0);
  const [connectionDot, setConnectionDot] = useState<"connected" | "connecting" | "disconnected">("connected");

  // ── Live Status Indicator ─────────────────────────────────────────────────
  const liveStatus = useMemo(() => {
    if (!shop) return { label: "No Shop", color: "text-zinc-400", bg: "bg-zinc-100" };
    if (shop.verification_status === "pending") {
      return { label: "⏳ Pending Review", color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-900/20" };
    }
    if (shop.verification_status === "rejected") {
      return { label: "🚫 Rejected", color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/20" };
    }
    return shop.is_live
      ? { label: "🟢 Live", color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20" }
      : { label: "⚫ Offline", color: "text-zinc-500", bg: "bg-zinc-100 dark:bg-zinc-800" };
  }, [shop]);

  // ── Compute derived metrics as memoized values (no cascading setState) ─────
  const pendingOrderCount = useMemo(
    () => orders.filter((o) => o.status === "Pending").length,
    [orders],
  );

  const liveRevenueToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return orders
      .filter((o) => o.created_at?.startsWith(today) && o.status !== "Cancelled")
      .reduce((sum, o) => sum + (o.total_amount || 0), 0);
  }, [orders]);

  // ── Activity Log ─────────────────────────────────────────────────────────
  /** Build an activity log timeline from product creation/update timestamps. */
  const activityLog = useMemo(() => {
    const events: { label: string; timestamp: string; type: "created" | "updated" }[] = [];
    for (const p of products) {
      if (p.created_at) {
        events.push({ label: `Added "${p.name}"`, timestamp: p.created_at, type: "created" });
      }
    }
    // Sort newest first and take the last 10
    return events.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 10);
  }, [products]);

  // ── Auth Check (with debug logging) ──────────────────────────────────────
  // FIX: Removed hard redirect to /login — middleware handles auth.
  // Client-side now shows a "sign in" prompt if unauthenticated instead of
  // creating a redirect loop that fights the middleware.
  const [userEmailVerified, setUserEmailVerified] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function checkSession() {
      try {
        const { data } = await supabase.auth.getUser();
        if (!cancelled) {
          // Debug log for auth diagnostics (visible in browser console)
          console.log("[TrendMart Dashboard] Auth check result:", {
            hasUser: !!data.user,
            userId: data.user?.id?.slice(0, 8) ?? null,
            emailConfirmed: !!data.user?.email_confirmed_at,
            redirectWouldHappen: !data.user,
          });

          if (data.user) {
            setUserId(data.user.id);
            setUserEmailVerified(!!data.user.email_confirmed_at);
          } else {
            // Don't hard-redirect — middleware already validated the session.
            // The user may have cookies that just need a refresh. Show the UI
            // with a sign-in prompt instead of bouncing them away.
            console.warn(
              "[TrendMart Dashboard] No user session found client-side. " +
              "Showing sign-in prompt. Middleware should have validated access.",
            );
            setUserId(null);
            setUserEmailVerified(null);
          }
          setAuthLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[TrendMart Dashboard] Auth check error:", err);
          setUserId(null);
          setUserEmailVerified(null);
          setAuthLoading(false);
        }
      }
    }
    checkSession();
    return () => { cancelled = true; };
  }, [supabase.auth, router]);

  // Load all user-owned shops
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function loadShops() {
      const result = await fetchShops();
      if (cancelled) return;
      if (result.success) {
        const myShops = result.data.filter((s) => s.owner_id === userId);
        setAllShops(myShops);
        // Auto-select first shop or match from localStorage
        const savedId = typeof window !== "undefined" ? localStorage.getItem("trendmart_active_shop") : null;
        if (savedId && myShops.some((s) => s.id === savedId)) {
          setActiveShopId(savedId);
        } else if (myShops.length > 0) {
          setActiveShopId(myShops[0].id);
        }
      }
    }
    loadShops();
    return () => { cancelled = true; };
  }, [userId]);

  // Persist active shop selection
  useEffect(() => {
    if (activeShopId && typeof window !== "undefined") {
      localStorage.setItem("trendmart_active_shop", activeShopId);
    }
  }, [activeShopId]);

  // Swap shop handler — also resets form to match selected shop
  const handleSwitchShop = useCallback((shopId: string) => {
    setActiveShopId(shopId);
    setProducts([]);
    setOrders([]);
    setAnalytics(null);
    setSelectedProductIds(new Set());
    const currentShop = allShops.find((s) => s.id === shopId);
    if (currentShop) {
      setShopForm({
        name: currentShop.name,
        category: currentShop.category,
        location: currentShop.location,
        whatsapp_number: currentShop.whatsapp_number,
        logo_url: currentShop.logo_url ?? "",
        banner_url: currentShop.banner_url ?? "",
        is_live: currentShop.is_live,
        instagram_handle: currentShop.instagram_handle ?? "",
        facebook_url: currentShop.facebook_url ?? "",
        secondary_phone: currentShop.secondary_phone ?? "",
        business_hours: currentShop.business_hours ?? "",
        operating_status: currentShop.operating_status ?? "",
        accent_color: currentShop.accent_color ?? "",
        store_bio: currentShop.store_bio ?? "",
        announcement: currentShop.announcement ?? "",
        service_area: currentShop.service_area ?? "",
        hourly_rate: currentShop.hourly_rate != null ? String(currentShop.hourly_rate) : "",
        call_out_charge: currentShop.call_out_charge != null ? String(currentShop.call_out_charge) : "",
        emergency_available: currentShop.emergency_available ?? false,
        shop_type: currentShop.shop_type ?? "retail",
        latitude: currentShop.latitude ?? null,
        longitude: currentShop.longitude ?? null,
        service_radius_km: currentShop.service_radius_km ?? 10,
        address_display: currentShop.address_display ?? "",
        min_order_amount: currentShop.min_order_amount != null && currentShop.min_order_amount > 0 ? String(currentShop.min_order_amount) : "",
        free_delivery_threshold: currentShop.free_delivery_threshold != null ? String(currentShop.free_delivery_threshold) : "",
        delivery_fee_flat: currentShop.delivery_fee_flat != null && currentShop.delivery_fee_flat > 0 ? String(currentShop.delivery_fee_flat) : "",
        delivery_fee_per_km: currentShop.delivery_fee_per_km != null && currentShop.delivery_fee_per_km > 0 ? String(currentShop.delivery_fee_per_km) : "",
      });
    } else {
      setShopForm(INITIAL_SHOP_FORM);
    }
  }, [allShops]);

  // Load active shop's data (products, orders, analytics)
  useEffect(() => {
    if (!activeShopId) return;
    let cancelled = false;

    async function loadProducts() {
      setProductsLoading(true);
      const r = await fetchProductsByShopId(activeShopId!);
      if (!cancelled && r.success) setProducts(r.data);
      setProductsLoading(false);
    }
    async function loadOrders() {
      setOrdersLoading(true);
      const r = await fetchOrdersByShopId(activeShopId!);
      if (!cancelled && r.success) setOrders(r.data);
      setOrdersLoading(false);
    }
    async function loadAnalytics() {
      const r = await fetchAnalyticsSummary(activeShopId!);
      if (!cancelled && r.success) setAnalytics(r.data);
    }
    loadProducts();
    loadOrders();
    loadAnalytics();

    return () => { cancelled = true; };
  }, [activeShopId, allShops]);

  // ── Real-time Order & Inquiry Subscriptions ──────────────────────────────
  // Automatically updates the dashboard when new orders or inquiries arrive
  // without requiring a manual page refresh.
  useEffect(() => {
    if (!activeShopId) return;

    // Subscribe to new orders for this shop
    const unsubOrders = subscribeToOrders(
      activeShopId,
      (payload) => {
        // New order created — prepend to orders list
        const newOrder = payload.new as Order;
        setOrders((prev) => [newOrder, ...prev]);
        addToast(`🔔 New order from ${newOrder.customer_name || "a customer"}!`, "info");
      },
      (payload) => {
        // Order updated (status change, etc.) — update in place
        const updated = payload.new as Order;
        setOrders((prev) =>
          prev.map((o) => (o.id === updated.id ? updated : o)),
        );
      },
    );

    // Subscribe to new customer inquiries for this shop
    const unsubInquiries = subscribeToInquiries(
      activeShopId,
      (payload) => {
        const inquiry = payload.new as {
          customer_name: string;
          message: string;
        };
        addToast(
          `📩 New inquiry from ${inquiry.customer_name || "a customer"}: "${inquiry.message?.slice(0, 60)}${(inquiry.message?.length ?? 0) > 60 ? "…" : ""}"`,
          "info",
        );
      },
    );

    // Cleanup all subscriptions when shop changes or component unmounts
    return () => {
      unsubOrders();
      unsubInquiries();
    };
  }, [activeShopId, addToast]);

  // ── Cleanup all real-time subscriptions on unmount ──────────────────────
  useEffect(() => {
    return () => {
      unsubscribeAll();
    };
  }, []);

  const handleSaveShop = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    // Mandatory Merchant Security Guidelines acceptance — only enforced the
    // first time this user registers a store (existing shops are unaffected).
    if (!shop && !agreedMerchantGuidelines) {
      setMerchantTermsTouched(true);
      addToast("Please agree to the Merchant Security Guidelines to register your store.", "error");
      return;
    }

    setShopSaving(true);
    const result = shop ? await updateShop(activeShopId!, shopForm) : await createShop(shopForm);
    if (result.success) {
      // Refresh shops list
      const refreshResult = await fetchShops();
      if (refreshResult.success) {
        const myShops = refreshResult.data.filter((s) => s.owner_id === userId);
        setAllShops(myShops);
        if (!shop) setActiveShopId(result.data.id);
      }
      if (!shop) {
        recordLegalAcceptance(userId, ["merchant_guidelines"]);
      }
      addToast(shop ? "Shop updated successfully!" : "Store registered! It's now pending Super-Admin review — you'll be notified once it's approved and visible to customers.", "success");
    } else { addToast(result.error, "error"); }
    setShopSaving(false);
  }, [shopForm, shop, addToast, userId, activeShopId, agreedMerchantGuidelines]);

  const handleSaveProduct = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!activeShopId) return;
    if (!productForm.name.trim()) { addToast("Product name is required.", "error"); return; }
    if (!productForm.category_id) { addToast("Please select a category.", "error"); return; }
    if (!productForm.price || productForm.price <= 0) { addToast("Price must be greater than 0.", "error"); return; }

    setProductSaving(true);

    // Auto-assign the "Others" sub-category in the background on create so the
    // fast 4-field form still keeps products consistent with the full taxonomy —
    // merchants never have to pick a sub-category to move fast.
    let payload: ProductFormData = productForm;
    if (!editingProductId) {
      const othersId = await getOthersSubCategoryId(productForm.category_id);
      payload = { ...productForm, sub_category_id: isValidUUID(othersId) ? othersId : null };
    }

    const result = editingProductId ? await updateProduct(editingProductId, payload) : await createProduct(activeShopId, payload);
    if (result.success) {
      setProductForm(INITIAL_PRODUCT_FORM); setEditingProductId(null); setShowMoreProductOptions(false);
      addToast(editingProductId ? "Product updated!" : "Product added! 🎉", "success");
      const rr = await fetchProductsByShopId(activeShopId); if (rr.success) setProducts(rr.data);
    } else { addToast(result.error, "error"); }
    setProductSaving(false);
  }, [productForm, activeShopId, editingProductId, addToast]);

  const handleEditProduct = useCallback((product: Product) => {
    setEditingProductId(product.id);
    setProductForm({
      name: product.name,
      description: product.description,
      price: product.price,
      original_price: product.original_price ?? null,
      category_id: product.category_id ?? "",
      image_url: product.image_url ?? "",
      is_available: product.is_available,
    });
    setShowMoreProductOptions(true);
    document.getElementById("product-form")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleCancelEdit = useCallback(() => { setEditingProductId(null); setProductForm(INITIAL_PRODUCT_FORM); setShowMoreProductOptions(false); }, []);

  /** Instantly pause/resume a product's availability from the list — no need to open the edit form. */
  const handleToggleAvailability = useCallback(async (product: Product) => {
    const nextAvailable = !product.is_available;
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, is_available: nextAvailable } : p)));
    const result = await updateProduct(product.id, {
      name: product.name,
      description: product.description,
      price: product.price,
      image_url: product.image_url ?? "",
      is_available: nextAvailable,
    });
    if (result.success) {
      addToast(nextAvailable ? `"${product.name}" is now in stock.` : `"${product.name}" marked out of stock.`, "success");
    } else {
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, is_available: product.is_available } : p)));
      addToast(result.error, "error");
    }
  }, [addToast]);

  const handleCreateStory = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!activeShopId || !storyImageUrl.trim()) return;
    setStoryCreating(true);
    const result = await createStory(activeShopId, storyImageUrl, storyCaption);
    if (result.success) { addToast("Story posted! It will appear on the homepage for 24 hours.", "success"); setStoryImageUrl(""); setStoryCaption(""); setShowStoryForm(false); }
    else { addToast(result.error, "error"); }
    setStoryCreating(false);
  }, [activeShopId, storyImageUrl, storyCaption, addToast]);

  const handleDeleteProduct = useCallback(async (productId: string) => {
    if (!activeShopId || !confirm("Delete this product permanently?")) return;
    setDeletingProductId(productId);
    const result = await deleteProduct(productId);
    if (result.success) { setProducts((prev) => prev.filter((p) => p.id !== productId)); addToast("Product deleted.", "info"); }
    else { addToast(result.error, "error"); }
    setDeletingProductId(null);
  }, [activeShopId, addToast]);

  const handleUpdateOrderStatus = useCallback(async (orderId: string, status: OrderStatus) => {
    // Uses the validated lifecycle transition (Pending → Processing → Dispatched →
    // Delivered, or → Cancelled) so the customer's live order-tracking page gets a
    // realtime notification the moment a merchant updates the status.
    const result = await transitionOrderStatus(orderId, status);
    if (result.success) {
      setOrders((prev) => prev.map((o) => o.id === orderId ? result.data : o));
      addToast(`Order marked as "${getStatusLabel(status)}".`, "success");
    } else { addToast(result.error, "error"); }
  }, [addToast]);

  const handleSignOut = useCallback(async () => { await supabase.auth.signOut(); router.replace("/"); }, [supabase.auth, router]);

  const handleToggleSelect = useCallback((productId: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedProductIds.size === products.length) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(products.map((p) => p.id)));
    }
  }, [products, selectedProductIds.size]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedProductIds.size === 0) return;
    if (!confirm(`Delete ${selectedProductIds.size} selected product(s) permanently?`)) return;
    setBatchDeleting(true);
    let successCount = 0;
    for (const id of selectedProductIds) {
      const result = await deleteProduct(id);
      if (result.success) successCount++;
    }
    setProducts((prev) => prev.filter((p) => !selectedProductIds.has(p.id)));
    setSelectedProductIds(new Set());
    addToast(`${successCount} product(s) deleted.`, successCount > 0 ? "success" : "error");
    setBatchDeleting(false);
  }, [selectedProductIds, addToast]);

  const handleBatchMarkOutOfStock = useCallback(async () => {
    if (selectedProductIds.size === 0) return;
    setBatchDeleting(true);
    let successCount = 0;
    for (const id of selectedProductIds) {
      const product = products.find((p) => p.id === id);
      if (product) {
        const result = await updateProduct(id, {
          name: product.name,
          description: product.description,
          price: product.price,
          image_url: product.image_url ?? "",
          is_available: false,
        });
        if (result.success) successCount++;
      }
    }
    // Refresh products list
    if (activeShopId) {
      const rr = await fetchProductsByShopId(activeShopId);
      if (rr.success) setProducts(rr.data);
    }
    setSelectedProductIds(new Set());
    addToast(`${successCount} product(s) marked out of stock.`, successCount > 0 ? "success" : "error");
    setBatchDeleting(false);
  }, [selectedProductIds, products, activeShopId, addToast]);

  if (authLoading) {
    return (<div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950"><div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" /></div>);
  }

  // ── Unauthenticated state (no user found client-side) ────────────────────
  if (!userId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
        <div className="mb-4 text-5xl">🔒</div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Sign In Required</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Please sign in to access your merchant dashboard.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/login?redirect=/dashboard"
            className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-700"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="rounded-xl border border-zinc-200 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-700 transition-all hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            Create Account
          </Link>
        </div>
        <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500">
          [TrendMart Debug] Client-side session not found. Check browser console for details.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* ── Email Verification Warning ───────────────────────────────────── */}
      {userEmailVerified === false && (
        <div className="sticky top-0 z-30 border-b border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/30">
          <div className="mx-auto flex max-w-3xl items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg" role="img" aria-label="Warning">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  Email Not Verified
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Please check your inbox and verify your email to unlock all features.
                </p>
              </div>
            </div>
            <Link
              href="/auth/verify-notice?redirect=/dashboard"
              className="shrink-0 rounded-lg bg-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-300 dark:bg-amber-800 dark:text-amber-200 dark:hover:bg-amber-700"
            >
              Verify Now
            </Link>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {shop ? shop.name : allShops.length > 0 ? "Dashboard" : "My Shop"}
            </h1>
            {shop && (
              <Link
                href="/dashboard/settings"
                className="rounded-full border border-zinc-200 px-2.5 py-1 text-[0.6rem] font-medium text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                ⚙️ Settings
              </Link>
            )}
            {shop && (
              <Link
                href="/dashboard/analytics"
                className="rounded-full border border-zinc-200 px-2.5 py-1 text-[0.6rem] font-medium text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                📊 Analytics
              </Link>
            )}
            {/* Multi-shop switcher */}
            {allShops.length > 1 && (
              <div className="relative">
                <select
                  value={activeShopId ?? ""}
                  onChange={(e) => handleSwitchShop(e.target.value)}
                  className="appearance-none rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 pr-7 text-xs font-medium text-zinc-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  aria-label="Switch shop"
                >
                  {allShops.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400"><ChevronDownIcon /></span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-6">
        {/* No shops message */}
        {allShops.length === 0 && (
          <section className="py-12 text-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Create your first shop below to get started!</p>
          </section>
        )}

        {/* Shop Details Form */}
        <section>
          <h2 className="mb-4 text-base font-bold text-zinc-900 dark:text-zinc-100">{shop ? "Edit Shop Details" : "Create Your Shop"}</h2>
          <form onSubmit={handleSaveShop} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Shop Name *</label>
              <input type="text" required value={shopForm.name} onChange={(e) => setShopForm((f) => ({ ...f, name: e.target.value }))} placeholder="My Trendy Store" className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Category *</label>
                <select value={shopForm.category} onChange={(e) => setShopForm((f) => ({ ...f, category: e.target.value }))} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
                  {PRODUCT_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Location</label>
                <input type="text" value={shopForm.location} onChange={(e) => setShopForm((f) => ({ ...f, location: e.target.value }))} placeholder="Lahore" className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Delivery Radius & Pin</label>
              <ShopLocationRadiusPicker
                compact
                value={{
                  latitude: shopForm.latitude,
                  longitude: shopForm.longitude,
                  service_radius_km: shopForm.service_radius_km,
                  address_display: shopForm.address_display,
                }}
                onChange={(patch) => setShopForm((f) => ({ ...f, ...patch }))}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">WhatsApp Number</label>
                <input type="text" value={shopForm.whatsapp_number} onChange={(e) => setShopForm((f) => ({ ...f, whatsapp_number: e.target.value }))} placeholder="923001234567" className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
              </div>
              <ImageUpload label="Logo" currentUrl={shopForm.logo_url} onUploaded={(url) => setShopForm((f) => ({ ...f, logo_url: url }))} folder="shops" fileId={activeShopId ?? userId ?? "new-shop"} showPreview />
            </div>
            <ImageUpload label="Store Banner" currentUrl={shopForm.banner_url} onUploaded={(url) => setShopForm((f) => ({ ...f, banner_url: url }))} folder="shops" fileId={(activeShopId ?? userId ?? "new-shop") + "-banner"} showPreview />
            {/* Social Media Links */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  <span className="inline-flex items-center gap-1">
                    Instagram Handle
                    <span className="text-zinc-400 font-normal">(optional)</span>
                  </span>
                </label>
                <input
                  type="text"
                  value={shopForm.instagram_handle}
                  onChange={(e) => setShopForm((f) => ({ ...f, instagram_handle: e.target.value }))}
                  placeholder="@yourstore"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  <span className="inline-flex items-center gap-1">
                    Facebook Page URL
                    <span className="text-zinc-400 font-normal">(optional)</span>
                  </span>
                </label>
                <input
                  type="url"
                  value={shopForm.facebook_url}
                  onChange={(e) => setShopForm((f) => ({ ...f, facebook_url: e.target.value }))}
                  placeholder="https://facebook.com/yourstore"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  <span className="inline-flex items-center gap-1">
                    Secondary Phone / WhatsApp
                    <span className="text-zinc-400 font-normal">(optional)</span>
                  </span>
                </label>
                <input
                  type="text"
                  value={shopForm.secondary_phone}
                  onChange={(e) => setShopForm((f) => ({ ...f, secondary_phone: e.target.value }))}
                  placeholder="923001234568"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>
            {/* Business Hours & Operating Status */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  <span className="inline-flex items-center gap-1">Business Hours <span className="text-zinc-400 font-normal">(optional)</span></span>
                </label>
                <input type="text" value={shopForm.business_hours} onChange={(e) => setShopForm((f) => ({ ...f, business_hours: e.target.value }))} placeholder="Mon-Sat: 9 AM - 10 PM" className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  <span className="inline-flex items-center gap-1">Operating Status <span className="text-zinc-400 font-normal">(optional)</span></span>
                </label>
                <input type="text" value={shopForm.operating_status} onChange={(e) => setShopForm((f) => ({ ...f, operating_status: e.target.value }))} placeholder="Open Today: 9 AM - 10 PM" className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
              </div>
            </div>
            {/* Announcement Banner (Prompt 97) */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                <span className="inline-flex items-center gap-1">
                  📢 Promotional Announcement
                  <span className="text-zinc-400 font-normal">(optional)</span>
                </span>
              </label>
              <input
                type="text"
                value={shopForm.announcement}
                onChange={(e) => setShopForm((f) => ({ ...f, announcement: e.target.value }))}
                placeholder="Free delivery on orders above Rs. 2000!"
                maxLength={200}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">This will appear as a sliding marquee banner at the top of your storefront page.</p>
            </div>
            <div className="flex items-center gap-3">
              <ToggleSwitch
                checked={shopForm.is_live}
                onChange={async (newLive) => {
                  setShopForm((f) => ({ ...f, is_live: newLive }));
                  if (!activeShopId) return;
                  const result = await updateShop(activeShopId, { ...shopForm, is_live: newLive });
                  if (result.success) {
                    setAllShops((prev) => prev.map((s) => s.id === activeShopId ? result.data : s));
                    addToast(newLive ? "Shop is now LIVE 🟢" : "Shop is now offline", "success");
                  } else {
                    setShopForm((f) => ({ ...f, is_live: !newLive }));
                    addToast(result.error, "error");
                  }
                }}
                label="Toggle shop live status"
                visibleLabel="Mark shop as Live (visible on homepage)"
              />
            </div>

            {/* Mandatory Merchant Security Guidelines acceptance — first registration only */}
            {!shop && (
              <div>
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={agreedMerchantGuidelines}
                    onChange={(e) => { setAgreedMerchantGuidelines(e.target.checked); setMerchantTermsTouched(true); }}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-600"
                  />
                  <span className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                    I agree to TrendMart&apos;s{" "}
                    <Link href="/legal/merchant-guidelines" target="_blank" className="font-medium text-emerald-600 underline underline-offset-2 hover:text-emerald-700 dark:text-emerald-400">Merchant Security Guidelines</Link>
                    {" "}and{" "}
                    <Link href="/legal/terms" target="_blank" className="font-medium text-emerald-600 underline underline-offset-2 hover:text-emerald-700 dark:text-emerald-400">Terms &amp; Conditions</Link>.
                  </span>
                </label>
                {merchantTermsTouched && !agreedMerchantGuidelines && (
                  <p className="mt-1.5 text-xs text-red-500 dark:text-red-400">You must agree to the guidelines to register your store.</p>
                )}
              </div>
            )}

            <button type="submit" disabled={shopSaving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 dark:focus:ring-offset-zinc-900"><SaveIcon />{shopSaving ? "Saving…" : shop ? "Update Shop" : "Create Shop"}</button>
          </form>
        </section>

        {/* Analytics Summary Cards */}
        {activeShopId && (
          <section>
            <h2 className="mb-4 text-base font-bold text-zinc-900 dark:text-zinc-100">Analytics Overview</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{analytics?.total_views ?? "—"}</p>
                <p className="mt-1 flex items-center justify-center gap-1 text-xs text-zinc-500 dark:text-zinc-400"><EyeIcon /> Total Views</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{analytics?.total_product_clicks ?? "—"}</p>
                <p className="mt-1 flex items-center justify-center gap-1 text-xs text-zinc-500 dark:text-zinc-400"><MousePointerIcon /> Product Clicks</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{analytics?.views_today ?? "—"}</p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Views Today</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{analytics?.clicks_today ?? "—"}</p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Clicks Today</p>
              </div>
            </div>
            {/* Verification queue banner */}
            {shop && shop.verification_status === "pending" && (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                ⏳ <strong>Your store is pending Super-Admin review.</strong>{" "}
                It won&apos;t appear on the customer-facing marketplace until it&apos;s approved. You can keep setting up products and details in the meantime.
              </div>
            )}
            {shop && shop.verification_status === "rejected" && (
              <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                🚫 <strong>Your store registration was not approved.</strong>{" "}
                Please <Link href="/support" className="underline font-medium">contact support</Link> for details or to request another review.
              </div>
            )}

            {/* Quick stat cards */}
            {shop && (
              <>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900"><p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{products.length}</p><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Active Products</p></div>
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900"><p className={`text-2xl font-bold ${liveStatus.color}`}>{liveStatus.label}</p><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Publishing Status</p></div>
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900"><p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{orders.length}</p><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Orders</p></div>
                  <Link href={`/shop/${activeShopId}`} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center shadow-sm transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40"><p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">View Shop</p><p className="mt-1 text-xs text-emerald-500 dark:text-emerald-400">Preview ↗</p></Link>
                </div>

                {/* ── Category Distribution ──────────────────────────────── */}
                {products.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                    <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Product Category Breakdown
                    </h4>
                    <div className="space-y-2">
                      {/* Products are all in the same shop, so we show a single bar */}
                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">{shop?.category ?? "General"}</span>
                          <span className="text-zinc-500 dark:text-zinc-400">{products.length} product{products.length !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: "100%" }} />
                        </div>
                      </div>
                      {/* Available vs Sold Out breakdown */}
                      {(() => {
                        const available = products.filter((p) => p.is_available).length;
                        const soldOut = products.length - available;
                        const availablePct = products.length > 0 ? Math.round((available / products.length) * 100) : 0;
                        const soldOutPct = products.length > 0 ? Math.round((soldOut / products.length) * 100) : 0;
                        return (
                          <>
                            <div className="mt-3 mb-1 flex items-center justify-between text-xs">
                              <span className="font-medium text-zinc-700 dark:text-zinc-300">Available ({available})</span>
                              <span className="text-zinc-500 dark:text-zinc-400">{availablePct}%</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${availablePct}%` }} />
                            </div>
                            <div className="mt-2 mb-1 flex items-center justify-between text-xs">
                              <span className="font-medium text-zinc-700 dark:text-zinc-300">Sold Out ({soldOut})</span>
                              <span className="text-zinc-500 dark:text-zinc-400">{soldOutPct}%</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                              <div className="h-full rounded-full bg-red-400 transition-all" style={{ width: `${soldOutPct}%` }} />
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Activity Timeline ─────────────────────────────────────── */}
            {shop && activityLog.length > 0 && (
              <div className="mt-5">
                <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <ClockIcon />
                  Recent Activity
                </h3>
                <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <table className="w-full text-left text-sm" role="table" aria-label="Recent product activity log">
                    <thead className="border-b border-zinc-100 dark:border-zinc-800">
                      <tr>
                        <th scope="col" className="px-4 py-2.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Action</th>
                        <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-500 dark:text-zinc-400">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activityLog.map((entry, i) => (
                        <tr key={i} className="border-t border-zinc-50 dark:border-zinc-800/50">
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center gap-1.5">
                              <span className={`h-1.5 w-1.5 rounded-full ${entry.type === "created" ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden="true" />
                              {entry.label}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs text-zinc-400 dark:text-zinc-500">
                            {new Date(entry.timestamp).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Story Creator */}
        {activeShopId && (
          <section>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Promotional Story</h2><button type="button" onClick={() => setShowStoryForm(!showStoryForm)} className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400">{showStoryForm ? "Cancel" : "+ Add Story"}</button></div>
            {showStoryForm && (
              <form onSubmit={handleCreateStory} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Stories are visible on the homepage for 24 hours. Upload an image and optional caption.</p>
                <ImageUpload label="Story Image" currentUrl={storyImageUrl} onUploaded={setStoryImageUrl} folder="stories" fileId={activeShopId} showPreview />
                <div><label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Caption (optional)</label><input type="text" value={storyCaption} onChange={(e) => setStoryCaption(e.target.value)} placeholder="New arrivals! 🎉" maxLength={80} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" /></div>
                <button type="submit" disabled={storyCreating || !storyImageUrl.trim()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 dark:focus:ring-offset-zinc-900">{storyCreating ? "Posting…" : "Post Story"}</button>
              </form>
            )}
          </section>
        )}

        {/* Orders Section */}
        {activeShopId && (
          <section>
            <h2 className="mb-4 text-base font-bold text-zinc-900 dark:text-zinc-100">Order Inquiries ({orders.length})</h2>
            {ordersLoading && <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => (<div key={i} className="animate-pulse rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"><div className="h-10 rounded bg-zinc-200 dark:bg-zinc-800" /></div>))}</div>}
            {!ordersLoading && orders.length === 0 && <p className="text-sm text-zinc-400 dark:text-zinc-500">No order inquiries yet.</p>}
            {!ordersLoading && orders.length > 0 && (
              <div className="space-y-2">
                {orders.map((order) => {
                  const firstItem = order.items_json?.[0];
                  const itemCount = order.items_json?.length ?? 1;
                  const itemLabel = firstItem?.name ?? "Order";
                  return (
                    <div key={order.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {itemLabel}{itemCount > 1 ? ` +${itemCount - 1} more` : ""}
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            Rs. {order.total_amount.toLocaleString()} · {new Date(order.created_at).toLocaleDateString()}
                            {order.customer_name && ` · ${order.customer_name}`}
                          </p>
                        </div>
                        <select
                          value={order.status}
                          onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value as OrderStatus)}
                          disabled={getValidTransitions(order.status).length === 0}
                          className="shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        >
                          <option value={order.status}>{getStatusLabel(order.status)}</option>
                          {getValidTransitions(order.status).map((next) => (
                            <option key={next} value={next}>{getStatusLabel(next)}</option>
                          ))}
                        </select>
                      </div>
                      {/* Show items breakdown */}
                      {order.items_json && order.items_json.length > 0 && (
                        <div className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                          {order.items_json.map((item, i) => (
                            <div key={i} className="flex items-center justify-between py-0.5 text-xs">
                              <span className="text-zinc-600 dark:text-zinc-400">{item.name}{item.variant ? ` (${item.variant})` : ""}</span>
                              <span className="font-medium text-zinc-900 dark:text-zinc-200">Rs. {item.price.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Product Management — Ultra-fast 4-field creation: Name, Category, Price, Image */}
        {activeShopId && (
          <section id="product-form">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{editingProductId ? "Edit Product" : "Add New Product"}</h2>
              {!editingProductId && <span className="text-[0.65rem] font-medium text-zinc-400 dark:text-zinc-500">⚡ 4 fields — list it in seconds</span>}
            </div>
            <form onSubmit={handleSaveProduct} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Product Name *</label>
                <input type="text" required value={productForm.name} onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))} placeholder="Wireless Earbuds" className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Category *</label>
                  <select required value={productForm.category_id ?? ""} onChange={(e) => setProductForm((f) => ({ ...f, category_id: e.target.value }))} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
                    <option value="" disabled>Select a category…</option>
                    {PRODUCT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{CATEGORY_ICONS[cat] ?? "📦"} {cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Price (PKR) *</label>
                  <input type="number" required min={0} step={1} value={productForm.price} onChange={(e) => setProductForm((f) => ({ ...f, price: Number(e.target.value) }))} placeholder="2499" className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
                </div>
              </div>
              <ImageUpload label="Product Image *" currentUrl={productForm.image_url} onUploaded={(url) => setProductForm((f) => ({ ...f, image_url: url }))} folder="products" fileId={editingProductId ?? "new-product"} showPreview />

              {/* Optional details — kept out of the primary fast path */}
              <button
                type="button"
                onClick={() => setShowMoreProductOptions((v) => !v)}
                className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
              >
                {showMoreProductOptions ? "− Hide optional details" : "+ Add description, discount price & availability (optional)"}
              </button>

              {showMoreProductOptions && (
                <div className="space-y-4 rounded-xl border border-dashed border-zinc-200 p-4 dark:border-zinc-700">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Description</label>
                    <textarea rows={2} value={productForm.description} onChange={(e) => setProductForm((f) => ({ ...f, description: e.target.value }))} placeholder="Brief product description…" className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Original Price (PKR) — shows a &quot;% OFF&quot; badge</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={productForm.original_price ?? ""}
                      onChange={(e) => setProductForm((f) => ({ ...f, original_price: e.target.value ? Number(e.target.value) : null }))}
                      placeholder="e.g. 2999 (before discount)"
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                    {!!productForm.original_price && productForm.original_price > productForm.price && (
                      <p className="mt-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        🏷️ {Math.round(((productForm.original_price - productForm.price) / productForm.original_price) * 100)}% OFF badge will show on this product.
                      </p>
                    )}
                    {!!productForm.original_price && productForm.original_price <= productForm.price && (
                      <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                        Original price must be higher than the selling price to show a discount badge.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <ToggleSwitch
                      checked={productForm.is_available}
                      onChange={(v) => setProductForm((f) => ({ ...f, is_available: v }))}
                      label="Toggle product availability"
                      visibleLabel="Available for ordering"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button type="submit" disabled={productSaving} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 dark:focus:ring-offset-zinc-900"><PlusIcon />{productSaving ? "Saving…" : editingProductId ? "Update Product" : "Add Product"}</button>
                {editingProductId && <button type="button" onClick={handleCancelEdit} className="rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">Cancel</button>}
              </div>
            </form>
          </section>
        )}

        {/* Product List */}
        {activeShopId && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Your Products ({products.length})</h2>
              {!productsLoading && products.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  {selectedProductIds.size === products.length ? "Deselect All" : "Select All"}
                </button>
              )}
            </div>
            {/* Batch Action Toolbar */}
            {selectedProductIds.size > 0 && (
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 dark:border-emerald-800 dark:bg-emerald-900/20">
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  {selectedProductIds.size} selected
                </span>
                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={handleBatchMarkOutOfStock}
                    disabled={batchDeleting}
                    className="rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-200 disabled:opacity-50 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50"
                  >
                    Mark Out of Stock
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchDelete}
                    disabled={batchDeleting}
                    className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 disabled:opacity-50 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                  >
                    {batchDeleting ? "Deleting…" : "Delete Selected"}
                  </button>
                </div>
              </div>
            )}
            {productsLoading && <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => (<div key={i} className="animate-pulse rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"><div className="h-10 rounded bg-zinc-200 dark:bg-zinc-800" /></div>))}</div>}
            {!productsLoading && products.length === 0 && (<div className="rounded-2xl border border-dashed border-zinc-300 bg-white py-12 text-center dark:border-zinc-700 dark:bg-zinc-900"><div className="mb-2 flex justify-center"><ShoppingBagIcon /></div><p className="text-sm text-zinc-500 dark:text-zinc-400">No products yet. Add your first product above!</p></div>)}
            {!productsLoading && products.length > 0 && (<div className="space-y-2">{products.map((product) => (<ProductRow key={product.id} product={product} onEdit={handleEditProduct} onDelete={handleDeleteProduct} onToggleAvailability={handleToggleAvailability} deleting={deletingProductId === product.id} selected={selectedProductIds.has(product.id)} onToggleSelect={handleToggleSelect} />))}</div>)}
          </section>
        )}

        {/* Coupon Code Management */}
        {activeShopId && <CouponManager shopId={activeShopId} addToast={addToast} />}

        {/* CSV Data Export */}
        {activeShopId && shop && (
          <section>
            <h2 className="mb-4 text-base font-bold text-zinc-900 dark:text-zinc-100">Export Data</h2>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => { downloadProductsCSV(products, shop.name); addToast("Products CSV downloaded!", "success"); }}
                disabled={products.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                📦 Download Products CSV
              </button>
              <button
                type="button"
                onClick={() => { downloadOrdersCSV(orders, shop.name); addToast("Orders CSV downloaded!", "success"); }}
                disabled={orders.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                🧾 Download Orders CSV
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
              Download your product catalog and order history as CSV spreadsheets for offline tracking.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Coupon Manager Sub-Component                                               */
/* -------------------------------------------------------------------------- */

function CouponManager({ shopId, addToast }: { shopId: string; addToast: (msg: string, variant?: "success" | "error" | "info") => void }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(false);
  const [showCouponForm, setShowCouponForm] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [couponSaving, setCouponSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setCouponsLoading(true);
      const r = await fetchCouponsByShopId(shopId);
      if (!cancelled && r.success) setCoupons(r.data);
      setCouponsLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [shopId]);

  const handleCreateCoupon = async (e: FormEvent) => {
    e.preventDefault();
    if (!newCode.trim() || !discountValue) return;
    setCouponSaving(true);
    const pct = discountType === "percent" ? parseFloat(discountValue) : undefined;
    const amt = discountType === "amount" ? parseFloat(discountValue) : undefined;
    const result = await createCoupon(shopId, newCode, pct, amt, expiryDate || undefined);
    if (result.success) {
      addToast(`Coupon "${newCode.toUpperCase()}" created!`, "success");
      setNewCode(""); setDiscountValue(""); setExpiryDate("");
      setShowCouponForm(false);
      // Refresh coupons list
      const refreshed = await fetchCouponsByShopId(shopId);
      if (refreshed.success) setCoupons(refreshed.data);
    } else { addToast(result.error, "error"); }
    setCouponSaving(false);
  };

  const handleToggleActive = async (couponId: string, currentActive: boolean) => {
    const result = await updateCouponStatus(couponId, !currentActive);
    if (result.success) {
      setCoupons((prev) => prev.map((c) => c.id === couponId ? result.data : c));
      addToast(`Coupon ${result.data.is_active ? "activated" : "deactivated"}.`, "success");
    } else { addToast(result.error, "error"); }
  };

  const handleDeleteCoupon = async (couponId: string) => {
    if (!confirm("Delete this coupon permanently?")) return;
    const result = await deleteCoupon(couponId);
    if (result.success) {
      setCoupons((prev) => prev.filter((c) => c.id !== couponId));
      addToast("Coupon deleted.", "info");
    } else { addToast(result.error, "error"); }
  };

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Discount Coupons ({coupons.length})</h2>
        <button
          type="button"
          onClick={() => setShowCouponForm(!showCouponForm)}
          className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
        >
          {showCouponForm ? "Cancel" : "+ Add Coupon"}
        </button>
      </div>

      {/* Create form */}
      {showCouponForm && (
        <form onSubmit={handleCreateCoupon} className="mb-4 space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Create a discount code for your customers.</p>
          <div className="flex gap-2">
            <input
              type="text" required value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              placeholder="CODE (e.g. SAVE10)"
              maxLength={20}
              className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-bold uppercase tracking-wider text-zinc-900 placeholder:font-normal placeholder:tracking-normal placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as "percent" | "amount")}
              className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="percent">Percentage (%)</option>
              <option value="amount">Fixed Amount (Rs.)</option>
            </select>
            <input
              type="number" required min={1} max={discountType === "percent" ? 100 : 99999} step={1}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder={discountType === "percent" ? "10" : "200"}
              className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              title="Expiry date (optional)"
            />
          </div>
          <button type="submit" disabled={couponSaving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 dark:focus:ring-offset-zinc-900">
            {couponSaving ? "Creating…" : "Create Coupon"}
          </button>
        </form>
      )}

      {/* Coupon list */}
            {couponsLoading && <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => (<div key={i} className="animate-pulse rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"><div className="h-10 rounded bg-zinc-200 dark:bg-zinc-800" /></div>))}</div>}
      {!couponsLoading && coupons.length === 0 && <p className="text-sm text-zinc-400 dark:text-zinc-500">No coupons created yet.</p>}
      {!couponsLoading && coupons.map((c) => (
        <div key={c.id} className="mb-2 flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 transition-shadow hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">{c.code}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.is_active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"}`}>
                {c.is_active ? "Active" : "Disabled"}
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {c.discount_percent ? `${c.discount_percent}% off` : `Rs. ${c.discount_amount} off`}
              {c.expiry_date && ` · Expires ${new Date(c.expiry_date).toLocaleDateString()}`}
            </p>
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={() => handleToggleActive(c.id, c.is_active)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">{c.is_active ? "Disable" : "Enable"}</button>
            <button type="button" onClick={() => handleDeleteCoupon(c.id)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"><TrashIcon /></button>
          </div>
        </div>
      ))}
    </section>
  );
}
