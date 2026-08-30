"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Merchant Financial Ledger & Cash Flow Tracker                  */
/*                                                                             */
/*  Features:                                                                  */
/*   - Record cash received (manual entries)                                   */
/*   - Track pending customer payments from WhatsApp orders                   */
/*   - Log daily/weekly expenses                                               */
/*   - View net profit margins                                                  */
/*   - Real-time order revenue sync from Supabase                             */
/*   - Export financial summary as CSV                                        */
/* -------------------------------------------------------------------------- */

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
import { scopedKey } from "@/lib/clientScope";
import { fetchShops } from "@/services/shopService";
import { getStatusLabel } from "@/services/notificationService";
import type { Shop, Order, OrderStatus } from "@/types";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmProvider";
import CustomSelect from "@/components/CustomSelect";

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface CashEntry {
  id: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  date: string;
  created_at?: string;
}

interface FinanceSummary {
  orderRevenue: number;
  manualIncome: number;
  totalRevenue: number;
  totalExpenses: number;
  pendingPayments: number;
  netProfit: number;
  profitMargin: number;
  totalOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
}

type LedgerRow = {
  id: string;
  kind: "order" | "manual";
  date: string;
  type: "income" | "expense" | "pending";
  category: string;
  description: string;
  amount: number;
  status?: OrderStatus;
};

const PAGE_SIZE = 20;

const ORDER_STATUS_TONES: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  Processing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Dispatched: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  Delivered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  Cancelled: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

const EXPENSE_CATEGORIES = [
  "Rent",
  "Utilities",
  "Inventory Purchase",
  "Shipping & Delivery",
  "Marketing & Ads",
  "Staff Salary",
  "Maintenance",
  "Taxes & Licenses",
  "Supplies",
  "Other",
] as const;

const INCOME_CATEGORIES = [
  "WhatsApp Order",
  "Walk-in Sale",
  "Online Payment",
  "Wholesale Order",
  "Other Income",
] as const;

/* ─── Icons ────────────────────────────────────────────────────────────────── */

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

