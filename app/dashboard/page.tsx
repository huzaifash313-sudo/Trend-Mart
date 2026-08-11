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
import { PRODUCT_CATEGORIES } from "@/types";
import {
  fetchMyShops,
  createShop,
  updateShop,
} from "@/services/shopService";
import {
  fetchProductsByShopId,
  createProduct,
  updateProduct,
  deleteProduct,
} from "@/services/productService";
import { formatRupees } from "@/lib/formatters";
import {
  fetchSubCategories,
  getOthersSubCategoryId,
  resolveSubCategoryId,
  type SubCategoryWithMeta,
} from "@/services/subCategoryService";
import { isValidUUID } from "@/lib/sanitization";
import { formatPkPhoneInput, PK_PHONE_PLACEHOLDER } from "@/lib/phoneFormat";
import { recordLegalAcceptance } from "@/services/legalService";
import { fetchAnalyticsSummary } from "@/services/analyticsService";
import ImageUpload from "@/components/ImageUpload";
import MultiImageUpload from "@/components/MultiImageUpload";
import { getProductImages, normalizeProductGallery } from "@/lib/productImages";
import { useToast } from "@/components/Toast";
import ToggleSwitch from "@/components/ToggleSwitch";
import ShopLocationRadiusPicker from "@/components/ShopLocationRadiusPicker";
import BulkProductCreator from "@/components/BulkProductCreator";
import { createStory } from "@/services/storyService";
import { fetchOrdersByShopId } from "@/services/orderService";
import { transitionOrderStatus, getValidTransitions, getStatusLabel } from "@/services/notificationService";
import { downloadProductsCSV, downloadOrdersCSV } from "@/services/exportService";
import type { Order, OrderStatus } from "@/types";
import {
  OFFER_DURATION_PRESETS,
  expiresAtFromHours,
} from "@/lib/shopOfferTicker";

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
  announcement_expires_at: "",
  service_area: "",
  hourly_rate: "",
  call_out_charge: "",
  emergency_available: false,
  shop_type: "retail",
  latitude: null,
  longitude: null,
  service_radius_km: 10,
  delivery_zones: [],
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
  deal_expires_at: null,
  category_id: "",
  sub_category_id: "",
  image_url: "",
  images: [],
  is_available: true,
};

/** Map a Shop row into the dashboard edit form so refresh keeps merchant data. */
function shopToFormData(s: Shop): ShopFormData {
  return {
    name: s.name,
    category: s.category,
    location: s.location,
    whatsapp_number: s.whatsapp_number,
    logo_url: s.logo_url ?? "",
    banner_url: s.banner_url ?? "",
    is_live: s.is_live,
    instagram_handle: s.instagram_handle ?? "",
    facebook_url: s.facebook_url ?? "",
    secondary_phone: s.secondary_phone ?? "",
    business_hours: s.business_hours ?? "",
    operating_status: s.operating_status ?? "",
    accent_color: s.accent_color ?? "",
    store_bio: s.store_bio ?? "",
    announcement: s.announcement ?? "",
    announcement_expires_at: s.announcement_expires_at ?? "",
    service_area: s.service_area ?? "",
    hourly_rate: s.hourly_rate != null ? String(s.hourly_rate) : "",
    call_out_charge: s.call_out_charge != null ? String(s.call_out_charge) : "",
    emergency_available: s.emergency_available ?? false,
    shop_type: s.shop_type ?? "retail",
    latitude: s.latitude ?? null,
    longitude: s.longitude ?? null,
    service_radius_km: s.service_radius_km ?? 10,
    delivery_zones: s.delivery_zones ?? [],
    address_display: s.address_display ?? "",
    min_order_amount: s.min_order_amount != null && s.min_order_amount > 0 ? String(s.min_order_amount) : "",
    free_delivery_threshold: s.free_delivery_threshold != null ? String(s.free_delivery_threshold) : "",
    delivery_fee_flat: s.delivery_fee_flat != null && s.delivery_fee_flat > 0 ? String(s.delivery_fee_flat) : "",
    delivery_fee_per_km: s.delivery_fee_per_km != null && s.delivery_fee_per_km > 0 ? String(s.delivery_fee_per_km) : "",
  };
}

