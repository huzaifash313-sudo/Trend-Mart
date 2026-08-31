"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Super Admin Centralized Dashboard (Prompt 1)                    */
/*                                                                             */
/*  Features:                                                                  */
/*   - Monitor all registered merchants with verification status                */
/*   - Verify or suspend store accounts                                        */
/*   - Audit live transaction volumes via Supabase Realtime subscriptions      */
/*   - Manage platform-wide category taxonomies                                */
/*   - View aggregate marketplace analytics across all active vendors          */
/*   - Real-time order activity feed                                           */
/* -------------------------------------------------------------------------- */

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  Fragment,
  type ChangeEvent,
  type KeyboardEvent,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import { logAuditEventWithContext } from "@/services/auditService";
import { subscribeToPlatformTransactions } from "@/services/notificationService";
import type {
  PlatformMetrics,
  AdminMerchantRecord,
  OrderStatusNotification,
  OrderStatus,
  ShopVerificationStatus,
  Order,
} from "@/types";
import { SHOP_CATEGORIES } from "@/types";
import { deleteShop } from "@/services/shopService";
import ImageUpload from "@/components/ImageUpload";
import AdCreativePreview from "@/components/AdCreativePreview";
import type { SubCategoryWithMeta } from "@/services/subCategoryService";
import {
  fetchAllSubCategoriesGrouped,
  createSubCategory,
  setSubCategoryActive,
} from "@/services/subCategoryService";
import type { PromotionalAd, PromotionalAdFormData, PromoAdPlacement } from "@/types";
import { AD_PLACEMENT_LABELS, AD_PLACEMENT_OPTIONS } from "@/types";
import {
  fetchAllAdsForAdmin,
  reviewAd,
  setAdActive as setAdActiveService,
  deleteAd as deleteAdService,
  createPlatformAd,
} from "@/services/adsService";
import { useConfirm } from "@/components/ConfirmProvider";
import CustomSelect from "@/components/CustomSelect";
import RevenueTrendChart, {
  type RevenueTrendPoint,
} from "@/app/admin/components/RevenueTrendChart";
import ShopDrillDownModal from "@/app/admin/components/ShopDrillDownModal";
import AdPlansManager from "@/app/admin/components/AdPlansManager";
import {
  fetchAdminUsers,
  setAdminUserBan,
} from "@/services/adminService";
import type { AdminUserRecord } from "@/types";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AdminDashboardState {
  metrics: PlatformMetrics | null;
  merchants: AdminMerchantRecord[];
  orders: Order[];
  loading: boolean;
  error: string | null;
  realtimeFeed: FeedEntry[];
  revenueTrend: RevenueTrendPoint[];
  activeTab: "overview" | "approvals" | "merchants" | "orders" | "transactions" | "categories" | "ads" | "users";
}

/** A realtime transaction event; `isHistory` marks rows backfilled from the
 *  existing order history so the feed isn't empty on first load. */
type FeedEntry = OrderStatusNotification & { isHistory?: boolean };

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString("en-PK")}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const TAB_OPTIONS = [
  { key: "overview", label: "Overview", icon: "📊" },
  { key: "approvals", label: "Approval Queue", icon: "⏳" },
  { key: "merchants", label: "Merchants", icon: "🏪" },
  { key: "users", label: "Users", icon: "👥" },
  { key: "orders", label: "Orders", icon: "📦" },
  { key: "transactions", label: "Live Transactions", icon: "💳" },
  { key: "categories", label: "Categories", icon: "📂" },
  { key: "ads", label: "Ads", icon: "📢" },
] as const;

