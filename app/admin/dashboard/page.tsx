"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Super Admin Centralized Dashboard (Prompt 1)                    */
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
  type ChangeEvent,
  type KeyboardEvent,
  type FormEvent,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import { subscribeToPlatformTransactions } from "@/services/notificationService";
import type {
  PlatformMetrics,
  AdminMerchantRecord,
  OrderStatusNotification,
  ShopCategory,
  ShopVerificationStatus,
  Order,
} from "@/types";
import { SHOP_CATEGORIES } from "@/types";
import ImageUpload from "@/components/ImageUpload";
import type { SubCategoryWithMeta } from "@/services/subCategoryService";
import {
  fetchAllSubCategoriesGrouped,
  createSubCategory,
  setSubCategoryActive,
} from "@/services/subCategoryService";
import type { PromotionalAd, PromotionalAdFormData } from "@/types";
import {
  fetchAllAdsForAdmin,
  reviewAd,
  setAdActive as setAdActiveService,
  deleteAd as deleteAdService,
  createPlatformAd,
} from "@/services/adsService";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AdminDashboardState {
  metrics: PlatformMetrics | null;
  merchants: AdminMerchantRecord[];
  loading: boolean;
  error: string | null;
  realtimeFeed: OrderStatusNotification[];
  activeTab: "overview" | "approvals" | "merchants" | "transactions" | "categories" | "ads";
}

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

  const [state, setState] = useState<AdminDashboardState>({
    metrics: null,
    merchants: [],
    loading: true,
    error: null,
    realtimeFeed: [],
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

  // ─── Fetch All Data ─────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchAllData() {
      setState((s) => ({ ...s, loading: true, error: null }));

      try {
        // Fetch all shops with aggregated data
        const { data: shops, error: shopsErr } = await supabase
          .from("shops")
          .select("*")
          .order("created_at", { ascending: false });

        if (shopsErr) throw shopsErr;

        // Fetch all orders for aggregate metrics
        const { data: orders, error: ordersErr } = await supabase
          .from("orders")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500);

        if (ordersErr) throw ordersErr;

        // Fetch order counts per shop
        const { data: orderCountsRaw, error: countsErr } = await supabase
          .from("orders")
          .select("shop_id, total_amount, status");

        if (countsErr) throw countsErr;

        // Aggregate
        const allShopsArr = (shops as Record<string, unknown>[]) ?? [];
        const allOrdersArr = (orders as Record<string, unknown>[]) ?? [];
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
        const merchants: AdminMerchantRecord[] = allShopsArr.map((shop) => {
          const stats = shopOrderMap.get(shop.id as string);
          const verificationStatus =
            (shop.verification_status as ShopVerificationStatus) ?? "approved";
          return {
            shop_id: shop.id as string,
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
            product_count: 0, // Will be populated separately if needed
            created_at: (shop.created_at as string) ?? "",
            whatsapp_number: (shop.whatsapp_number as string) ?? "",
          };
        });

        // Calculate platform metrics
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();

        const todayOrders = allOrdersArr.filter(
          (o) => (o.created_at as string) >= todayISO,
        );
        const todayRevenue = todayOrders
          .filter((o) => (o.status as string) !== "Cancelled")
          .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

        const totalRevenue = allOrdersArr
          .filter((o) => (o.status as string) !== "Cancelled")
          .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

        const metrics: PlatformMetrics = {
          total_merchants: allShopsArr.length,
          active_merchants: allShopsArr.filter((s) => s.is_live as boolean).length,
          suspended_merchants: allShopsArr.filter(
            (s) => !(s.is_live as boolean),
          ).length,
          total_orders: allOrdersArr.length,
          total_revenue: totalRevenue,
          orders_today: todayOrders.length,
          revenue_today: todayRevenue,
          pending_verifications: allShopsArr.filter(
            (s) => ((s.verification_status as ShopVerificationStatus) ?? "approved") === "pending",
          ).length,
        };

        setState((s) => ({
          ...s,
          metrics,
          merchants,
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
  }, [supabase]);

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
    const reason = decision === "rejected" ? window.prompt("Optional: reason for rejection") ?? undefined : undefined;
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
    if (!confirm("Delete this ad permanently?")) return;
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
          // immediately; rejecting keeps it hidden regardless of is_live.
          ...(decision === "approved" ? { is_live: true } : {}),
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
                is_live: decision === "approved" ? true : m.is_live,
                suspended: decision === "approved" ? false : m.suspended,
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
                  : s.metrics.active_merchants,
            }
          : null,
      }));

      setActionMessage(
        decision === "approved"
          ? "Store approved — now live on the marketplace."
          : "Store rejected. It will remain hidden from customers.",
      );
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err) {
      logError(err, { module: "AdminDashboard.reviewShop" });
      setActionMessage("Action failed. Please try again.");
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

  // ─── Render ─────────────────────────────────────────────────────────────
  if (state.loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6">
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
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-6">
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
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                Super Admin Dashboard
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Platform overview & merchant management
              </p>
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
          <div className="flex gap-1 mt-4 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl inline-flex">
            {TAB_OPTIONS.map((tab) => (
              <button
                key={tab.key}
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    activeTab: tab.key as AdminDashboardState["activeTab"],
                  }))
                }
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
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

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
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
                          {event.previousStatus}→{event.newStatus}
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
          </>
        )}

        {/* ── Approval Queue Tab ────────────────────────────────────── */}
        {activeTab === "approvals" && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                ⏳ New Store Approval Queue
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                New merchant registrations stay hidden from customers until you
                approve them here.
              </p>
            </div>
            {pendingMerchants.length === 0 ? (
              <div className="px-5 py-16 text-center text-zinc-400">
                <div className="text-3xl mb-3">✅</div>
                <p>No stores waiting for review.</p>
                <p className="text-xs mt-2">
                  New merchant sign-ups will appear here automatically.
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
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setSearchMerchant(e.target.value)
                }
                className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm flex-grow max-w-xs"
              />
              <select
                value={filterCategory}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  setFilterCategory(e.target.value)
                }
                className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm"
              >
                <option value="All">All Categories</option>
                {SHOP_CATEGORIES.filter((c) => c !== "All").map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  setFilterStatus(e.target.value)
                }
                className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
              <span className="text-xs text-zinc-400 ml-auto">
                {filteredMerchants.length} merchant
                {filteredMerchants.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Merchant Table */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 text-xs uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Shop</th>
                      <th className="px-4 py-3 text-left">Category</th>
                      <th className="px-4 py-3 text-center">Orders</th>
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
                          colSpan={7}
                          className="px-4 py-12 text-center text-zinc-400"
                        >
                          No merchants found matching your filters.
                        </td>
                      </tr>
                    ) : (
                      filteredMerchants.map((merchant) => (
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
                            {merchant.verification_status === "pending" ? (
                              <div className="flex gap-1.5 justify-end">
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
                              </div>
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
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
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
                Supabase Realtime — WebSocket connected
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
                        {event.previousStatus} →{" "}
                        <span className="font-semibold">{event.newStatus}</span>
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
                    placeholder="New sub-category name..."
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
                  <ImageUpload
                    label="Banner Image"
                    currentUrl={platformAdForm.image_url}
                    onUploaded={(url) => setPlatformAdForm((f) => ({ ...f, image_url: url }))}
                    folder="ads"
                    fileId="platform-ad"
                    showPreview
                    fallbackType="generic"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Title *"
                      value={platformAdForm.title}
                      onChange={(e) => setPlatformAdForm((f) => ({ ...f, title: e.target.value }))}
                      className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Badge label (e.g. New)"
                      value={platformAdForm.badge_label}
                      onChange={(e) => setPlatformAdForm((f) => ({ ...f, badge_label: e.target.value }))}
                      className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Subtitle (optional)"
                    value={platformAdForm.subtitle}
                    onChange={(e) => setPlatformAdForm((f) => ({ ...f, subtitle: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Link to (e.g. /?category=Fashion) *"
                    value={platformAdForm.link_url}
                    onChange={(e) => setPlatformAdForm((f) => ({ ...f, link_url: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
                  />
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
                        <div className="text-xs text-zinc-500 mt-0.5">{ad.shop_name} · {ad.placement}</div>
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
                      <th className="px-4 py-3 text-center">Views</th>
                      <th className="px-4 py-3 text-center">Clicks</th>
                      <th className="px-4 py-3 text-center">Live</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {ads.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-zinc-400">No ads yet.</td></tr>
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
          </div>
        )}
      </div>

      {/* ── Footer Bar ──────────────────────────────────────────────── */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="max-w-7xl mx-auto px-6 py-3 text-xs text-zinc-400 flex justify-between">
          <span>TrendMart Super Admin v1.0</span>
          <span>Realtime monitoring active</span>
        </div>
      </div>
    </div>
  );
}

// ─── Metric Card Sub-Component ──────────────────────────────────────────────

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
      <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">
        {value}
      </div>
      <div className="text-xs text-zinc-400 mt-1">{sub}</div>
    </div>
  );
}