function ArrowDownIcon() {
  return (
    <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg className="h-4 w-4 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function orderMonthKey(order: Order): string {
  return (order.created_at ?? "").slice(0, 7);
}

function entryMonthKey(entry: CashEntry): string {
  return entry.date.slice(0, 7);
}

function orderItemSummary(order: Order): string {
  const count = order.items_json?.length ?? 0;
  const first = order.items_json?.[0]?.name;
  if (count <= 1) return first ?? "Order";
  return `${first ?? "Item"} +${count - 1} more`;
}

/* ─── Page Component ───────────────────────────────────────────────────────── */

export default function FinancesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { addToast } = useToast();
  const { confirm } = useConfirm();

  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [allShops, setAllShops] = useState<Shop[]>([]);
  const [activeShopId, setActiveShopId] = useState<string | null>(null);
  const shop = allShops.find((s) => s.id === activeShopId) ?? null;

  // Finance state
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Form state
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [entryForm, setEntryForm] = useState({
    description: "",
    amount: 0,
    type: "income" as "income" | "expense",
    category: "WhatsApp Order",
    date: formatDate(new Date()),
  });
  const [entrySaving, setEntrySaving] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");
  const [filterMonth, setFilterMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ordersPage, setOrdersPage] = useState(1);

  // Auth check
  useEffect(() => {
    let cancelled = false;
    async function checkSession() {
      const { data } = await supabase.auth.getUser();
      if (!cancelled) {
        if (!data.user) { router.replace("/auth"); } else { setUserId(data.user.id); }
        setAuthLoading(false);
      }
    }
    checkSession();
    return () => { cancelled = true; };
  }, [supabase.auth, router]);

  // Load shops
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function loadShops() {
      const result = await fetchShops();
      if (cancelled) return;
      if (result.success) {
        const myShops = result.data.filter((s) => s.owner_id === userId);
        setAllShops(myShops);
        const savedId = typeof window !== "undefined" ? localStorage.getItem(scopedKey("trendmart_active_shop")) : null;
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

  // Load finance entries and orders
  useEffect(() => {
    if (!activeShopId) return;
    let cancelled = false;

    async function loadEntries() {
      setEntriesLoading(true);
      const { data, error } = await supabase
        .from("finance_entries")
        .select("*")
        .eq("shop_id", activeShopId)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (!cancelled && !error) {
        setEntries((data ?? []) as CashEntry[]);
      }
      setEntriesLoading(false);
    }

    async function loadOrders() {
      setOrdersLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("shop_id", activeShopId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (!cancelled && !error) {
        setOrders((data ?? []) as unknown as Order[]);
      }
      setOrdersLoading(false);
    }

    loadEntries();
    loadOrders();
    return () => { cancelled = true; };
  }, [activeShopId, supabase]);

  // ── Month-scoped data ───────────────────────────────────────────────────────
  const monthOrders = useMemo(() => {
    if (!filterMonth) return orders;
    return orders.filter((o) => orderMonthKey(o) === filterMonth);
  }, [orders, filterMonth]);

  const monthEntries = useMemo(() => {
    if (!filterMonth) return entries;
    return entries.filter((e) => entryMonthKey(e) === filterMonth);
  }, [entries, filterMonth]);

  // ── Derived Finance Summary ────────────────────────────────────────────────
  const summary = useMemo((): FinanceSummary => {
    const orderRevenue = monthOrders
      .filter((o) => o.status === "Delivered" || o.status === "Dispatched")
      .reduce((sum, o) => sum + (o.total_amount || 0), 0);

    const manualIncome = monthEntries
      .filter((e) => e.type === "income")
      .reduce((sum, e) => sum + e.amount, 0);

    const totalExpenses = monthEntries
      .filter((e) => e.type === "expense")
      .reduce((sum, e) => sum + e.amount, 0);

    const pendingPayments = monthOrders
      .filter((o) => o.status === "Pending" || o.status === "Processing")
      .reduce((sum, o) => sum + (o.total_amount || 0), 0);

    const totalRevenue = orderRevenue + manualIncome;
    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    return {
      orderRevenue,
      manualIncome,
      totalRevenue,
      totalExpenses,
      pendingPayments,
      netProfit,
      profitMargin,
      totalOrders: monthOrders.length,
      deliveredOrders: monthOrders.filter((o) => o.status === "Delivered").length,
      cancelledOrders: monthOrders.filter((o) => o.status === "Cancelled").length,
    };
  }, [monthOrders, monthEntries]);

  const orderStatusBreakdown = useMemo(() => {
    const statuses: OrderStatus[] = [
      "Pending",
      "Processing",
      "Dispatched",
      "Delivered",
      "Cancelled",
    ];
    return statuses.map((status) => {
      const matched = monthOrders.filter((o) => o.status === status);
      return {
        status,
        count: matched.length,
        amount: matched.reduce((sum, o) => sum + (o.total_amount || 0), 0),
      };
    });
  }, [monthOrders]);

  const ledgerRows = useMemo((): LedgerRow[] => {
    const rows: LedgerRow[] = [];

    for (const order of monthOrders) {
      const isPending = order.status === "Pending" || order.status === "Processing";
      const isCancelled = order.status === "Cancelled";
      rows.push({
        id: `order-${order.id}`,
        kind: "order",
        date: (order.created_at ?? "").slice(0, 10),
        type: isPending ? "pending" : isCancelled ? "expense" : "income",
        category: `Order · ${getStatusLabel(order.status)}`,
        description: `#${order.id.slice(0, 8)} · ${order.customer_name || "Customer"} · ${orderItemSummary(order)}`,
        amount: order.total_amount || 0,
        status: order.status,
      });
    }

    for (const entry of monthEntries) {
      rows.push({
        id: `entry-${entry.id}`,
        kind: "manual",
        date: entry.date,
        type: entry.type,
        category: entry.category,
        description: entry.description,
        amount: entry.amount,
      });
    }

    rows.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    return rows;
  }, [monthOrders, monthEntries]);

  const filteredLedgerRows = useMemo(() => {
    if (filterType === "all") return ledgerRows;
    if (filterType === "income") {
      return ledgerRows.filter((r) => r.type === "income");
    }
    return ledgerRows.filter((r) => r.type === "expense" || r.type === "pending");
  }, [ledgerRows, filterType]);

  const ledgerTotalPages = Math.max(1, Math.ceil(filteredLedgerRows.length / PAGE_SIZE));
  const ledgerSafePage = Math.min(ledgerPage, ledgerTotalPages);
  const pagedLedgerRows = useMemo(() => {
    const start = (ledgerSafePage - 1) * PAGE_SIZE;
    return filteredLedgerRows.slice(start, start + PAGE_SIZE);
  }, [filteredLedgerRows, ledgerSafePage]);

  const ordersTotalPages = Math.max(1, Math.ceil(monthOrders.length / PAGE_SIZE));
  const ordersSafePage = Math.min(ordersPage, ordersTotalPages);
  const pagedOrders = useMemo(() => {
    const start = (ordersSafePage - 1) * PAGE_SIZE;
    return monthOrders.slice(start, start + PAGE_SIZE);
  }, [monthOrders, ordersSafePage]);

  useEffect(() => {
    setLedgerPage(1);
    setOrdersPage(1);
  }, [filterMonth, filterType]);

  // ── Filtered manual entries (legacy table) ────────────────────────────────
  const filteredEntries = useMemo(() => {
    return monthEntries.filter((entry) => {
      if (filterType !== "all" && entry.type !== filterType) return false;
      return true;
    });
  }, [monthEntries, filterType]);

  // ── Save entry ─────────────────────────────────────────────────────────────
  const handleSaveEntry = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!activeShopId || !entryForm.description.trim() || entryForm.amount <= 0) return;
    setEntrySaving(true);

    const newEntry = {
      shop_id: activeShopId,
      description: entryForm.description.trim(),
      amount: entryForm.amount,
      type: entryForm.type,
      category: entryForm.category,
      date: entryForm.date,
    };

    const { data, error } = await supabase
      .from("finance_entries")
      .insert(newEntry)
      .select()
      .single();

    if (error) {
      addToast("Failed to save entry: " + error.message, "error");
    } else if (data) {
      setEntries((prev) => [data as CashEntry, ...prev]);
      addToast("Entry saved successfully!", "success");
      setEntryForm({ description: "", amount: 0, type: "income", category: "WhatsApp Order", date: formatDate(new Date()) });
      setShowEntryForm(false);
    }
    setEntrySaving(false);
  }, [activeShopId, entryForm, supabase, addToast]);

  // ── Delete entry ───────────────────────────────────────────────────────────
  const handleDeleteEntry = useCallback(async (entryId: string) => {
    if (!(await confirm("Delete this entry permanently?"))) return;
    const { error } = await supabase
      .from("finance_entries")
      .delete()
      .eq("id", entryId);
    if (error) {
      addToast("Failed to delete: " + error.message, "error");
    } else {
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
      addToast("Entry deleted.", "info");
    }
  }, [supabase, addToast, confirm]);

  // ── Export CSV ─────────────────────────────────────────────────────────────
  const handleExportCSV = useCallback(() => {
    const headers = ["Date", "Source", "Type", "Category", "Description", "Amount", "Status"];
    const rows = filteredLedgerRows.map((r) => [
      r.date,
      r.kind === "order" ? "Order" : "Manual",
      r.type,
      r.category,
      `"${r.description.replace(/"/g, '""')}"`,
      r.amount.toString(),
      r.status ?? "",
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `finances-${shop?.name ?? "export"}-${filterMonth || "all"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    addToast("Full ledger exported!", "success");
  }, [filteredLedgerRows, filterMonth, shop, addToast]);

  // ── Available months for filtering ─────────────────────────────────────────
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    for (const entry of entries) {
      const m = entryMonthKey(entry);
      if (m) months.add(m);
    }
    for (const order of orders) {
      const m = orderMonthKey(order);
      if (m) months.add(m);
    }
    return Array.from(months).sort().reverse();
  }, [entries, orders]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
      {/* Header */}
      <header className="sticky top-[var(--tm-navbar-sticky-offset)] z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">
              Merchant dashboard
            </p>
            <h1 className="tm-font-display truncate text-xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-2xl">
              {shop?.name ? `${shop.name} — Finances` : "Financial Ledger"}
            </h1>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Orders, income, expenses &amp; profit — sab ek jagah
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {allShops.length > 1 && (
              <CustomSelect
                value={activeShopId ?? ""}
                onChange={(val) => setActiveShopId(val)}
                options={allShops.map((s) => ({ value: s.id, label: s.name }))}
                ariaLabel="Switch shop"
                pill
                size="sm"
                fullWidth={false}
              />
            )}
            <Link
              href="/dashboard/orders"
              className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Manage orders
            </Link>
            <Link
              href="/dashboard"
              className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              ← Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 pb-safe-nav">
        {!activeShopId && (
          <section className="py-12 text-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Create a shop first to track finances.</p>
          </section>
        )}

        {activeShopId && (
          <>
            {/* ── Summary Cards ──────────────────────────────────────────── */}
            <section>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  {filterMonth ? `${filterMonth} ` : "All-time "}Summary
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {summary.totalOrders} orders · {filteredEntries.length} manual entries
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-center shadow-sm dark:border-emerald-800 dark:bg-emerald-900/20">
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 sm:text-xl">
                    {formatCurrency(summary.orderRevenue)}
                  </p>
                  <p className="mt-1 text-[0.65rem] text-emerald-700 dark:text-emerald-300">Order revenue</p>
                </div>
                <div className="rounded-2xl border border-teal-200 bg-teal-50 p-3 text-center shadow-sm dark:border-teal-800 dark:bg-teal-900/20">
                  <p className="text-lg font-bold text-teal-600 dark:text-teal-400 sm:text-xl">
                    {formatCurrency(summary.manualIncome)}
                  </p>
                  <p className="mt-1 text-[0.65rem] text-teal-700 dark:text-teal-300">Manual income</p>
                </div>
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-center shadow-sm dark:border-red-800 dark:bg-red-900/20">
                  <p className="text-lg font-bold text-red-600 dark:text-red-400 sm:text-xl">
                    {formatCurrency(summary.totalExpenses)}
                  </p>
                  <p className="mt-1 text-[0.65rem] text-red-700 dark:text-red-300">Expenses</p>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-center shadow-sm dark:border-amber-800 dark:bg-amber-900/20">
                  <p className="text-lg font-bold text-amber-600 dark:text-amber-400 sm:text-xl">
                    {formatCurrency(summary.pendingPayments)}
                  </p>
                  <p className="mt-1 text-[0.65rem] text-amber-700 dark:text-amber-300">Pending</p>
                </div>
                <div className={`rounded-2xl border p-3 text-center shadow-sm ${
                  summary.netProfit >= 0
                    ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
                    : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
                }`}>
                  <p className={`text-lg font-bold sm:text-xl ${
                    summary.netProfit >= 0 ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"
                  }`}>
                    {formatCurrency(summary.netProfit)}
                  </p>
                  <p className="mt-1 text-[0.65rem] text-blue-700 dark:text-blue-300">
                    Net profit ({summary.profitMargin.toFixed(1)}%)
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white p-3 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
                  <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100 sm:text-xl">
                    {formatCurrency(summary.totalRevenue)}
                  </p>
                  <p className="mt-1 text-[0.65rem] text-zinc-500 dark:text-zinc-400">Total income</p>
                </div>
              </div>

              {/* Profit margin bar */}
              <div className="tm-panel mt-3 p-4">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-600 dark:text-zinc-400">Profit Margin</span>
                  <span className="text-zinc-500 dark:text-zinc-400">{summary.profitMargin.toFixed(1)}%</span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                  <div
                    className={`h-full rounded-full transition-all ${
                      summary.profitMargin >= 20
                        ? "bg-emerald-500"
                        : summary.profitMargin >= 10
                          ? "bg-amber-500"
                          : "bg-red-500"
                    }`}
                    style={{ width: `${Math.min(Math.max(summary.profitMargin, 0), 100)}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[0.625rem] text-zinc-400">
                  <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                </div>
              </div>
            </section>

            {/* ── Order status breakdown ─────────────────────────────────── */}
            <section aria-label="Order breakdown">
              <h2 className="mb-3 text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Order breakdown
              </h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {orderStatusBreakdown.map(({ status, count, amount }) => (
                  <div key={status} className="tm-panel p-3 text-center">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${ORDER_STATUS_TONES[status]}`}>
                      {getStatusLabel(status)}
                    </span>
                    <p className="mt-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">{count}</p>
                    <p className="text-[0.65rem] text-zinc-500 dark:text-zinc-400">{formatCurrency(amount)}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Filters & Actions ──────────────────────────────────────── */}
            <section>
              <div className="flex flex-wrap items-center gap-3">
                {/* Month filter */}
                <CustomSelect
                  value={filterMonth}
                  onChange={(val) => setFilterMonth(val)}
                  options={[
                    { value: "", label: "All Months" },
                    ...availableMonths.map((m) => ({ value: m, label: m })),
                  ]}
                  ariaLabel="Filter by month"
                  fullWidth={false}
                />

                {/* Type filter */}
                <div className="flex overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
                  {(["all", "income", "expense"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFilterType(t)}
                      className={`px-3 py-2 text-xs font-semibold transition-colors ${
                        filterType === t
                          ? "bg-emerald-600 text-white"
                          : "bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                      }`}
                    >
                      <FilterIcon />
                      <span className="ml-1">{t === "all" ? "All" : t === "income" ? "Income" : "Expenses"}</span>
                    </button>
                  ))}
                </div>

                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    disabled={filteredLedgerRows.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                  >
                    <DownloadIcon /> Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEntryForm(!showEntryForm)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
                  >
                    <PlusIcon /> {showEntryForm ? "Cancel" : "Add Entry"}
                  </button>
                </div>
              </div>
            </section>

            {/* ── New Entry Form ─────────────────────────────────────────── */}
            {showEntryForm && (
              <section>
                <form onSubmit={handleSaveEntry} className="tm-panel space-y-4 border-emerald-200 p-5 dark:border-emerald-800">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">New Financial Entry</h3>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEntryForm((f) => ({ ...f, type: "income", category: "WhatsApp Order" }))}
                      className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                        entryForm.type === "income"
                          ? "bg-emerald-600 text-white"
                          : "border border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      💵 Income
                    </button>
                    <button
                      type="button"
                      onClick={() => setEntryForm((f) => ({ ...f, type: "expense", category: "Rent" }))}
                      className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                        entryForm.type === "expense"
                          ? "bg-red-600 text-white"
                          : "border border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      📤 Expense
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Category</label>
                      <CustomSelect
                        value={entryForm.category}
                        onChange={(val) => setEntryForm((f) => ({ ...f, category: val }))}
                        options={(entryForm.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => ({ value: c, label: c }))}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Amount (PKR) *</label>
                      <input
                        type="number"
                        required
                        min={1}
                        step={1}
                        value={entryForm.amount || ""}
                        onChange={(e) => setEntryForm((f) => ({ ...f, amount: Number(e.target.value) }))}
                        placeholder="Amount"
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Description *</label>
                      <input
                        type="text"
                        required
                        value={entryForm.description}
                        onChange={(e) => setEntryForm((f) => ({ ...f, description: e.target.value }))}
                        placeholder="Note"
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">Date</label>
                      <input
                        type="date"
                        value={entryForm.date}
                        onChange={(e) => setEntryForm((f) => ({ ...f, date: e.target.value }))}
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={entrySaving || !entryForm.description.trim() || entryForm.amount <= 0}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 dark:focus:ring-offset-zinc-900"
                  >
                    <PlusIcon />
                    {entrySaving ? "Saving…" : "Save Entry"}
                  </button>
                </form>
              </section>
            )}

            {/* ── Unified Activity Ledger (orders + manual) ──────────────── */}
            <section>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Full activity ledger ({filteredLedgerRows.length})
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Har order aur manual entry yahan dikhegi
                </p>
              </div>

              {(entriesLoading || ordersLoading) ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="tm-panel animate-pulse px-4 py-3">
                      <div className="h-5 rounded bg-zinc-200 dark:bg-zinc-800" />
                    </div>
                  ))}
                </div>
              ) : filteredLedgerRows.length === 0 ? (
                <div className="tm-panel rounded-2xl border border-dashed border-zinc-300 py-12 text-center dark:border-zinc-700">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Is month mein abhi koi order ya entry nahi.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {pagedLedgerRows.map((row) => {
                      const body = (
                        <>
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          row.type === "income"
                            ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : row.type === "pending"
                              ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                              : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                        }`}>
                          {row.kind === "order" ? "🧾" : row.type === "income" ? "💵" : "📤"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {row.description}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">{row.category}</span>
                            <span className="text-xs text-zinc-400">·</span>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                              {new Date(row.date).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })}
                            </span>
                            {row.status && (
                              <span className={`rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold ${ORDER_STATUS_TONES[row.status]}`}>
                                {getStatusLabel(row.status)}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className={`shrink-0 text-sm font-bold ${
                          row.type === "income"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : row.type === "pending"
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-red-600 dark:text-red-400"
                        }`}>
                          {row.type === "expense" ? "-" : row.type === "pending" ? "~" : "+"}
                          {formatCurrency(row.amount)}
                        </span>
                        </>
                      );

                      return row.kind === "order" ? (
                        <Link
                          key={row.id}
                          href="/dashboard/orders"
                          className="tm-panel flex items-center gap-3 px-4 py-3 transition hover:border-emerald-300 dark:hover:border-emerald-700"
                        >
                          {body}
                        </Link>
                      ) : (
                        <div key={row.id} className="tm-panel flex items-center gap-3 px-4 py-3">
                          {body}
                        </div>
                      );
                    })}
                  </div>

                  {filteredLedgerRows.length > PAGE_SIZE && (
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Page {ledgerSafePage} of {ledgerTotalPages}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={ledgerSafePage <= 1}
                          onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}
                          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 enabled:hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:enabled:hover:bg-zinc-800"
                        >
                          ← Prev
                        </button>
                        <button
                          type="button"
                          disabled={ledgerSafePage >= ledgerTotalPages}
                          onClick={() => setLedgerPage((p) => Math.min(ledgerTotalPages, p + 1))}
                          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 enabled:hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:enabled:hover:bg-zinc-800"
                        >
                          Next →
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>

            {/* ── Manual entries only ───────────────────────────────────── */}
            <section>
              <h2 className="mb-4 text-base font-bold text-zinc-900 dark:text-zinc-100">
                Manual entries ({filteredEntries.length})
              </h2>

              {entriesLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="tm-panel animate-pulse px-4 py-3">
                      <div className="h-5 rounded bg-zinc-200 dark:bg-zinc-800" />
                    </div>
                  ))}
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="tm-panel rounded-2xl border border-dashed border-zinc-300 py-12 text-center dark:border-zinc-700">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {filterType !== "all" || filterMonth
                      ? "No entries match your filters."
                      : "No financial entries yet. Add your first entry above!"}
                  </p>
                </div>
              ) : (
                <div className="tm-panel overflow-hidden">
                  {/* Desktop table */}
                  <table className="hidden w-full text-left text-sm sm:table" role="table" aria-label="Financial entries">
                    <thead className="border-b border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Date</th>
                        <th scope="col" className="px-4 py-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Category</th>
                        <th scope="col" className="px-4 py-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Description</th>
                        <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-zinc-500 dark:text-zinc-400">Amount</th>
                        <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-zinc-500 dark:text-zinc-400">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEntries.map((entry) => (
                        <tr key={entry.id} className="border-t border-zinc-50 hover:bg-zinc-50 dark:border-zinc-800/50 dark:hover:bg-zinc-800/50">
                          <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                            {new Date(entry.date).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              entry.type === "income"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            }`}>
                              {entry.category}
                            </span>
                          </td>
                          <td className="max-w-[200px] truncate px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {entry.description}
                          </td>
                          <td className={`px-4 py-3 text-right text-sm font-bold ${
                            entry.type === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                          }`}>
                            {entry.type === "income" ? "+" : "-"}{formatCurrency(entry.amount)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteEntry(entry.id)}
                              className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                              aria-label={`Delete ${entry.description}`}
                            >
                              <TrashIcon />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
                      <tr>
                        <td colSpan={3} className="px-4 py-3 text-right text-xs font-bold text-zinc-700 dark:text-zinc-300">Total</td>
                        <td className={`px-4 py-3 text-right text-sm font-bold ${
                          filteredEntries.reduce((sum, e) => sum + (e.type === "income" ? e.amount : -e.amount), 0) >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }`}>
                          {formatCurrency(filteredEntries.reduce((sum, e) => sum + (e.type === "income" ? e.amount : -e.amount), 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>

                  {/* Mobile card list */}
                  <div className="sm:hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                    {filteredEntries.map((entry) => (
                      <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                          entry.type === "income" ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                        }`}>
                          {entry.type === "income" ? <ArrowDownIcon /> : <ArrowUpIcon />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{entry.description}</p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {entry.category} · {new Date(entry.date).toLocaleDateString("en-PK", { day: "2-digit", month: "short" })}
                          </p>
                        </div>
                        <span className={`text-sm font-bold ${
                          entry.type === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                        }`}>
                          {entry.type === "income" ? "+" : "-"}{formatCurrency(entry.amount)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteEntry(entry.id)}
                          className="shrink-0 rounded-lg p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                          aria-label={`Delete ${entry.description}`}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    ))}
                    {/* Mobile total */}
                    <div className="flex items-center justify-between bg-zinc-50 px-4 py-3 dark:bg-zinc-800/50">
                      <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Total</span>
                      <span className={`text-sm font-bold ${
                        filteredEntries.reduce((sum, e) => sum + (e.type === "income" ? e.amount : -e.amount), 0) >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }`}>
                        {formatCurrency(filteredEntries.reduce((sum, e) => sum + (e.type === "income" ? e.amount : -e.amount), 0))}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* ── All orders detail ─────────────────────────────────────── */}
            <section>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  All orders ({monthOrders.length})
                </h2>
                <Link
                  href="/dashboard/orders"
                  className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  Manage in Orders →
                </Link>
              </div>
              {ordersLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="tm-panel animate-pulse px-4 py-3">
                      <div className="h-10 rounded bg-zinc-200 dark:bg-zinc-800" />
                    </div>
                  ))}
                </div>
              ) : monthOrders.length === 0 ? (
                <div className="tm-panel rounded-2xl border border-dashed border-zinc-300 py-8 text-center dark:border-zinc-700">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Is month mein koi order nahi.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {pagedOrders.map((order) => (
                      <div key={order.id} className="flex items-center gap-3 tm-panel px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {order.customer_name || "Customer"}
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {orderItemSummary(order)} · {new Date(order.created_at).toLocaleDateString("en-PK")}
                            {order.customer_phone ? ` · ${order.customer_phone}` : ""}
                          </p>
                          <p className="font-mono text-[0.65rem] text-zinc-400">#{order.id.slice(0, 8)}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-bold ${
                            order.status === "Delivered" || order.status === "Dispatched"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : order.status === "Cancelled"
                                ? "text-zinc-400 line-through"
                                : "text-amber-600 dark:text-amber-400"
                          }`}>
                            {formatCurrency(order.total_amount)}
                          </p>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ORDER_STATUS_TONES[order.status]}`}>
                            {getStatusLabel(order.status)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {monthOrders.length > PAGE_SIZE && (
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Page {ordersSafePage} of {ordersTotalPages}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={ordersSafePage <= 1}
                          onClick={() => setOrdersPage((p) => Math.max(1, p - 1))}
                          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 enabled:hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:enabled:hover:bg-zinc-800"
                        >
                          ← Prev
                        </button>
                        <button
                          type="button"
                          disabled={ordersSafePage >= ordersTotalPages}
                          onClick={() => setOrdersPage((p) => Math.min(ordersTotalPages, p + 1))}
                          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 enabled:hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:enabled:hover:bg-zinc-800"
                        >
                          Next →
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}