function durationKeyFromExpires(expiresAt: string | null | undefined): string {
  if (!expiresAt?.trim()) return "none";
  const end = new Date(expiresAt).getTime();
  if (Number.isNaN(end)) return "custom";
  const hoursLeft = (end - Date.now()) / (60 * 60 * 1000);
  if (hoursLeft <= 0) return "custom";
  const match = OFFER_DURATION_PRESETS.find(
    (p) => p.hours != null && Math.abs(p.hours - hoursLeft) < 0.35,
  );
  return match?.key ?? "custom";
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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

/** How many products per page — denser list so less scrolling. */
const PRODUCTS_PAGE_SIZE = 40;

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
  const priceLabel = formatRupees(product.price);

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border bg-white px-2.5 py-2 transition-colors hover:bg-zinc-50/80 dark:bg-zinc-900 dark:hover:bg-zinc-800/60 sm:gap-3 sm:px-3 ${
        product.is_available
          ? "border-zinc-200 dark:border-zinc-800"
          : "border-zinc-200 opacity-70 dark:border-zinc-800"
      }`}
    >
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={selected ?? false}
          onChange={() => onToggleSelect(product.id)}
          className="h-3.5 w-3.5 shrink-0 rounded border-zinc-300 text-emerald-600 focus:ring-1 focus:ring-emerald-500 dark:border-zinc-600"
          aria-label={`Select ${product.name}`}
        />
      )}

      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800">
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.image_url} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="text-xs font-bold text-zinc-400">
            {product.name.charAt(0).toUpperCase() || "P"}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {product.name}
          </span>
          <span
            className={`hidden shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold sm:inline ${
              product.is_available
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {product.is_available ? "In Stock" : "Out"}
          </span>
        </div>
        <p className="truncate text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {priceLabel}
          {!product.is_available ? (
            <span className="ml-1.5 text-zinc-400 sm:hidden">· Out</span>
          ) : null}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <button
          type="button"
          onClick={() => onToggleAvailability(product)}
          aria-pressed={product.is_available}
          className="rounded-md px-2 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 sm:text-xs"
        >
          {product.is_available ? "Mark Out" : "Mark In"}
        </button>
        <button
          type="button"
          onClick={() => onEdit(product)}
          className="rounded-md px-2 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 sm:text-xs"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => onDelete(product.id)}
          disabled={deleting}
          className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-900/20"
          aria-label={`Delete ${product.name}`}
        >
          <TrashIcon />
        </button>
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
  /** Preset key for offer duration select (`none` | `6h` | … | `custom`). */
  const [offerDurationKey, setOfferDurationKey] = useState<string>("none");
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
  const [productSubCategories, setProductSubCategories] = useState<SubCategoryWithMeta[]>([]);
  const [productSubsLoading, setProductSubsLoading] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productPage, setProductPage] = useState(1);

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
    if (shop.verification_status === "rejected") {
      return { label: "🚫 Suspended", color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/20" };
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

  // Load shops owned by this merchant (server-side owner_id filter)
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function loadShops() {
      const result = await fetchMyShops();
      if (cancelled) return;
      if (!result.success) {
        addToast(result.error || "Could not load your shops.", "error");
        return;
      }
      const myShops = result.data;
      setAllShops(myShops);
      const savedId =
        typeof window !== "undefined"
          ? localStorage.getItem("trendmart_active_shop")
          : null;
      const nextId =
        (savedId && myShops.some((s) => s.id === savedId) && savedId) ||
        myShops[0]?.id ||
        null;
      setActiveShopId(nextId);
      if (nextId) {
        const current = myShops.find((s) => s.id === nextId);
        if (current) {
          const form = shopToFormData(current);
          setShopForm(form);
          setOfferDurationKey(durationKeyFromExpires(form.announcement_expires_at));
        }
      } else {
        setShopForm(INITIAL_SHOP_FORM);
        setOfferDurationKey("none");
      }
    }
    loadShops();
    return () => {
      cancelled = true;
    };
  }, [userId, addToast]);

  // Persist active shop selection
  useEffect(() => {
    if (activeShopId && typeof window !== "undefined") {
      localStorage.setItem("trendmart_active_shop", activeShopId);
    }
  }, [activeShopId]);

  // Load sub-categories for the shop's main category (product taxonomy)
  useEffect(() => {
    const cat = shop?.category;
    if (!cat) {
      setProductSubCategories([]);
      return;
    }
    let cancelled = false;
    setProductSubsLoading(true);
    fetchSubCategories(cat).then((result) => {
      if (cancelled) return;
      if (result.success) {
        setProductSubCategories(result.data);
        const others = result.data.find((s) => s.is_others);
        setProductForm((f) => ({
          ...f,
          category_id: cat,
          sub_category_id: f.sub_category_id || others?.id || "",
        }));
      } else {
        setProductSubCategories([]);
      }
      setProductSubsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [shop?.category]);

  // Swap shop handler — also resets form to match selected shop
  const handleSwitchShop = useCallback((shopId: string) => {
    setActiveShopId(shopId);
    setProducts([]);
    setOrders([]);
    setAnalytics(null);
    setSelectedProductIds(new Set());
    const currentShop = allShops.find((s) => s.id === shopId);
    if (currentShop) {
      setShopForm(shopToFormData(currentShop));
      setOfferDurationKey(durationKeyFromExpires(currentShop.announcement_expires_at));
    } else {
      setShopForm(INITIAL_SHOP_FORM);
      setOfferDurationKey("none");
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

    if (!shop && userEmailVerified === false) {
      addToast("Verify your email first — then your store goes live immediately.", "error");
      return;
    }

    setShopSaving(true);
    const result = shop ? await updateShop(activeShopId!, shopForm) : await createShop(shopForm);
    if (result.success) {
      // Refresh from owner-scoped query so we never mix in demo/public shops
      const refreshResult = await fetchMyShops();
      if (refreshResult.success) {
        setAllShops(refreshResult.data);
        const nextId = result.data.id;
        setActiveShopId(nextId);
        setShopForm(shopToFormData(result.data));
        setOfferDurationKey(durationKeyFromExpires(result.data.announcement_expires_at));
        if (typeof window !== "undefined") {
          localStorage.setItem("trendmart_active_shop", nextId);
        }
      } else {
        // Still keep the saved row in local state even if refresh fails
        setAllShops((prev) => {
          const others = prev.filter((s) => s.id !== result.data.id);
          return [result.data, ...others];
        });
        setActiveShopId(result.data.id);
        setShopForm(shopToFormData(result.data));
      }
      if (!shop) {
        recordLegalAcceptance(userId, ["merchant_guidelines"]);
      }
      addToast(shop ? "Shop updated successfully!" : "Store registered — it's live on the marketplace now!", "success");
    } else { addToast(result.error, "error"); }
    setShopSaving(false);
  }, [shopForm, shop, addToast, userId, activeShopId, agreedMerchantGuidelines, userEmailVerified]);

  const handleSaveProduct = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!activeShopId || !shop) return;
    if (!productForm.name.trim()) { addToast("Product name is required.", "error"); return; }
    if (!productForm.sub_category_id) { addToast("Please select a sub-category.", "error"); return; }
    if (!productForm.price || productForm.price <= 0) { addToast("Price must be greater than 0.", "error"); return; }

    setProductSaving(true);

    const mainCategory = shop.category;
    let subId: string | null = productForm.sub_category_id ?? null;
    if (subId && !isValidUUID(subId)) {
      subId = await resolveSubCategoryId(mainCategory, subId);
    }
    if (!subId || !isValidUUID(subId)) {
      const othersId = await getOthersSubCategoryId(mainCategory);
      subId = isValidUUID(othersId) ? othersId : null;
    }
    if (!subId) {
      addToast("Could not save sub-category. Try again in a moment.", "error");
      setProductSaving(false);
      return;
    }

    const gallery = normalizeProductGallery(
      Array.isArray(productForm.images) && productForm.images.length > 0
        ? productForm.images
        : productForm.image_url
          ? [productForm.image_url]
          : [],
    );
    const payload: ProductFormData = {
      ...productForm,
      category_id: mainCategory,
      sub_category_id: subId,
      image_url: gallery.image_url,
      images: gallery.images,
    };

    const result = editingProductId ? await updateProduct(editingProductId, payload) : await createProduct(activeShopId, payload);
    if (result.success) {
      const others = productSubCategories.find((s) => s.is_others);
      setProductForm({
        ...INITIAL_PRODUCT_FORM,
        category_id: mainCategory,
        sub_category_id: others?.id ?? "",
      });
      setEditingProductId(null);
      setShowMoreProductOptions(false);
      addToast(editingProductId ? "Product updated!" : "Product added! 🎉", "success");
      const rr = await fetchProductsByShopId(activeShopId); if (rr.success) setProducts(rr.data);
    } else { addToast(result.error, "error"); }
    setProductSaving(false);
  }, [productForm, activeShopId, editingProductId, addToast, shop, productSubCategories]);

  const handleEditProduct = useCallback((product: Product) => {
    setEditingProductId(product.id);
    const gallery = getProductImages(product);
    setProductForm({
      name: product.name,
      description: product.description,
      price: product.price,
      original_price: product.original_price ?? null,
      deal_expires_at: product.deal_expires_at ?? null,
      category_id: product.category_id ?? shop?.category ?? "",
      sub_category_id: product.sub_category_id ?? "",
      image_url: gallery[0] ?? "",
      images: gallery,
      is_available: product.is_available,
    });
    setShowMoreProductOptions(true);
    document.getElementById("product-form")?.scrollIntoView({ behavior: "smooth" });
  }, [shop?.category]);

  const handleCancelEdit = useCallback(() => {
    const others = productSubCategories.find((s) => s.is_others);
    setEditingProductId(null);
    setProductForm({
      ...INITIAL_PRODUCT_FORM,
      category_id: shop?.category ?? "",
      sub_category_id: others?.id ?? "",
    });
    setShowMoreProductOptions(false);
  }, [productSubCategories, shop?.category]);

  const refreshProducts = useCallback(async () => {
    if (!activeShopId) return;
    const rr = await fetchProductsByShopId(activeShopId);
    if (rr.success) setProducts(rr.data);
  }, [activeShopId]);

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

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => {
      const name = p.name.toLowerCase();
      const desc = (p.description ?? "").toLowerCase();
      const price = String(p.price);
      return name.includes(q) || desc.includes(q) || price.includes(q);
    });
  }, [products, productSearch]);

  const productTotalPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PAGE_SIZE));
  const safeProductPage = Math.min(productPage, productTotalPages);
  const pagedProducts = useMemo(() => {
    const start = (safeProductPage - 1) * PRODUCTS_PAGE_SIZE;
    return filteredProducts.slice(start, start + PRODUCTS_PAGE_SIZE);
  }, [filteredProducts, safeProductPage]);

  useEffect(() => {
    setProductPage(1);
  }, [productSearch, activeShopId]);

  const handleSelectAll = useCallback(() => {
    const ids = filteredProducts.map((p) => p.id);
    const allSelected =
      ids.length > 0 && ids.every((id) => selectedProductIds.has(id));
    if (allSelected) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(ids));
    }
  }, [filteredProducts, selectedProductIds]);

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
    return (<div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]"><div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" /></div>);
  }

  // ── Unauthenticated state (no user found client-side) ────────────────────
  if (!userId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-[color:var(--tm-surface)]">
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
    <div className="min-h-screen bg-zinc-50 dark:bg-[color:var(--tm-bg)]">
      {/* ── Email Verification Warning ───────────────────────────────────── */}
      {userEmailVerified === false && (
        <div className="sticky top-0 z-30 border-b border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-900/30">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-base" role="img" aria-label="Warning">⚠️</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                  Email Not Verified
                </p>
                <p className="text-[0.65rem] text-amber-600 dark:text-amber-400">
                  Verify email to go live — stores publish right after verification.
                </p>
              </div>
            </div>
            <Link
              href="/auth/verify-notice?redirect=/dashboard"
              className="btn-compact shrink-0 rounded-lg bg-amber-200 px-2.5 text-[0.65rem] font-semibold text-amber-800 transition-colors hover:bg-amber-300 dark:bg-amber-800 dark:text-amber-200 dark:hover:bg-amber-700"
            >
              Verify Now
            </Link>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)]/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h1 className="truncate text-base font-bold tracking-tight text-emerald-600 dark:text-emerald-400 sm:text-lg">
              {shop ? shop.name : allShops.length > 0 ? "Dashboard" : "My Shop"}
            </h1>
            {shop && (
              <Link
                href="/dashboard/settings"
                className="chip shrink-0 rounded-full border border-zinc-200 px-2.5 text-[0.65rem] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
              >
                ⚙️ Settings
              </Link>
            )}
            {shop && (
              <Link
                href="/dashboard/analytics"
                className="chip shrink-0 rounded-full border border-zinc-200 px-2.5 text-[0.65rem] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
              >
                📊 Analytics
              </Link>
            )}
            {/* Multi-shop switcher */}
            {allShops.length > 1 && (
              <div className="relative shrink-0">
                <select
                  value={activeShopId ?? ""}
                  onChange={(e) => handleSwitchShop(e.target.value)}
                  className="btn-compact appearance-none rounded-full border border-zinc-200 bg-zinc-50 px-3 pr-7 text-xs font-medium text-zinc-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
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

      <main className="page-stack mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-5">
        {/* No shops message */}
        {allShops.length === 0 && (
          <section className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 px-3 py-5 text-center dark:border-emerald-800 dark:bg-emerald-950/20">
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
              Create your first shop below to get started.
            </p>
            <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-400/80">
              Store register hote hi marketplace pe live ho jayega (email verified hona zaroori hai).
            </p>
          </section>
        )}

        {/* Active shop summary — so merchants always see THEIR store after refresh */}
        {shop && (
          <section className="w-full rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)] sm:p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-400 dark:text-emerald-700">Your store</p>
                <h2 className="truncate text-sm font-bold text-zinc-900 dark:text-emerald-200 sm:text-base">{shop.name}</h2>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {shop.category}
                  {shop.location ? ` · ${shop.location}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`chip rounded-full px-2.5 text-[0.65rem] font-semibold ${liveStatus.bg} ${liveStatus.color}`}>
                  {liveStatus.label}
                </span>
                <Link
                  href={`/shop/${shop.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-compact inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <EyeIcon /> Visit Storefront
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Shop Details — full width, dense multi-column on laptop */}
        <section className="w-full">
          <h2 className="mb-2.5 text-sm font-bold text-zinc-900 dark:text-emerald-200 sm:text-base">{shop ? "Edit Shop Details" : "Create Your Shop"}</h2>
          <form onSubmit={handleSaveShop} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)] sm:space-y-3.5 sm:p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2 lg:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Shop Name *</label>
                <input type="text" required value={shopForm.name} onChange={(e) => setShopForm((f) => ({ ...f, name: e.target.value }))} placeholder="My Trendy Store" className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
              </div>
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
                  location: shopForm.location,
                  delivery_zones: shopForm.delivery_zones,
                }}
                onChange={(patch) => setShopForm((f) => ({ ...f, ...patch }))}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">WhatsApp Number</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={shopForm.whatsapp_number}
                  onChange={(e) =>
                    setShopForm((f) => ({
                      ...f,
                      whatsapp_number: formatPkPhoneInput(e.target.value),
                    }))
                  }
                  placeholder={PK_PHONE_PLACEHOLDER}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <ImageUpload label="Logo" currentUrl={shopForm.logo_url} onUploaded={(url) => setShopForm((f) => ({ ...f, logo_url: url }))} folder="shops" fileId={activeShopId ?? userId ?? "new-shop"} showPreview />
              <ImageUpload label="Store Banner" currentUrl={shopForm.banner_url} onUploaded={(url) => setShopForm((f) => ({ ...f, banner_url: url }))} folder="shops" fileId={(activeShopId ?? userId ?? "new-shop") + "-banner"} showPreview />
            </div>
            {/* Social Media Links */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
            {/* Coupons / deals + free delivery */}
            <div className="rounded-xl border border-dashed border-teal-200/80 bg-teal-50/40 p-3 dark:border-teal-900/50 dark:bg-teal-950/20">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-end">
                <div className="lg:col-span-8">
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Coupons &amp; scheduled deals</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    Free-text product stamps are removed. Use bottom{" "}
                    <strong className="font-semibold text-emerald-700 dark:text-emerald-400">+</strong>{" "}
                    (Quick add) or{" "}
                    <Link href="/dashboard/settings#coupons" className="font-semibold text-emerald-700 underline dark:text-emerald-400">
                      Store settings → Coupons &amp; Deals
                    </Link>
                    .
                  </p>
                </div>
                <div className="lg:col-span-4">
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    Free delivery above (PKR)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={shopForm.free_delivery_threshold}
                    onChange={(e) =>
                      setShopForm((f) => ({ ...f, free_delivery_threshold: e.target.value }))
                    }
                    placeholder="e.g. 2000"
                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
              </div>
              <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                Coupons, deals, and free delivery show on the shop banner — not on every product image.
              </p>
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
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-zinc-300 text-emerald-600 focus:ring-1 focus:ring-emerald-500 dark:border-zinc-600"
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
          <section className="w-full">
            <h2 className="mb-2.5 text-sm font-bold text-zinc-900 dark:text-emerald-200 sm:text-base">Analytics Overview</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center shadow-sm dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)]">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{analytics?.total_views ?? "—"}</p>
                <p className="mt-1 flex items-center justify-center gap-1 text-xs text-zinc-500 dark:text-zinc-400"><EyeIcon /> Total Views</p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center shadow-sm dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)]">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{analytics?.total_product_clicks ?? "—"}</p>
                <p className="mt-1 flex items-center justify-center gap-1 text-xs text-zinc-500 dark:text-zinc-400"><MousePointerIcon /> Product Clicks</p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center shadow-sm dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)]">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{analytics?.views_today ?? "—"}</p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Views Today</p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center shadow-sm dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)]">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{analytics?.clicks_today ?? "—"}</p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Clicks Today</p>
              </div>
            </div>
            {/* Suspended / rejected banner (admin abuse action) */}
            {shop && shop.verification_status === "rejected" && (
              <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                🚫 <strong>Your store has been suspended.</strong>{" "}
                Please <Link href="/support" className="underline font-medium">contact support</Link> for details.
              </div>
            )}
            {/* Quick stat cards */}
            {shop && (
              <>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center shadow-sm dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)]"><p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{products.length}</p><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Active Products</p></div>
                  <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center shadow-sm dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)]"><p className={`text-2xl font-bold ${liveStatus.color}`}>{liveStatus.label}</p><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Publishing Status</p></div>
                  <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center shadow-sm dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)]"><p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{orders.length}</p><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Orders</p></div>
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

          </section>
        )}

        {/* Story Creator */}
        {activeShopId && (
          <section>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Promotional Story</h2><button type="button" onClick={() => setShowStoryForm(!showStoryForm)} className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400">{showStoryForm ? "Cancel" : "+ Add Story"}</button></div>
            {showStoryForm && (
              <form onSubmit={handleCreateStory} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">One active story per store. New posts replace the current story. Visible on the homepage for 24 hours.</p>
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
            <h2 className="mb-2.5 text-sm font-bold text-zinc-900 dark:text-emerald-200 sm:text-base">Order Inquiries ({orders.length})</h2>
            <div className="mb-3">
              <a href="/dashboard/orders" className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
                Open full Order Desk →
              </a>
            </div>
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

        {/* Product Management — full width; dense fields on laptop */}
        {activeShopId && shop && (
          <section id="product-form" className="space-y-4">
            <div className="w-full">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  {editingProductId ? "Edit Product" : "Add Product"}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Store type locked as{" "}
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{shop.category}</span>
                  {" — "}pick a sub-category for each item.
                </p>
              </div>
              {!editingProductId && (
                <a
                  href="#bulk-products"
                  className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  Batch add many ↓
                </a>
              )}
            </div>

            <form onSubmit={handleSaveProduct} className="mt-3 space-y-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)] sm:p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2 lg:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Product Name *</label>
                  <input type="text" required value={productForm.name} onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Zinger Burger" className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Sub-Category *</label>
                  <select
                    required
                    value={productForm.sub_category_id ?? ""}
                    onChange={(e) => setProductForm((f) => ({ ...f, sub_category_id: e.target.value, category_id: shop.category }))}
                    disabled={productSubsLoading || productSubCategories.length === 0}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  >
                    <option value="" disabled>
                      {productSubsLoading ? "Loading sub-categories…" : "Select sub-category…"}
                    </option>
                    {productSubCategories.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.icon ? `${sub.icon} ` : ""}
                        {sub.name}
                      </option>
                    ))}
                  </select>
                  {productSubCategories.length === 0 && !productSubsLoading && (
                    <p className="mt-1 text-[0.65rem] text-amber-600 dark:text-amber-400">
                      No sub-categories in DB yet — run the Fast Food / retail SQL migration in Supabase.
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Price (PKR) *</label>
                  <input type="number" required min={0} step={1} value={productForm.price || ""} onChange={(e) => setProductForm((f) => ({ ...f, price: Number(e.target.value) }))} placeholder="450" className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100" />
                </div>
              </div>
              <MultiImageUpload
                label="Product photos"
                urls={
                  Array.isArray(productForm.images) && productForm.images.length > 0
                    ? productForm.images
                    : productForm.image_url
                      ? [productForm.image_url]
                      : []
                }
                onChange={(urls) => {
                  const g = normalizeProductGallery(urls);
                  setProductForm((f) => ({
                    ...f,
                    image_url: g.image_url,
                    images: g.images,
                  }));
                }}
                folder="products"
                fileIdPrefix={editingProductId ?? activeShopId ?? "new-product"}
              />

              <button
                type="button"
                onClick={() => setShowMoreProductOptions((v) => !v)}
                className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
              >
                {showMoreProductOptions ? "− Hide optional details" : "+ Description, discount price & availability (optional)"}
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
                      placeholder="e.g. 599 (before discount)"
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                    {!!productForm.original_price && productForm.original_price > productForm.price && (
                      <p className="mt-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        {Math.round(((productForm.original_price - productForm.price) / productForm.original_price) * 100)}% OFF badge will show on this product.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                      Deal ends (optional)
                    </label>
                    <input
                      type="datetime-local"
                      value={
                        productForm.deal_expires_at
                          ? toDatetimeLocalValue(productForm.deal_expires_at)
                          : ""
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        setProductForm((f) => ({
                          ...f,
                          deal_expires_at: v ? new Date(v).toISOString() : null,
                        }));
                      }}
                      disabled={!productForm.original_price || productForm.original_price <= productForm.price}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                    <p className="mt-1 text-[11px] text-zinc-400">
                      Is waqt ke baad % OFF badge hide ho jayega. Pehle original price set karein.
                    </p>
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
                <button type="submit" disabled={productSaving} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 dark:focus:ring-offset-zinc-900">
                  <PlusIcon />
                  {productSaving ? "Saving…" : editingProductId ? "Update Product" : "Done"}
                </button>
                {editingProductId && (
                  <button type="button" onClick={handleCancelEdit} className="rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
                    Cancel
                  </button>
                )}
              </div>
            </form>
            </div>

            {!editingProductId && (
              <details id="bulk-products" className="rounded-2xl border border-zinc-200 open:shadow-sm dark:border-[color:var(--tm-border)]">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  Add multiple products at once (batch table)
                </summary>
                <div className="overflow-x-auto border-t border-zinc-100 p-2 dark:border-[color:var(--tm-border)] sm:p-3">
                  <BulkProductCreator
                    shopId={activeShopId}
                    shopCategory={shop.category}
                    onCreated={refreshProducts}
                    onToast={addToast}
                  />
                </div>
              </details>
            )}
          </section>
        )}

        {/* Product List — search + pagination (no endless scroll) */}
        {activeShopId && (
          <section>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Your Products ({products.length})
                </h2>
                {productSearch.trim() && !productsLoading && (
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {filteredProducts.length} match{filteredProducts.length === 1 ? "" : "es"}
                  </p>
                )}
              </div>
              {!productsLoading && filteredProducts.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  {filteredProducts.length > 0 &&
                  filteredProducts.every((p) => selectedProductIds.has(p.id))
                    ? "Deselect All"
                    : "Select All"}
                </button>
              )}
            </div>

            {!productsLoading && products.length > 0 && (
              <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </span>
                  <input
                    type="search"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Search products by name or price…"
                    className="w-full rounded-xl border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <p className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                  Page {safeProductPage}/{productTotalPages} · {PRODUCTS_PAGE_SIZE} per page · next/prev se aage
                </p>
              </div>
            )}

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
            {productsLoading && (
              <div className="space-y-1.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="h-8 rounded bg-zinc-200 dark:bg-zinc-800" />
                  </div>
                ))}
              </div>
            )}
            {!productsLoading && products.length === 0 && (
              <div className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/40 py-10 text-center dark:border-emerald-800 dark:bg-emerald-950/20">
                <div className="mb-2 flex justify-center"><ShoppingBagIcon /></div>
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">No products yet</p>
                <p className="mx-auto mt-1 max-w-sm text-xs text-zinc-500 dark:text-zinc-400">
                  Add items so they appear on the public Products feed for customers.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <a
                    href="#product-form"
                    className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    Add first product
                  </a>
                  <a
                    href="#bulk-products"
                    className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                  >
                    Batch upload
                  </a>
                </div>
              </div>
            )}
            {!productsLoading && products.length > 0 && filteredProducts.length === 0 && (
              <div className="rounded-xl border border-dashed border-zinc-300 bg-white py-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No products match &quot;{productSearch.trim()}&quot;
                </p>
                <button
                  type="button"
                  onClick={() => setProductSearch("")}
                  className="mt-2 text-xs font-semibold text-emerald-600 hover:underline"
                >
                  Clear search
                </button>
              </div>
            )}
            {!productsLoading && pagedProducts.length > 0 && (
              <div className="grid grid-cols-1 gap-1.5 xl:grid-cols-2">
                {pagedProducts.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    onEdit={handleEditProduct}
                    onDelete={handleDeleteProduct}
                    onToggleAvailability={handleToggleAvailability}
                    deleting={deletingProductId === product.id}
                    selected={selectedProductIds.has(product.id)}
                    onToggleSelect={handleToggleSelect}
                  />
                ))}
              </div>
            )}
            {!productsLoading && filteredProducts.length > PRODUCTS_PAGE_SIZE && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={safeProductPage <= 1}
                  onClick={() => setProductPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                >
                  ← Prev
                </button>
                <div className="flex flex-wrap items-center gap-1">
                  {Array.from({ length: productTotalPages }, (_, i) => i + 1)
                    .filter((n) => {
                      if (productTotalPages <= 7) return true;
                      if (n === 1 || n === productTotalPages) return true;
                      return Math.abs(n - safeProductPage) <= 1;
                    })
                    .map((n, idx, arr) => {
                      const prev = arr[idx - 1];
                      const showEllipsis = prev != null && n - prev > 1;
                      return (
                        <span key={n} className="inline-flex items-center gap-1">
                          {showEllipsis ? (
                            <span className="px-1 text-xs text-zinc-400">…</span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setProductPage(n)}
                            className={`min-w-[1.75rem] rounded-md px-2 py-1 text-xs font-semibold ${
                              n === safeProductPage
                                ? "bg-emerald-600 text-white"
                                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                            }`}
                          >
                            {n}
                          </button>
                        </span>
                      );
                    })}
                </div>
                <button
                  type="button"
                  disabled={safeProductPage >= productTotalPages}
                  onClick={() =>
                    setProductPage((p) => Math.min(productTotalPages, p + 1))
                  }
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                >
                  Next →
                </button>
              </div>
            )}
          </section>
        )}

        {/* Coupon / Deal managed in Store settings + bottom (+) Quick add — avoid doubling */}

        {/* CSV Data Export */}
        {activeShopId && shop && (
          <section>
            <h2 className="mb-2.5 text-sm font-bold text-zinc-900 dark:text-emerald-200 sm:text-base">Export Data</h2>
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