const EMPTY_AD_FORM: PromotionalAdFormData = {
  title: "",
  subtitle: "",
  image_url: "",
  link_url: "",
  badge_label: "",
  placement: "homepage_top",
  starts_at: "",
  ends_at: "",
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { confirm, prompt } = useConfirm();

  // ── Defense-in-depth client-side admin gate (middleware + RLS already
  //    protect /admin/*; this mirrors the support & audit-logs pages so a
  //    misconfigured matcher can never expose admin data/mutations).
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function checkAccess() {
      const { data: userData } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!userData.user) {
        router.replace("/auth");
        return;
      }
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .single();
      if (cancelled) return;
      if (roleData?.role !== "admin") {
        router.replace("/dashboard");
        return;
      }
      setIsAdmin(true);
      setAuthLoading(false);
    }
    checkAccess();
    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  const [state, setState] = useState<AdminDashboardState>({
    metrics: null,
    merchants: [],
    orders: [],
    loading: true,
    error: null,
    realtimeFeed: [],
    revenueTrend: [],
    activeTab: "overview",
  });

  const [searchMerchant, setSearchMerchant] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("All");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // ─── Category Taxonomy Management ──────────────────────────────────────
  const [subCategories, setSubCategories] = useState<Record<string, SubCategoryWithMeta[]>>({});
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [newSubCatName, setNewSubCatName] = useState("");
  const [subCatSaving, setSubCatSaving] = useState(false);
  const [subCatError, setSubCatError] = useState<string | null>(null);

  // ─── Promotional Ads Management ────────────────────────────────────────
  const [ads, setAds] = useState<PromotionalAd[]>([]);
  const [adsLoading, setAdsLoading] = useState(false);
  const [adProcessingId, setAdProcessingId] = useState<string | null>(null);
  const [showPlatformAdForm, setShowPlatformAdForm] = useState(false);
  const [platformAdForm, setPlatformAdForm] = useState<PromotionalAdFormData>(EMPTY_AD_FORM);
  const [platformAdSaving, setPlatformAdSaving] = useState(false);
  const [platformAdError, setPlatformAdError] = useState<string | null>(null);

  // ─── Global Orders Browser ─────────────────────────────────────────
  const [ordersSearch, setOrdersSearch] = useState("");
  const [ordersStatusFilter, setOrdersStatusFilter] = useState<string>("all");
  const [ordersPage, setOrdersPage] = useState(1);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const ORDERS_PAGE_SIZE = 20;

  // ─── Merchant table pagination ─────────────────────────────────────
  const [merchantPage, setMerchantPage] = useState(1);
  const MERCHANT_PAGE_SIZE = 25;

  // ─── Per-shop drill-down ───────────────────────────────────────────
  const [drillDownShop, setDrillDownShop] = useState<AdminMerchantRecord | null>(null);

  // ─── User moderation ───────────────────────────────────────────────
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersSearch, setUsersSearch] = useState("");
  const [usersRoleFilter, setUsersRoleFilter] = useState<string>("all");
  const [bannedOnly, setBannedOnly] = useState(false);
  const [banProcessingId, setBanProcessingId] = useState<string | null>(null);

  // ─── Fetch All Data ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    async function fetchAllData() {
      setState((s) => ({ ...s, loading: true, error: null }));

      try {
        // Fetch all shops with aggregated data
        const { data: shops, error: shopsErr } = await supabase
          .from("shops")
          .select("*")
          .order("created_at", { ascending: false });

        if (shopsErr) throw shopsErr;

        // Full order dataset (unlimited) — powers per-shop stats and the
        // platform totals so metrics never silently undercount as the
        // platform grows past 500 orders.
        const { data: orderCountsRaw, error: countsErr } = await supabase
          .from("orders")
          .select("shop_id, total_amount, status, created_at");

        if (countsErr) throw countsErr;

        // Recent-order snapshot — powers the Orders tab and backfills the
        // realtime feed so it isn't empty on first load.
        let recentOrdersData: Record<string, unknown>[] | null = null;
        let recentOrdersErr: { message?: string } | null = null;

        const recentQuery = await supabase
          .from("orders")
          .select(
            "id, shop_id, customer_name, customer_phone, items_json, total_amount, status, created_at, tracking_number, customer_user_id",
          )
          .order("created_at", { ascending: false })
          .limit(500);
        recentOrdersData = recentQuery.data as Record<string, unknown>[] | null;
        recentOrdersErr = recentQuery.error;

        if (recentOrdersErr && /customer_user_id|tracking_number/i.test(recentOrdersErr.message || "")) {
          // Legacy schemas may lack the newer columns — retry with core fields.
          const fallback = await supabase
            .from("orders")
            .select(
              "id, shop_id, customer_name, customer_phone, items_json, total_amount, status, created_at",
            )
            .order("created_at", { ascending: false })
            .limit(500);
          recentOrdersData = fallback.data as Record<string, unknown>[] | null;
          recentOrdersErr = fallback.error;
        }

        if (recentOrdersErr) throw recentOrdersErr;
        const recentOrders = recentOrdersData ?? [];

        // Product counts per shop — populates the merchant table column that
        // was previously hardcoded to 0.
        const { data: productRows, error: productsErr } = await supabase
          .from("products")
          .select("shop_id");
        if (productsErr) throw productsErr;
        const productCountByShop = new Map<string, number>();
        for (const p of (productRows as Record<string, unknown>[]) ?? []) {
          const sid = p.shop_id as string;
          if (sid) {
            productCountByShop.set(sid, (productCountByShop.get(sid) ?? 0) + 1);
          }
        }

        // Aggregate
        const allShopsArr = (shops as Record<string, unknown>[]) ?? [];
        const allCountsArr = (orderCountsRaw as Record<string, unknown>[]) ?? [];

        // Build order stats by shop
        const shopOrderMap = new Map<
          string,
          { count: number; revenue: number }
        >();
        for (const o of allCountsArr) {
          const sid = o.shop_id as string;
          const amount = Number(o.total_amount) || 0;
          const entry = shopOrderMap.get(sid) ?? { count: 0, revenue: 0 };
          entry.count++;
          if ((o.status as string) !== "Cancelled") entry.revenue += amount;
          shopOrderMap.set(sid, entry);
        }

        // Build merchant records
        const shopNameMap = new Map<string, string>();
        const merchants: AdminMerchantRecord[] = allShopsArr.map((shop) => {
          const shopId = shop.id as string;
          shopNameMap.set(shopId, (shop.name as string) ?? "Unknown");
          const stats = shopOrderMap.get(shopId);
          const verificationStatus =
            (shop.verification_status as ShopVerificationStatus) ?? "approved";
          return {
            shop_id: shopId,
            owner_id: (shop.owner_id as string) ?? null,
            shop_name: (shop.name as string) ?? "Unknown",
            category: (shop.category as string) ?? "Boutique",
            location: (shop.location as string) ?? "",
            is_live: (shop.is_live as boolean) ?? false,
            verified: verificationStatus === "approved",
            suspended: !(shop.is_live as boolean),
            verification_status: verificationStatus,
            order_count: stats?.count ?? 0,
            total_revenue: stats?.revenue ?? 0,
            product_count: productCountByShop.get(shopId) ?? 0,
            created_at: (shop.created_at as string) ?? "",
            whatsapp_number: (shop.whatsapp_number as string) ?? "",
          };
        });

        // Calculate platform metrics from the FULL dataset (no row cap).
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();

        const todayOrders = allCountsArr.filter(
          (o) => (o.created_at as string) >= todayISO,
        );
        const todayRevenue = todayOrders
          .filter((o) => (o.status as string) !== "Cancelled")
          .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

        const totalRevenue = allCountsArr
          .filter((o) => (o.status as string) !== "Cancelled")
          .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

        const metrics: PlatformMetrics = {
          total_merchants: allShopsArr.length,
          active_merchants: allShopsArr.filter((s) => s.is_live as boolean).length,
          suspended_merchants: allShopsArr.filter(
            (s) => !(s.is_live as boolean),
          ).length,
          total_orders: allCountsArr.length,
          total_revenue: totalRevenue,
          orders_today: todayOrders.length,
          revenue_today: todayRevenue,
          pending_verifications: allShopsArr.filter(
            (s) => ((s.verification_status as ShopVerificationStatus) ?? "approved") === "pending",
          ).length,
        };

        // 14-day revenue/order trend (from the FULL dataset).
        const TREND_DAYS = 14;
        const revenueTrend: RevenueTrendPoint[] = [];
        for (let i = TREND_DAYS - 1; i >= 0; i--) {
          const dayStart = new Date();
          dayStart.setHours(0, 0, 0, 0);
          dayStart.setDate(dayStart.getDate() - i);
          const dayEnd = new Date(dayStart);
          dayEnd.setDate(dayStart.getDate() + 1);
          const dayStartMs = dayStart.getTime();
          const dayEndMs = dayEnd.getTime();
          const dayOrders = allCountsArr.filter((o) => {
            const t = new Date(o.created_at as string).getTime();
            return t >= dayStartMs && t < dayEndMs;
          });
          revenueTrend.push({
            label: dayStart.toLocaleDateString("en-PK", { month: "short", day: "numeric" }),
            revenue: dayOrders
              .filter((o) => (o.status as string) !== "Cancelled")
              .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0),
            orders: dayOrders.length,
          });
        }

        // Backfill the live feed with recent history so it isn't empty on load.
        const feedSeed: FeedEntry[] = recentOrders.slice(0, 20).map((o) => ({
          orderId: (o.id as string) ?? "",
          shopId: (o.shop_id as string) ?? "",
          shopName: shopNameMap.get(o.shop_id as string) ?? "",
          previousStatus: (o.status as OrderStatus) ?? "Pending",
          newStatus: (o.status as OrderStatus) ?? "Pending",
          customerName: (o.customer_name as string) ?? "",
          customerPhone: (o.customer_phone as string) ?? "",
          totalAmount: Number(o.total_amount) || 0,
          timestamp: (o.created_at as string) ?? new Date().toISOString(),
          isHistory: true,
        }));

        const mappedOrders: Order[] = recentOrders.map((o) => ({
          id: (o.id as string) ?? "",
          shop_id: (o.shop_id as string) ?? "",
          customer_name: (o.customer_name as string) ?? "",
          customer_phone: (o.customer_phone as string) ?? "",
          items_json: (o.items_json as Order["items_json"]) ?? [],
          total_amount: Number(o.total_amount) || 0,
          status: (o.status as OrderStatus) ?? "Pending",
          created_at: (o.created_at as string) ?? "",
          tracking_number: (o.tracking_number as string) ?? null,
          customer_user_id: (o.customer_user_id as string) ?? null,
        }));

        setState((s) => ({
          ...s,
          metrics,
          merchants,
          orders: mappedOrders,
          realtimeFeed: feedSeed,
          revenueTrend,
          loading: false,
        }));
      } catch (err) {
        logError(err, { module: "AdminDashboard.fetchAll" });
        setState((s) => ({
          ...s,
          loading: false,
          error: "Failed to load dashboard data. Please try again.",
        }));
      }
    }

    fetchAllData();
  }, [supabase, isAdmin]);

  // ─── Realtime Transaction Feed ─────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = subscribeToPlatformTransactions(
      (notification: OrderStatusNotification) => {
        setState((s) => ({
          ...s,
          realtimeFeed: [notification, ...s.realtimeFeed].slice(0, 50),
        }));
      },
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // ─── Category Taxonomy: Load & Mutate ──────────────────────────────────
  const loadSubCategories = useCallback(async () => {
    const result = await fetchAllSubCategoriesGrouped();
    if (result.success) setSubCategories(result.data);
  }, []);

  useEffect(() => {
    if (state.activeTab === "categories") {
      loadSubCategories();
    }
  }, [state.activeTab, loadSubCategories]);

  // ─── Ads: Load & Mutate ─────────────────────────────────────────────────
  const loadAds = useCallback(async () => {
    setAdsLoading(true);
    const result = await fetchAllAdsForAdmin();
    if (result.success) setAds(result.data);
    setAdsLoading(false);
  }, []);

  useEffect(() => {
    if (state.activeTab === "ads") {
      loadAds();
    }
  }, [state.activeTab, loadAds]);

  async function handleReviewAd(adId: string, decision: "approved" | "rejected") {
    setAdProcessingId(adId);
    const reason =
      decision === "rejected"
        ? ((await prompt({
            title: "Reject ad",
            message: "Optional: reason for rejection",
            placeholder: "Reason for rejection (optional)",
            confirmLabel: "Reject ad",
          })) ?? undefined)
        : undefined;
    const result = await reviewAd(adId, decision, reason);
    if (result.success) {
      await loadAds();
      setActionMessage(decision === "approved" ? "Ad approved — now live on the homepage." : "Ad rejected.");
    } else {
      setActionMessage(result.error);
    }
    setTimeout(() => setActionMessage(null), 3000);
    setAdProcessingId(null);
  }

  async function handleToggleAdActive(ad: PromotionalAd) {
    setAdProcessingId(ad.id);
    const result = await setAdActiveService(ad.id, !ad.is_active);
    if (result.success) {
      setAds((prev) => prev.map((a) => (a.id === ad.id ? { ...a, is_active: !ad.is_active } : a)));
    }
    setAdProcessingId(null);
  }

  async function handleDeleteAd(adId: string) {
    if (!(await confirm("Delete this ad permanently?"))) return;
    setAdProcessingId(adId);
    const result = await deleteAdService(adId);
    if (result.success) {
      setAds((prev) => prev.filter((a) => a.id !== adId));
    }
    setAdProcessingId(null);
  }

  async function handleCreatePlatformAd(e: FormEvent) {
    e.preventDefault();
    if (!platformAdForm.title.trim() || !platformAdForm.image_url.trim() || !platformAdForm.link_url.trim()) {
      setPlatformAdError("Title, image, and link are required.");
      return;
    }
    setPlatformAdSaving(true);
    setPlatformAdError(null);
    const result = await createPlatformAd(platformAdForm, ads.length);
    if (result.success) {
      setPlatformAdForm(EMPTY_AD_FORM);
      setShowPlatformAdForm(false);
      await loadAds();
      setActionMessage("Platform ad created and published.");
      setTimeout(() => setActionMessage(null), 3000);
    } else {
      setPlatformAdError(result.error);
    }
    setPlatformAdSaving(false);
  }

  const pendingAds = useMemo(() => ads.filter((a) => a.status === "pending"), [ads]);

  async function handleAddSubCategory(category: string) {
    const name = newSubCatName.trim();
    if (!name) return;
    setSubCatSaving(true);
    setSubCatError(null);
    const result = await createSubCategory({ category, name });
    if (result.success) {
      setNewSubCatName("");
      await loadSubCategories();
    } else {
      setSubCatError(result.error);
    }
    setSubCatSaving(false);
  }

  async function handleToggleSubCategory(sub: SubCategoryWithMeta) {
    setSubCatSaving(true);
    const result = await setSubCategoryActive(sub.id, !sub.is_active);
    if (result.success) {
      await loadSubCategories();
    } else {
      setSubCatError(result.error);
    }
    setSubCatSaving(false);
  }

  // ─── Actions ────────────────────────────────────────────────────────────

  async function toggleMerchantStatus(shopId: string, currentLive: boolean) {
    setProcessingId(shopId);
    setActionMessage(null);
    try {
      const { error } = await supabase
        .from("shops")
        .update({ is_live: !currentLive })
        .eq("id", shopId);

      if (error) throw error;

      // Fire-and-forget branded email notification to the merchant.
      const merchant = state.merchants.find((m) => m.shop_id === shopId);
      if (merchant?.owner_id) {
        fetch("/api/notifications/merchant-approval", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ownerId: merchant.owner_id,
            shopName: merchant.shop_name,
            verified: !currentLive,
          }),
        }).catch(() => { /* best-effort only */ });
      }

      // Update local state
      setState((s) => ({
        ...s,
        merchants: s.merchants.map((m) =>
          m.shop_id === shopId
            ? {
                ...m,
                is_live: !currentLive,
                verified: !currentLive,
                suspended: currentLive,
              }
            : m,
        ),
        metrics: s.metrics
          ? {
              ...s.metrics,
              active_merchants: currentLive
                ? s.metrics.active_merchants - 1
                : s.metrics.active_merchants + 1,
              suspended_merchants: currentLive
                ? s.metrics.suspended_merchants + 1
                : s.metrics.suspended_merchants - 1,
            }
          : null,
      }));

      setActionMessage(
        currentLive
          ? "Merchant suspended successfully."
          : "Merchant verified & activated.",
      );
      setTimeout(() => setActionMessage(null), 3000);

      // Security trail: record the suspend/activate action.
      void logAuditEventWithContext({
        eventType: currentLive ? "merchant.suspended" : "merchant.activated",
        targetType: "shop",
        targetId: shopId,
        description: currentLive
          ? `Merchant suspended (shop ${shopId}).`
          : `Merchant activated (shop ${shopId}).`,
        oldValue: { is_live: currentLive },
        newValue: { is_live: !currentLive },
        severity: currentLive ? "warning" : "info",
      });
    } catch (err) {
      logError(err, { module: "AdminDashboard.toggleStatus" });
      setActionMessage("Action failed. Please try again.");
      setTimeout(() => setActionMessage(null), 4000);
    } finally {
      setProcessingId(null);
    }
  }

  async function reviewShop(shopId: string, decision: "approved" | "rejected") {
    setProcessingId(shopId);
    setActionMessage(null);
    try {
      const { error } = await supabase
        .from("shops")
        .update({
          verification_status: decision,
          // Approving a brand-new store also flips it live so it appears
          // immediately; rejecting hides it from the storefront regardless
          // of the merchant's is_live flag (visibility = is_live AND approved).
          is_live: decision === "approved",
        })
        .eq("id", shopId);

      if (error) throw error;

      const merchant = state.merchants.find((m) => m.shop_id === shopId);
      if (merchant?.owner_id) {
        fetch("/api/notifications/merchant-approval", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ownerId: merchant.owner_id,
            shopName: merchant.shop_name,
            verified: decision === "approved",
          }),
        }).catch(() => { /* best-effort only */ });
      }

      setState((s) => ({
        ...s,
        merchants: s.merchants.map((m) =>
          m.shop_id === shopId
            ? {
                ...m,
                verification_status: decision,
                verified: decision === "approved",
                is_live: decision === "approved",
                suspended: decision !== "approved",
              }
            : m,
        ),
        metrics: s.metrics
          ? {
              ...s.metrics,
              pending_verifications: Math.max(0, s.metrics.pending_verifications - 1),
              active_merchants:
                decision === "approved"
                  ? s.metrics.active_merchants + 1
                  : Math.max(0, s.metrics.active_merchants - 1),
              suspended_merchants:
                decision === "approved"
                  ? Math.max(0, s.metrics.suspended_merchants - 1)
                  : s.metrics.suspended_merchants + 1,
            }
          : null,
      }));

      setActionMessage(
        decision === "approved"
          ? "Store approved — now live on the marketplace."
          : "Store rejected. It will remain hidden from customers.",
      );
      setTimeout(() => setActionMessage(null), 3000);

      // Security trail: record the approval/rejection decision.
      void logAuditEventWithContext({
        eventType:
          decision === "approved" ? "merchant.approved" : "merchant.rejected",
        targetType: "shop",
        targetId: shopId,
        description:
          decision === "approved"
            ? `Store ${shopId} approved by admin.`
            : `Store ${shopId} rejected by admin.`,
        oldValue: { verification_status: "pending" },
        newValue: { verification_status: decision },
        severity: decision === "approved" ? "info" : "warning",
      });
    } catch (err) {
      logError(err, { module: "AdminDashboard.reviewShop" });
      setActionMessage("Action failed. Please try again.");
      setTimeout(() => setActionMessage(null), 4000);
    } finally {
      setProcessingId(null);
    }
  }

  /**
   * Permanently remove a merchant that violates platform guidelines.
   * Cascades to that shop's products/orders/reviews/etc via FK ON DELETE
   * CASCADE. Requires the `shops_admin_all` RLS policy (admin override).
   */
  async function deleteMerchant(shopId: string, shopName: string) {
    if (
      !(await confirm({
        title: "Delete merchant",
        message: `Permanently delete "${shopName}"? This removes the store, its products, and its order history. This cannot be undone.`,
        confirmLabel: "Delete",
      }))
    ) {
      return;
    }

    setProcessingId(shopId);
    setActionMessage(null);
    try {
      const result = await deleteShop(shopId);
      if (!result.success) throw new Error(result.error);

      const deleted = state.merchants.find((m) => m.shop_id === shopId);
      setState((s) => ({
        ...s,
        merchants: s.merchants.filter((m) => m.shop_id !== shopId),
        metrics: s.metrics
          ? {
              ...s.metrics,
              total_merchants: Math.max(0, s.metrics.total_merchants - 1),
              active_merchants: deleted?.is_live
                ? Math.max(0, s.metrics.active_merchants - 1)
                : s.metrics.active_merchants,
              suspended_merchants: deleted && !deleted.is_live
                ? Math.max(0, s.metrics.suspended_merchants - 1)
                : s.metrics.suspended_merchants,
              pending_verifications:
                deleted?.verification_status === "pending"
                  ? Math.max(0, s.metrics.pending_verifications - 1)
                  : s.metrics.pending_verifications,
              total_orders: Math.max(
                0,
                s.metrics.total_orders - (deleted?.order_count ?? 0),
              ),
              total_revenue: Math.max(
                0,
                s.metrics.total_revenue - (deleted?.total_revenue ?? 0),
              ),
            }
          : null,
      }));

      setActionMessage("Merchant deleted permanently.");
      setTimeout(() => setActionMessage(null), 3000);

      // Security trail: merchant deletion is the most destructive admin action.
      void logAuditEventWithContext({
        eventType: "merchant.deleted",
        targetType: "shop",
        targetId: shopId,
        description: `Merchant store "${shopName}" (${shopId}) permanently deleted by admin.`,
        oldValue: { name: shopName },
        newValue: null,
        severity: "critical",
      });
    } catch (err) {
      logError(err, { module: "AdminDashboard.deleteMerchant" });
      setActionMessage("Delete failed. Please try again.");
      setTimeout(() => setActionMessage(null), 4000);
    } finally {
      setProcessingId(null);
    }
  }

  // ─── Filtered Merchants ──────────────────────────────────────────────────
  const filteredMerchants = useMemo(() => {
    let result = [...state.merchants];

    if (searchMerchant.trim()) {
      const q = searchMerchant.toLowerCase();
      result = result.filter(
        (m) =>
          m.shop_name.toLowerCase().includes(q) ||
          m.location.toLowerCase().includes(q) ||
          m.whatsapp_number.includes(q),
      );
    }

    if (filterCategory !== "All") {
      result = result.filter((m) => m.category === filterCategory);
    }

    if (filterStatus === "active") {
      result = result.filter((m) => m.is_live);
    } else if (filterStatus === "suspended") {
      result = result.filter((m) => !m.is_live);
    }

    return result;
  }, [state.merchants, searchMerchant, filterCategory, filterStatus]);

  const pendingMerchants = useMemo(
    () => state.merchants.filter((m) => m.verification_status === "pending"),
    [state.merchants],
  );

  // ─── Merchant table pagination ────────────────────────────────────────
  const merchantPageCount = Math.max(
    1,
    Math.ceil(filteredMerchants.length / MERCHANT_PAGE_SIZE),
  );
  const safeMerchantPage = Math.min(merchantPage, merchantPageCount);
  const pagedMerchants = filteredMerchants.slice(
    (safeMerchantPage - 1) * MERCHANT_PAGE_SIZE,
    safeMerchantPage * MERCHANT_PAGE_SIZE,
  );

  // ─── Orders tab filtering ─────────────────────────────────────────────
  const filteredOrders = useMemo(() => {
    let result = [...state.orders];
    if (ordersStatusFilter !== "all") {
      result = result.filter((o) => o.status === ordersStatusFilter);
    }
    if (ordersSearch.trim()) {
      const q = ordersSearch.toLowerCase();
      result = result.filter(
        (o) =>
          o.customer_name.toLowerCase().includes(q) ||
          o.customer_phone.toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q) ||
          (o.tracking_number ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [state.orders, ordersStatusFilter, ordersSearch]);

  const orderPageCount = Math.max(
    1,
    Math.ceil(filteredOrders.length / ORDERS_PAGE_SIZE),
  );
  const safeOrdersPage = Math.min(ordersPage, orderPageCount);
  const pagedOrders = filteredOrders.slice(
    (safeOrdersPage - 1) * ORDERS_PAGE_SIZE,
    safeOrdersPage * ORDERS_PAGE_SIZE,
  );

  // ─── User moderation: load & ban ─────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    const result = await fetchAdminUsers({
      search: usersSearch.trim() || undefined,
      role: usersRoleFilter !== "all" ? usersRoleFilter : undefined,
      bannedOnly: bannedOnly || undefined,
    });
    if (result.success) setUsers(result.data);
    else setActionMessage(result.error);
    setUsersLoading(false);
  }, [usersSearch, usersRoleFilter, bannedOnly]);

  useEffect(() => {
    if (state.activeTab === "users") {
      loadUsers();
    }
  }, [state.activeTab, loadUsers]);

  async function handleToggleBan(user: AdminUserRecord) {
    setBanProcessingId(user.user_id);
    const nextBanned = !user.is_banned;
    const ok = await confirm(
      nextBanned
        ? `Ban ${user.full_name || user.email || "this user"}? They won't be able to sign in or place orders.`
        : `Unban ${user.full_name || user.email || "this user"}?`,
    );
    if (!ok) {
      setBanProcessingId(null);
      return;
    }
    const result = await setAdminUserBan(user.user_id, nextBanned);
    if (result.success) {
      setUsers((prev) =>
        prev.map((u) => (u.user_id === user.user_id ? { ...u, is_banned: nextBanned } : u)),
      );
      setActionMessage(nextBanned ? "User banned." : "User unbanned.");
      setTimeout(() => setActionMessage(null), 3000);

      // Security trail: user moderation actions.
      void logAuditEventWithContext({
        eventType: nextBanned ? "user.banned" : "user.unbanned",
        targetType: "user",
        targetId: user.user_id,
        description: `${nextBanned ? "Banned" : "Unbanned"} user ${user.full_name || user.email || user.user_id}.`,
        oldValue: { is_banned: !nextBanned },
        newValue: { is_banned: nextBanned },
        severity: nextBanned ? "warning" : "info",
      });
    } else {
      setActionMessage(result.error);
      setTimeout(() => setActionMessage(null), 4000);
    }
    setBanProcessingId(null);
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-[color:var(--tm-surface)] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Checking admin access…
          </p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    // Redirect is in-flight — render nothing to avoid flashing admin UI.
    return null;
  }

  if (state.loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-[color:var(--tm-surface)] p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-32 bg-white dark:bg-zinc-900 rounded-2xl animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-[color:var(--tm-surface)] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-4xl mb-3">⚠</div>
          <p className="text-red-600 dark:text-red-400 text-lg font-medium">
            {state.error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-6 py-2 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { metrics, realtimeFeed, activeTab } = state;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                Super Admin
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Approvals · merchants · support · live orders · categories · ads
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/"
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                Storefront
              </Link>
            </div>
            {actionMessage && (
              <div
                className={`px-4 py-2 rounded-xl text-sm font-medium ${
                  actionMessage.includes("success")
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                    : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                }`}
              >
                {actionMessage}
              </div>
            )}
          </div>

          {/* ── Tab Navigation ───────────────────────────────────── */}
          <div className="mt-4 flex gap-1 overflow-x-auto bg-zinc-100 p-1 dark:bg-zinc-800 rounded-xl [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TAB_OPTIONS.map((tab) => (
              <button
                key={tab.key}
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    activeTab: tab.key as AdminDashboardState["activeTab"],
                  }))
                }
                className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {/* ── Overview Tab ──────────────────────────────────────────── */}
        {activeTab === "overview" && metrics && (
          <>
            {/* Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                icon="🏪"
                label="Total Merchants"
                value={metrics.total_merchants}
                sub={`${metrics.active_merchants} active, ${metrics.suspended_merchants} suspended`}
                color="blue"
              />
              <MetricCard
                icon="📦"
                label="Total Orders"
                value={metrics.total_orders}
                sub={`${metrics.orders_today} today`}
                color="purple"
              />
              <MetricCard
                icon="💰"
                label="Total Revenue"
                value={formatCurrency(metrics.total_revenue)}
                sub={`${formatCurrency(metrics.revenue_today)} today`}
                color="emerald"
              />
              <button
                onClick={() => setState((s) => ({ ...s, activeTab: "approvals" }))}
                className="text-left"
              >
                <MetricCard
                  icon="⏳"
                  label="Pending Verifications"
                  value={metrics.pending_verifications}
                  sub="Click to review approval queue"
                  color="amber"
                />
              </button>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Active Merchants Summary */}
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
                  Merchant Status Distribution
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      Active
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{
                            width: `${
                              metrics.total_merchants > 0
                                ? (metrics.active_merchants /
                                    metrics.total_merchants) *
                                  100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-emerald-600 w-12 text-right">
                        {metrics.active_merchants}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      Suspended
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-red-500 rounded-full"
                          style={{
                            width: `${
                              metrics.total_merchants > 0
                                ? (metrics.suspended_merchants /
                                    metrics.total_merchants) *
                                  100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-red-600 w-12 text-right">
                        {metrics.suspended_merchants}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Real-time Feed Preview */}
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
                  🔴 Live Activity Feed
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {realtimeFeed.length === 0 ? (
                    <p className="text-sm text-zinc-400">
                      Waiting for live transactions...
                    </p>
                  ) : (
                    realtimeFeed.slice(0, 10).map((event, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 text-sm border-b border-zinc-100 dark:border-zinc-800 pb-1"
                      >
                        <span
                          className={`text-xs font-mono ${
                            event.newStatus === "Cancelled"
                              ? "text-red-500"
                              : event.newStatus === "Delivered"
                                ? "text-emerald-500"
                                : "text-blue-500"
                          }`}
                        >
                          {event.isHistory
                            ? "New order"
                            : `${event.previousStatus}→${event.newStatus}`}
                        </span>
                        <span className="text-zinc-600 dark:text-zinc-400 truncate">
                          #{event.orderId.slice(0, 8)} —{" "}
                          {formatCurrency(event.totalAmount)}
                        </span>
                        <span className="text-zinc-400 text-xs ml-auto">
                          {timeAgo(event.timestamp)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Revenue & order trend */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                    📈 Revenue & Orders — last 14 days
                  </h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Daily totals across the whole marketplace (cancelled orders excluded from revenue).
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Revenue
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-0.5 w-4 rounded bg-indigo-500" /> Orders
                  </span>
                </div>
              </div>
              <RevenueTrendChart data={state.revenueTrend} />
            </div>
          </>
        )}

        {/* ── Approval Queue Tab ────────────────────────────────────── */}
        {activeTab === "approvals" && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                Store queue (legacy)
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                New stores go live automatically after email verification — no
                approval wait. This list only shows rare leftover pending rows.
                Use Merchants → Suspend for abuse.
              </p>
            </div>
            {pendingMerchants.length === 0 ? (
              <div className="px-5 py-16 text-center text-zinc-400">
                <div className="text-3xl mb-3">✅</div>
                <p>No pending stores.</p>
                <p className="text-xs mt-2">
                  New merchant stores publish immediately when created.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {pendingMerchants.map((merchant) => (
                  <div
                    key={merchant.shop_id}
                    className="px-5 py-4 flex flex-wrap items-center gap-4"
                  >
                    <div className="flex-grow min-w-[180px]">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">
                        {merchant.shop_name}
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {merchant.category} · {merchant.location || "No location set"}
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        Registered {timeAgo(merchant.created_at)} · WhatsApp:{" "}
                        {merchant.whatsapp_number || "—"}
                      </div>
                    </div>
                    <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      Pending Review
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => reviewShop(merchant.shop_id, "approved")}
                        disabled={processingId === merchant.shop_id}
                        className="px-4 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        {processingId === merchant.shop_id ? "..." : "✓ Approve"}
                      </button>
                      <button
                        onClick={() => reviewShop(merchant.shop_id, "rejected")}
                        disabled={processingId === merchant.shop_id}
                        className="px-4 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 disabled:opacity-50 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Merchants Tab ─────────────────────────────────────────── */}
        {activeTab === "merchants" && (
          <>
            {/* Filters */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 flex flex-wrap gap-3 items-center">
              <input
                type="text"
                placeholder="Search merchants..."
                value={searchMerchant}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setSearchMerchant(e.target.value);
                  setMerchantPage(1);
                }}
                className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm flex-grow max-w-xs"
              />
              <CustomSelect
                value={filterCategory}
                onChange={(val) => {
                  setFilterCategory(val);
                  setMerchantPage(1);
                }}
                options={[
                  { value: "All", label: "All Categories" },
                  ...SHOP_CATEGORIES.filter((c) => c !== "All").map((cat) => ({
                    value: cat,
                    label: cat,
                  })),
                ]}
                fullWidth={false}
              />
              <CustomSelect
                value={filterStatus}
                onChange={(val) => {
                  setFilterStatus(val);
                  setMerchantPage(1);
                }}
                options={[
                  { value: "all", label: "All Status" },
                  { value: "active", label: "Active" },
                  { value: "suspended", label: "Suspended" },
                ]}
                fullWidth={false}
              />
              <span className="text-xs text-zinc-400 ml-auto">
                {filteredMerchants.length} merchant
                {filteredMerchants.length !== 1 ? "s" : ""}
                {merchantPageCount > 1
                  ? ` · page ${safeMerchantPage}/${merchantPageCount}`
                  : ""}
              </span>
            </div>

            {/* Merchant Table (desktop) */}
            <div className="hidden overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 md:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 text-xs uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Shop</th>
                      <th className="px-4 py-3 text-left">Category</th>
                      <th className="px-4 py-3 text-center">Orders</th>
                      <th className="px-4 py-3 text-center">Products</th>
                      <th className="px-4 py-3 text-right">Revenue</th>
                      <th className="px-4 py-3 text-center">Verification</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {filteredMerchants.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-4 py-12 text-center text-zinc-400"
                        >
                          No merchants found matching your filters.
                        </td>
                      </tr>
                    ) : (
                      pagedMerchants.map((merchant) => (
                        <tr
                          key={merchant.shop_id}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-zinc-900 dark:text-zinc-100">
                              {merchant.shop_name}
                            </div>
                            <div className="text-xs text-zinc-500">
                              {merchant.location}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-block px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-400">
                              {merchant.category}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-medium">
                            {merchant.order_count}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {merchant.product_count}
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            {formatCurrency(merchant.total_revenue)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                                merchant.verification_status === "approved"
                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                  : merchant.verification_status === "rejected"
                                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                              }`}
                            >
                              {merchant.verification_status === "approved"
                                ? "Approved"
                                : merchant.verification_status === "rejected"
                                  ? "Rejected"
                                  : "Pending"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                                merchant.is_live
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                              }`}
                            >
                              {merchant.is_live ? "Active" : "Suspended"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex gap-1.5 justify-end">
                              <button
                                onClick={() => setDrillDownShop(merchant)}
                                title="Products, orders & QR code"
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 transition-colors"
                              >
                                View
                              </button>
                              {merchant.verification_status === "pending" ? (
                                <>
                                  <button
                                    onClick={() => reviewShop(merchant.shop_id, "approved")}
                                    disabled={processingId === merchant.shop_id}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => reviewShop(merchant.shop_id, "rejected")}
                                    disabled={processingId === merchant.shop_id}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 disabled:opacity-50 transition-colors"
                                  >
                                    Reject
                                  </button>
                                </>
                              ) : merchant.verification_status === "rejected" ? (
                                <button
                                  onClick={() => reviewShop(merchant.shop_id, "approved")}
                                  disabled={processingId === merchant.shop_id}
                                  title="Approve and make this store publicly visible again"
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                >
                                  {processingId === merchant.shop_id ? "..." : "Re-approve"}
                                </button>
                              ) : (
                                <button
                                  onClick={() =>
                                    toggleMerchantStatus(
                                      merchant.shop_id,
                                      merchant.is_live,
                                    )
                                  }
                                  disabled={processingId === merchant.shop_id}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                                    merchant.is_live
                                      ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400"
                                      : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400"
                                  }`}
                                >
                                  {processingId === merchant.shop_id
                                    ? "..."
                                    : merchant.is_live
                                      ? "Suspend"
                                      : "Activate"}
                                </button>
                              )}
                              <button
                                onClick={() => deleteMerchant(merchant.shop_id, merchant.shop_name)}
                                disabled={processingId === merchant.shop_id}
                                title="Permanently delete this merchant"
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 text-zinc-500 hover:bg-red-600 hover:text-white dark:bg-zinc-800 dark:text-zinc-400 disabled:opacity-50 transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Merchant Cards (mobile) */}
            <div className="space-y-3 md:hidden">
              {pagedMerchants.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-10 text-center text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
                  No merchants found matching your filters.
                </div>
              ) : (
                pagedMerchants.map((merchant) => (
                  <div
                    key={merchant.shop_id}
                    className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
                          {merchant.shop_name}
                        </p>
                        {merchant.location && (
                          <p className="mt-0.5 truncate text-xs text-zinc-500">{merchant.location}</p>
                        )}
                        <span className="mt-1 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          {merchant.category}
                        </span>
                      </div>
                      <span
                        className={`shrink-0 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
                          merchant.verification_status === "approved"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            : merchant.verification_status === "rejected"
                              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        }`}
                      >
                        {merchant.verification_status === "approved"
                          ? "Approved"
                          : merchant.verification_status === "rejected"
                            ? "Rejected"
                            : "Pending"}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-zinc-50 px-2 py-2 dark:bg-zinc-800/50">
                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{merchant.order_count}</p>
                        <p className="text-[0.65rem] text-zinc-500">Orders</p>
                      </div>
                      <div className="rounded-xl bg-zinc-50 px-2 py-2 dark:bg-zinc-800/50">
                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{merchant.product_count}</p>
                        <p className="text-[0.65rem] text-zinc-500">Products</p>
                      </div>
                      <div className="rounded-xl bg-zinc-50 px-2 py-2 dark:bg-zinc-800/50">
                        <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(merchant.total_revenue)}
                        </p>
                        <p className="text-[0.65rem] text-zinc-500">Revenue</p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          merchant.is_live
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${merchant.is_live ? "bg-emerald-500" : "bg-red-500"}`} />
                        {merchant.is_live ? "Active" : "Suspended"}
                      </span>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button
                          onClick={() => setDrillDownShop(merchant)}
                          title="Products, orders & QR code"
                          className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400"
                        >
                          View
                        </button>
                        {merchant.verification_status === "pending" ? (
                          <>
                            <button
                              onClick={() => reviewShop(merchant.shop_id, "approved")}
                              disabled={processingId === merchant.shop_id}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => reviewShop(merchant.shop_id, "rejected")}
                              disabled={processingId === merchant.shop_id}
                              className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </>
                        ) : merchant.verification_status === "rejected" ? (
                          <button
                            onClick={() => reviewShop(merchant.shop_id, "approved")}
                            disabled={processingId === merchant.shop_id}
                            title="Approve and make this store publicly visible again"
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {processingId === merchant.shop_id ? "..." : "Re-approve"}
                          </button>
                        ) : (
                          <button
                            onClick={() => toggleMerchantStatus(merchant.shop_id, merchant.is_live)}
                            disabled={processingId === merchant.shop_id}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                              merchant.is_live
                                ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400"
                                : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400"
                            }`}
                          >
                            {processingId === merchant.shop_id ? "..." : merchant.is_live ? "Suspend" : "Activate"}
                          </button>
                        )}
                        <button
                          onClick={() => deleteMerchant(merchant.shop_id, merchant.shop_name)}
                          disabled={processingId === merchant.shop_id}
                          title="Permanently delete this merchant"
                          className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-red-600 hover:text-white dark:bg-zinc-800 dark:text-zinc-400 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {merchantPageCount > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setMerchantPage((p) => Math.max(1, p - 1))}
                  disabled={safeMerchantPage <= 1}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  Previous
                </button>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  Page {safeMerchantPage} of {merchantPageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setMerchantPage((p) => Math.min(merchantPageCount, p + 1))}
                  disabled={safeMerchantPage >= merchantPageCount}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Users Tab ─────────────────────────────────────────────── */}
        {activeTab === "users" && (
          <>
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 flex flex-wrap gap-3 items-center">
              <input
                type="text"
                placeholder="Search name, phone, or user ID..."
                value={usersSearch}
                onChange={(e) => setUsersSearch(e.target.value)}
                className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm flex-grow max-w-xs"
              />
              <CustomSelect
                value={usersRoleFilter}
                onChange={(val) => setUsersRoleFilter(val)}
                options={[
                  { value: "all", label: "All Roles" },
                  { value: "customer", label: "Customers" },
                  { value: "merchant", label: "Merchants" },
                  { value: "admin", label: "Admins" },
                ]}
                fullWidth={false}
              />
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                <input
                  type="checkbox"
                  checked={bannedOnly}
                  onChange={(e) => setBannedOnly(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-zinc-300 text-red-600"
                />
                Banned only
              </label>
              <button
                type="button"
                onClick={loadUsers}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Refresh
              </button>
              <span className="text-xs text-zinc-400 ml-auto">
                {users.length} user{users.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 text-xs uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">User</th>
                      <th className="px-4 py-3 text-center">Role</th>
                      <th className="px-4 py-3 text-center">Orders</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Joined</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {usersLoading ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-zinc-400">
                          Loading users…
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-zinc-400">
                          No users found matching your filters.
                        </td>
                      </tr>
                    ) : (
                      users.map((user) => (
                        <tr key={user.user_id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium text-zinc-900 dark:text-zinc-100">
                              {user.full_name || "Unnamed user"}
                            </div>
                            <div className="text-xs text-zinc-500">
                              {user.phone || "No phone"} · <span className="font-mono">{user.user_id.slice(0, 8)}…</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                                user.role === "admin"
                                  ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                                  : user.role === "merchant"
                                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                              }`}
                            >
                              {user.role}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-medium">{user.orders_count}</td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                                user.is_banned
                                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                              }`}
                            >
                              {user.is_banned ? "Banned" : "Active"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-zinc-500">
                            {user.created_at ? timeAgo(user.created_at) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleToggleBan(user)}
                              disabled={banProcessingId === user.user_id || user.role === "admin"}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 ${
                                user.is_banned
                                  ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400"
                                  : "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400"
                              }`}
                            >
                              {banProcessingId === user.user_id
                                ? "..."
                                : user.role === "admin"
                                  ? "—"
                                  : user.is_banned
                                    ? "Unban"
                                    : "Ban"}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs text-zinc-400">
              Banned customers can&apos;t sign in or place orders. Their order history is kept for the audit trail.
            </p>
          </>
        )}

        {/* ── Orders Tab ──────────────────────────────────────────────── */}
        {activeTab === "orders" && (
          <>
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 flex flex-wrap gap-3 items-center">
              <input
                type="text"
                placeholder="Search by customer, phone, or order ID..."
                value={ordersSearch}
                onChange={(e) => {
                  setOrdersSearch(e.target.value);
                  setOrdersPage(1);
                }}
                className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm flex-grow max-w-xs"
              />
              <CustomSelect
                value={ordersStatusFilter}
                onChange={(val) => {
                  setOrdersStatusFilter(val);
                  setOrdersPage(1);
                }}
                options={[
                  { value: "all", label: "All Statuses" },
                  { value: "Pending", label: "Pending" },
                  { value: "Processing", label: "Processing" },
                  { value: "Dispatched", label: "Dispatched" },
                  { value: "Delivered", label: "Delivered" },
                  { value: "Cancelled", label: "Cancelled" },
                ]}
                fullWidth={false}
              />
              <span className="text-xs text-zinc-400 ml-auto">
                {filteredOrders.length} order{filteredOrders.length !== 1 ? "s" : ""}
                {orderPageCount > 1 ? ` · page ${safeOrdersPage}/${orderPageCount}` : ""}
              </span>
            </div>

            <div className="hidden overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 md:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 text-xs uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Order</th>
                      <th className="px-4 py-3 text-left">Shop</th>
                      <th className="px-4 py-3 text-left">Customer</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Placed</th>
                      <th className="px-4 py-3 text-center">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {pagedOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-zinc-400">
                          No orders found{state.orders.length === 0 ? " yet — place an order to see it here." : " matching your filters."}
                        </td>
                      </tr>
                    ) : (
                      pagedOrders.map((order) => {
                        const shopName =
                          state.merchants.find((m) => m.shop_id === order.shop_id)
                            ?.shop_name ?? "Unknown Shop";
                        const isExpanded = expandedOrderId === order.id;
                        return (
                          <Fragment key={order.id}>
                            <tr
                              onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                              className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors cursor-pointer"
                            >
                              <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                                #{order.id.slice(0, 8)}
                                {order.tracking_number && (
                                  <div className="text-[0.65rem] text-zinc-400">#{order.tracking_number}</div>
                                )}
                              </td>
                              <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                                {shopName}
                              </td>
                              <td className="px-4 py-3">
                                <div className="text-zinc-900 dark:text-zinc-100">{order.customer_name || "—"}</div>
                                <div className="text-xs text-zinc-500">{order.customer_phone || "—"}</div>
                              </td>
                              <td className="px-4 py-3 text-right font-medium">
                                {formatCurrency(order.total_amount)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <OrderStatusBadge status={order.status} />
                              </td>
                              <td className="px-4 py-3 text-right text-xs text-zinc-500">
                                {new Date(order.created_at).toLocaleString("en-PK", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </td>
                              <td className="px-4 py-3 text-center text-zinc-400">
                                {isExpanded ? "▲" : "▼"}
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-zinc-50 dark:bg-zinc-800/30">
                                <td colSpan={7} className="px-5 py-4">
                                  <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                                    Items
                                  </div>
                                  {(order.items_json ?? []).length === 0 ? (
                                    <p className="text-xs text-zinc-400">No item breakdown stored.</p>
                                  ) : (
                                    <div className="space-y-1.5">
                                      {(order.items_json as Array<{ name?: string; quantity?: number; price?: number }>).map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between text-sm">
                                          <span className="text-zinc-700 dark:text-zinc-300">
                                            {item.name ?? "Item"}
                                            {item.quantity ? ` × ${item.quantity}` : ""}
                                          </span>
                                          <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                            {formatCurrency(Number(item.price) || 0)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-500">
                                    <span>Order ID: <span className="break-all font-mono">{order.id}</span></span>
                                    <span>Status: {order.status}</span>
                                    {order.customer_user_id && <span>Linked account</span>}
                                    <span>
                                      Placed: {new Date(order.created_at).toLocaleString("en-PK")}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Order Cards (mobile) */}
            <div className="space-y-3 md:hidden">
              {pagedOrders.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-10 text-center text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
                  {state.orders.length === 0
                    ? "No orders found yet — place an order to see it here."
                    : "No orders found matching your filters."}
                </div>
              ) : (
                pagedOrders.map((order) => {
                  const shopName =
                    state.merchants.find((m) => m.shop_id === order.shop_id)?.shop_name ??
                    "Unknown Shop";
                  const isExpanded = expandedOrderId === order.id;
                  const items = (order.items_json ?? []) as Array<{
                    name?: string;
                    quantity?: number;
                    price?: number;
                  }>;
                  return (
                    <div
                      key={order.id}
                      className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-zinc-500">#{order.id.slice(0, 8)}</p>
                          <p className="mt-1 truncate font-semibold text-zinc-900 dark:text-zinc-100">
                            {order.customer_name || "—"}
                          </p>
                          <p className="truncate text-xs text-zinc-500">{shopName}</p>
                          {order.customer_phone && (
                            <p className="text-xs text-zinc-400">{order.customer_phone}</p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                            {formatCurrency(order.total_amount)}
                          </p>
                          <OrderStatusBadge status={order.status} />
                          <p className="mt-1 text-[0.65rem] text-zinc-400">
                            {new Date(order.created_at).toLocaleString("en-PK", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                        className="mt-3 flex w-full items-center justify-between rounded-xl bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300"
                      >
                        <span>
                          {items.length} item{items.length !== 1 ? "s" : ""}
                        </span>
                        <span>{isExpanded ? "▲ Hide items" : "▼ Show items"}</span>
                      </button>

                      {isExpanded && (
                        <div className="mt-2 space-y-1.5">
                          {items.length === 0 ? (
                            <p className="text-xs text-zinc-400">No item breakdown stored.</p>
                          ) : (
                            items.map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm">
                                <span className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-300">
                                  {item.name ?? "Item"}
                                  {item.quantity ? ` × ${item.quantity}` : ""}
                                </span>
                                <span className="ml-3 font-medium text-zinc-700 dark:text-zinc-300">
                                  {formatCurrency(Number(item.price) || 0)}
                                </span>
                              </div>
                            ))
                          )}
                          <div className="mt-2 border-t border-zinc-100 pt-2 text-xs text-zinc-500 dark:border-zinc-800">
                            Order ID: <span className="break-all font-mono">{order.id}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {orderPageCount > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setOrdersPage((p) => Math.max(1, p - 1))}
                  disabled={safeOrdersPage <= 1}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  Previous
                </button>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  Page {safeOrdersPage} of {orderPageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setOrdersPage((p) => Math.min(orderPageCount, p + 1))}
                  disabled={safeOrdersPage >= orderPageCount}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Live Transactions Tab ──────────────────────────────────── */}
        {activeTab === "transactions" && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                🔴 Live Transaction Monitor
              </h3>
              <span className="text-xs text-zinc-400">
                Live updates connected
              </span>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-[60vh] overflow-y-auto">
              {realtimeFeed.length === 0 ? (
                <div className="px-5 py-16 text-center text-zinc-400">
                  <div className="text-3xl mb-3">📡</div>
                  <p>Waiting for order activity...</p>
                  <p className="text-xs mt-2">
                    New orders and status changes will appear here in real-time.
                  </p>
                </div>
              ) : (
                realtimeFeed.map((event, idx) => (
                  <div
                    key={idx}
                    className="px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors flex items-center gap-3"
                  >
                    <div
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        event.newStatus === "Delivered"
                          ? "bg-emerald-500"
                          : event.newStatus === "Cancelled"
                            ? "bg-red-500"
                            : event.newStatus === "Dispatched"
                              ? "bg-purple-500"
                              : "bg-blue-500"
                      }`}
                    />
                    <div className="flex-grow min-w-0">
                      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        Order #{event.orderId.slice(0, 8)}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {event.isHistory ? (
                          <span className="font-semibold">{event.newStatus}</span>
                        ) : (
                          <>
                            {event.previousStatus} →{" "}
                            <span className="font-semibold">{event.newStatus}</span>
                          </>
                        )}
                        {" — "}
                        {event.shopName || "Unknown Shop"}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex-shrink-0">
                      {formatCurrency(event.totalAmount)}
                    </div>
                    <div className="text-xs text-zinc-400 flex-shrink-0 w-12 text-right">
                      {timeAgo(event.timestamp)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── Categories Tab ─────────────────────────────────────────── */}
        {activeTab === "categories" && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              Platform Category Taxonomy
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
              Manage the global category hierarchy available to all merchants on
              the platform.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {SHOP_CATEGORIES.filter((c) => c !== "All").map((cat) => {
                const count = state.merchants.filter(
                  (m) => m.category === cat,
                ).length;
                const isExpanded = expandedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => {
                      setExpandedCategory(isExpanded ? null : cat);
                      setSubCatError(null);
                      setNewSubCatName("");
                    }}
                    className={`text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                      isExpanded
                        ? "border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20"
                        : "border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 hover:border-blue-300 dark:hover:border-blue-700"
                    }`}
                  >
                    <div className="text-lg mb-1">
                      {cat === "Fashion & Apparel" ? "👗"
                        : cat === "Electronics & Gadgets" ? "📱"
                        : cat === "Home & Living" ? "🏠"
                        : cat === "Health & Beauty" ? "💄"
                        : cat === "Books & Stationery" ? "📚"
                        : cat === "Sports & Fitness" ? "🏋️"
                        : cat === "Toys & Baby Care" ? "🧸"
                        : cat === "Automotive Accessories" ? "🚗"
                        : cat === "Handmade & Crafts" ? "🎨"
                        : "📦"}
                    </div>
                    <div className="font-medium text-sm text-zinc-900 dark:text-zinc-100">
                      {cat}
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">
                      {count} merchant{count !== 1 ? "s" : ""} ·{" "}
                      {(subCategories[cat] ?? []).filter((s) => !s.is_others).length} sub-cats
                    </div>
                  </button>
                );
              })}
            </div>

            {expandedCategory && (
              <div className="mt-5 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/30">
                <h4 className="font-medium text-sm text-zinc-900 dark:text-zinc-100 mb-3">
                  Sub-categories for &quot;{expandedCategory}&quot;
                </h4>
                <div className="flex flex-wrap gap-2 mb-4">
                  {(subCategories[expandedCategory] ?? []).map((sub) => (
                    <span
                      key={sub.id}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
                        sub.is_active
                          ? "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
                          : "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-400 line-through"
                      }`}
                    >
                      {sub.icon} {sub.name}
                      {!sub.is_others && (
                        <button
                          onClick={() => handleToggleSubCategory(sub)}
                          disabled={subCatSaving}
                          title={sub.is_active ? "Deactivate" : "Reactivate"}
                          className="ml-1 text-zinc-400 hover:text-red-500 disabled:opacity-50"
                        >
                          {sub.is_active ? "✕" : "↺"}
                        </button>
                      )}
                    </span>
                  ))}
                  {(subCategories[expandedCategory] ?? []).length === 0 && (
                    <p className="text-xs text-zinc-400">No sub-categories yet.</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSubCatName}
                    onChange={(e) => setNewSubCatName(e.target.value)}
                    onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === "Enter") handleAddSubCategory(expandedCategory);
                    }}
                    placeholder="Sub-category name"
                    className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm flex-grow max-w-xs"
                  />
                  <button
                    onClick={() => handleAddSubCategory(expandedCategory)}
                    disabled={subCatSaving || !newSubCatName.trim()}
                    className="px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {subCatSaving ? "Adding..." : "+ Add"}
                  </button>
                </div>
                {subCatError && (
                  <p className="text-xs text-red-500 mt-2">{subCatError}</p>
                )}
              </div>
            )}

            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-700 dark:text-blue-400">
                ℹ Top-level categories are fixed platform-wide. Click a
                category above to manage its sub-categories — these power the
                dropdown merchants see when adding products.
              </p>
            </div>
          </div>
        )}

        {/* ── Ads Tab ────────────────────────────────────────────────── */}
        {activeTab === "ads" && (
          <div className="space-y-6">
            {/* Pending Ad Requests */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">📢 Ad Approval Queue</h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                    Review merchant-submitted sponsored banner requests before they go live.
                  </p>
                </div>
                <button
                  onClick={() => setShowPlatformAdForm((s) => !s)}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 shrink-0"
                >
                  {showPlatformAdForm ? "Cancel" : "+ Platform Ad"}
                </button>
              </div>

              {showPlatformAdForm && (
                <form onSubmit={handleCreatePlatformAd} className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 space-y-3 bg-zinc-50 dark:bg-zinc-800/30">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Platform ads are published immediately (no review needed) and aren&apos;t tied to any single shop.
                  </p>

                  {/* Live storefront preview — exact copy of the homepage card */}
                  <div className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      Storefront preview
                    </p>
                    <div className="mx-auto w-full max-w-md">
                      <AdCreativePreview form={platformAdForm} />
                    </div>
                  </div>

                  <ImageUpload
                    label="Banner Image (wide, e.g. 1600×900)"
                    currentUrl={platformAdForm.image_url}
                    onUploaded={(url) => setPlatformAdForm((f) => ({ ...f, image_url: url }))}
                    folder="ads"
                    fileId="platform-ad"
                    showPreview
                    aspect="video"
                    fallbackType="generic"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Title"
                      value={platformAdForm.title}
                      onChange={(e) => setPlatformAdForm((f) => ({ ...f, title: e.target.value }))}
                      className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Badge label"
                      value={platformAdForm.badge_label}
                      onChange={(e) => setPlatformAdForm((f) => ({ ...f, badge_label: e.target.value }))}
                      className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Subtitle"
                    value={platformAdForm.subtitle}
                    onChange={(e) => setPlatformAdForm((f) => ({ ...f, subtitle: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Link"
                    value={platformAdForm.link_url}
                    onChange={(e) => setPlatformAdForm((f) => ({ ...f, link_url: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
                  />
                  <label className="block">
                    <span className="mb-1 block text-[0.65rem] font-semibold text-zinc-500 dark:text-zinc-400">
                      Placement *
                    </span>
                    <select
                      value={platformAdForm.placement}
                      onChange={(e) =>
                        setPlatformAdForm((f) => ({
                          ...f,
                          placement: e.target.value as PromoAdPlacement,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
                    >
                      {AD_PLACEMENT_OPTIONS.filter((o) => o.value !== "all_pages").map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                      <option value="homepage_feed">Home feed</option>
                    </select>
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1 block text-[0.65rem] font-semibold text-zinc-500 dark:text-zinc-400">
                        Starts at <span className="font-normal">(optional)</span>
                      </span>
                      <input
                        type="datetime-local"
                        value={platformAdForm.starts_at}
                        onChange={(e) => setPlatformAdForm((f) => ({ ...f, starts_at: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[0.65rem] font-semibold text-zinc-500 dark:text-zinc-400">
                        Ends at <span className="font-normal">(optional)</span>
                      </span>
                      <input
                        type="datetime-local"
                        value={platformAdForm.ends_at}
                        onChange={(e) => setPlatformAdForm((f) => ({ ...f, ends_at: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
                      />
                    </label>
                  </div>
                  {platformAdError && <p className="text-xs text-red-500">{platformAdError}</p>}
                  <button
                    type="submit"
                    disabled={platformAdSaving}
                    className="px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {platformAdSaving ? "Publishing…" : "Publish Platform Ad"}
                  </button>
                </form>
              )}

              {adsLoading ? (
                <div className="px-5 py-10 text-center text-zinc-400">Loading ads…</div>
              ) : pendingAds.length === 0 ? (
                <div className="px-5 py-10 text-center text-zinc-400">
                  <div className="text-3xl mb-2">✅</div>
                  <p>No ad requests waiting for review.</p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {pendingAds.map((ad) => (
                    <div key={ad.id} className="px-5 py-4 flex flex-wrap items-center gap-4">
                      <img src={ad.image_url} alt={ad.title} className="h-14 w-24 rounded-lg object-cover bg-zinc-100 dark:bg-zinc-800 shrink-0" />
                      <div className="flex-grow min-w-[180px]">
                        <div className="font-medium text-zinc-900 dark:text-zinc-100">{ad.title}</div>
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {ad.shop_name} · {AD_PLACEMENT_LABELS[ad.placement] ?? ad.placement}
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5 truncate max-w-xs">→ {ad.link_url}</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReviewAd(ad.id, "approved")}
                          disabled={adProcessingId === ad.id}
                          className="px-4 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {adProcessingId === ad.id ? "..." : "✓ Approve"}
                        </button>
                        <button
                          onClick={() => handleReviewAd(ad.id, "rejected")}
                          disabled={adProcessingId === ad.id}
                          className="px-4 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* All Ads */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">All Ads ({ads.length})</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 text-xs uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Ad</th>
                      <th className="px-4 py-3 text-left">Shop</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-center">Price</th>
                      <th className="px-4 py-3 text-center">Views</th>
                      <th className="px-4 py-3 text-center">Clicks</th>
                      <th className="px-4 py-3 text-center">Live</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {ads.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-12 text-center text-zinc-400">No ads yet.</td></tr>
                    ) : (
                      ads.map((ad) => (
                        <tr key={ad.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                          <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100 max-w-xs truncate">{ad.title}</td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{ad.shop_name}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                              ad.status === "approved" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                : ad.status === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            }`}>
                              {ad.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {ad.price_paid != null ? (
                              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                {formatCurrency(ad.price_paid)}
                              </span>
                            ) : (
                              <span className="text-zinc-300 dark:text-zinc-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">{ad.impression_count.toLocaleString()}</td>
                          <td className="px-4 py-3 text-center">{ad.click_count.toLocaleString()}</td>
                          <td className="px-4 py-3 text-center">
                            {ad.status === "approved" ? (
                              <button
                                onClick={() => handleToggleAdActive(ad)}
                                disabled={adProcessingId === ad.id}
                                className={`px-3 py-1 rounded-lg text-xs font-medium disabled:opacity-50 ${
                                  ad.is_active
                                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
                                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                                }`}
                              >
                                {ad.is_active ? "Live" : "Paused"}
                              </button>
                            ) : (
                              <span className="text-zinc-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleDeleteAd(ad.id)}
                              disabled={adProcessingId === ad.id}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Ad Pricing Plans (monetization) */}
            <AdPlansManager />
          </div>
        )}
      </div>

      {drillDownShop && (
        <ShopDrillDownModal
          merchant={drillDownShop}
          onClose={() => setDrillDownShop(null)}
        />
      )}

      {/* ── Footer Bar ──────────────────────────────────────────────── */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="mx-auto max-w-7xl px-4 py-3 text-xs text-zinc-400 flex justify-between sm:px-6">
          <span>TrendsMart Super Admin v1.0</span>
          <span>Live monitoring active</span>
        </div>
      </div>
    </div>
  );
}

// ─── Metric Card Sub-Component ──────────────────────────────────────────────

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, string> = {
    Pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    Processing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    Dispatched: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    Delivered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    Cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${map[status] ?? map.Pending}`}>
      {status}
    </span>
  );
}

function MetricCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: string;
  label: string;
  value: string | number;
  sub: string;
  color: "blue" | "purple" | "emerald" | "amber";
}) {
  const borderColors = {
    blue: "border-l-blue-500",
    purple: "border-l-purple-500",
    emerald: "border-l-emerald-500",
    amber: "border-l-amber-500",
  };

  const bgColors = {
    blue: "bg-blue-50 dark:bg-blue-900/10",
    purple: "bg-purple-50 dark:bg-purple-900/10",
    emerald: "bg-emerald-50 dark:bg-emerald-900/10",
    amber: "bg-amber-50 dark:bg-amber-900/10",
  };

  return (
    <div
      className={`bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 border-l-4 ${borderColors[color]} p-5`}
    >
      <div className={`inline-flex p-2 rounded-xl ${bgColors[color]} mb-3`}>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-medium">
        {label}
      </div>
      <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-1 sm:text-2xl">
        {value}
      </div>
      <div className="text-xs text-zinc-400 mt-1">{sub}</div>
    </div>
  );
}