"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import { formatRupees } from "@/lib/formatters";
import { downloadOrdersCSV, downloadProductsCSV } from "@/services/exportService";
import type { Order, Product } from "@/types";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                      */
/* -------------------------------------------------------------------------- */

function ChevronLeftIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
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

function TrendingUpIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface DailySnapshot {
  date: string;
  revenue: number;
  orders: number;
  customers: number;
}

interface ProductAnalyticsData {
  name: string;
  clicks: number;
  revenue: number;
  orders: number;
}

interface LeadStats {
  source: string;
  count: number;
  converted: number;
}

interface AnalyticsData {
  dailySnapshots: DailySnapshot[];
  topProducts: ProductAnalyticsData[];
  leadStats: LeadStats[];
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  uniqueCustomers: number;
}

// ─── Colors ─────────────────────────────────────────────────────────────────

const CHART_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

// ─── Custom Tooltip ─────────────────────────────────────────────────────────

type SimpleTooltipProps = {
  active?: boolean;
  payload?: Array<{ value: number; name?: string; dataKey?: string | number }>;
  label?: string | number;
};

function RevenueTooltip({ active, payload, label }: SimpleTooltipProps) {
  if (!active || !payload?.length) return null;
  const dateLabel = typeof label === "string" ? new Date(label).toLocaleDateString("en-PK", { dateStyle: "medium" }) : String(label ?? "");
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{dateLabel}</p>
      <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatRupees(payload[0].value)}</p>
    </div>
  );
}

function OrdersTooltip({ active, payload, label }: SimpleTooltipProps) {
  if (!active || !payload?.length) return null;
  const dateLabel = typeof label === "string" ? new Date(label).toLocaleDateString("en-PK", { dateStyle: "medium" }) : String(label ?? "");
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{dateLabel}</p>
      <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{payload[0].value} orders</p>
    </div>
  );
}

function BarTooltip({ active, payload, label }: SimpleTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{String(label ?? "")}</p>
      <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatRupees(payload[0].value)}</p>
    </div>
  );
}

// ─── Label Renderers ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderPieLabel(props: Record<string, any>) {
  const name = typeof props.name === "string" ? props.name : "";
  const value = typeof props.value === "number" ? props.value : 0;
  return `${name} (${value})`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AnalyticsDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shop, setShop] = useState<{ id: string; name: string } | null>(null);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [timeRange, setTimeRange] = useState<7 | 30 | 90>(30);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setError("Not authenticated"); setLoading(false); return; }

        const { data: shopData } = await supabase
          .from("shops").select("id, name").eq("owner_id", user.id).limit(1).single();

        if (!shopData || cancelled) { setLoading(false); return; }
        if (cancelled) return;
        setShop(shopData);

        const { data: orders } = await supabase
          .from("orders")
          .select("*")
          .eq("shop_id", shopData.id)
          .order("created_at", { ascending: false });

        const { data: logs } = await supabase
          .from("analytics_logs")
          .select("*")
          .eq("shop_id", shopData.id);

        const { data: products } = await supabase
          .from("products")
          .select("*")
          .eq("shop_id", shopData.id)
          .order("created_at", { ascending: false });

        if (cancelled) return;

        const orderList = (orders as Order[]) ?? [];
        const productList = (products as Product[]) ?? [];
        setAllOrders(orderList);
        setAllProducts(productList);
        const logList = (logs as { event_type: string; product_id?: string; created_at: string }[]) ?? [];

        const dailyMap = new Map<string, { revenue: number; orders: number; customers: Set<string> }>();
        const now = new Date();
        const cutoff = new Date(now.getTime() - timeRange * 24 * 60 * 60 * 1000);

        for (const o of orderList) {
          if (!o.created_at) continue;
          const d = o.created_at.slice(0, 10);
          if (new Date(d) < cutoff) continue;
          const entry = dailyMap.get(d) ?? { revenue: 0, orders: 0, customers: new Set() };
          entry.revenue += o.total_amount;
          entry.orders += 1;
          if (o.customer_phone) entry.customers.add(o.customer_phone);
          dailyMap.set(d, entry);
        }

        const productRevMap = new Map<string, { name: string; revenue: number; orders: number }>();
        for (const o of orderList) {
          for (const item of (o.items_json ?? [])) {
            const pid = item.product_id ?? item.name;
            const existing = productRevMap.get(pid) ?? { name: item.name, revenue: 0, orders: 0 };
            existing.revenue += item.price;
            existing.orders += 1;
            productRevMap.set(pid, existing);
          }
        }

        const clickMap = new Map<string, number>();
        for (const l of logList) {
          if (l.event_type === "product_click" && l.product_id) {
            clickMap.set(l.product_id, (clickMap.get(l.product_id) ?? 0) + 1);
          }
        }

        const topProducts: ProductAnalyticsData[] = [];
        for (const [, rev] of productRevMap) {
          topProducts.push({
            name: rev.name,
            clicks: 0,
            revenue: rev.revenue,
            orders: rev.orders,
          });
        }
        topProducts.sort((a, b) => b.revenue - a.revenue);

        const leadSources = new Map<string, { count: number; converted: number }>();
        const sources = ["whatsapp", "catalog", "chatbot", "direct", "other"];
        for (const s of sources) leadSources.set(s, { count: 0, converted: 0 });
        for (const o of orderList) {
          const entry = leadSources.get("whatsapp")!;
          entry.count += 1;
          entry.converted += 1;
        }
        const shopViewCount = logList.filter((l) => l.event_type === "shop_view").length;
        const catEntry = leadSources.get("catalog")!;
        catEntry.count = shopViewCount;

        const leadStats: LeadStats[] = Array.from(leadSources.entries()).map(([source, s]) => ({
          source: source.charAt(0).toUpperCase() + source.slice(1),
          count: s.count,
          converted: s.converted,
        }));

        const dailySnapshots: DailySnapshot[] = Array.from(dailyMap.entries())
          .map(([date, d]) => ({ date, revenue: d.revenue, orders: d.orders, customers: d.customers.size }))
          .sort((a, b) => a.date.localeCompare(b.date));

        const totalRevenue = dailySnapshots.reduce((s, d) => s + d.revenue, 0);
        const totalOrders = dailySnapshots.reduce((s, d) => s + d.orders, 0);
        const allCustomers = new Set<string>();
        for (const [, entry] of dailyMap) {
          for (const c of entry.customers) allCustomers.add(c);
        }

        setData({
          dailySnapshots,
          topProducts: topProducts.slice(0, 10),
          leadStats,
          totalRevenue,
          totalOrders,
          avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
          uniqueCustomers: allCustomers.size,
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load analytics");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [timeRange]);

  const handleExportOrdersCSV = useCallback(() => {
    if (allOrders.length === 0) return;
    downloadOrdersCSV(allOrders, shop?.name);
  }, [allOrders, shop]);

  const handleExportInventoryCSV = useCallback(() => {
    if (allProducts.length === 0) return;
    downloadProductsCSV(allProducts, shop?.name);
  }, [allProducts, shop]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !shop) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
        <p className="text-sm text-red-500">{error ?? "No shop found"}</p>
        <Link href="/dashboard" className="mt-3 text-sm font-medium text-emerald-600 hover:underline">← Back to Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link href="/dashboard" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800" aria-label="Back to dashboard">
            <ChevronLeftIcon />
          </Link>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Advanced Analytics</h1>
          <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">{shop.name}</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setTimeRange(d as 7 | 30 | 90)}
                className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors ${
                  timeRange === d
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportInventoryCSV}
              disabled={allProducts.length === 0}
              className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              📦 Inventory CSV
            </button>
            <button
              type="button"
              onClick={handleExportOrdersCSV}
              disabled={allOrders.length === 0}
              className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <DownloadIcon /> Orders CSV
            </button>
          </div>
        </div>

        {!data ? (
          <div className="py-20 text-center text-sm text-zinc-400 dark:text-zinc-500">No analytics data available yet.</div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Total Revenue", value: formatRupees(data.totalRevenue), icon: "💰" },
                { label: "Total Orders", value: data.totalOrders.toLocaleString(), icon: "📦" },
                { label: "Avg. Order Value", value: formatRupees(data.avgOrderValue), icon: "📊" },
                { label: "Unique Customers", value: data.uniqueCustomers.toLocaleString(), icon: "👥" },
              ].map((kpi) => (
                <div key={kpi.label} className="trend-card p-4 text-center">
                  <p className="text-2xl">{kpi.icon}</p>
                  <p className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-100">{kpi.value}</p>
                  <p className="text-[0.65rem] text-zinc-400 dark:text-zinc-500">{kpi.label}</p>
                </div>
              ))}
            </div>

            {/* Daily Revenue Trend Chart */}
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">
                <TrendingUpIcon /> Daily Revenue Trend
              </h3>
              <div className="trend-card p-4">
                {data.dailySnapshots.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={data.dailySnapshots}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: "#71717a" }}
                        tickFormatter={(v: string) => {
                          const d = new Date(v);
                          return `${d.getDate()}/${d.getMonth() + 1}`;
                        }}
                      />
                      <YAxis tick={{ fontSize: 11, fill: "#71717a" }} />
                      <Tooltip content={<RevenueTooltip />} />
                      <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: "#10b981" }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-8 text-center text-sm text-zinc-400">No revenue data for this period.</p>
                )}
              </div>
            </section>

            {/* Top Products Bar Chart */}
            <section>
              <h3 className="mb-3 text-sm font-bold text-zinc-900 dark:text-zinc-100">📈 Top Products by Revenue</h3>
              <div className="trend-card p-4">
                {data.topProducts.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={data.topProducts.slice(0, 8)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: "#71717a" }} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "#71717a" }} width={120} />
                      <Tooltip content={<BarTooltip />} />
                      <Bar dataKey="revenue" fill="#10b981" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-8 text-center text-sm text-zinc-400">No product sales data yet.</p>
                )}
              </div>
            </section>

            {/* Dual Charts Row */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Daily Order Volume */}
              <div className="trend-card p-4">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">📋 Orders per Day</h4>
                {data.dailySnapshots.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.dailySnapshots}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: "#71717a" }}
                        tickFormatter={(v: string) => {
                          const d = new Date(v);
                          return `${d.getDate()}/${d.getMonth() + 1}`;
                        }}
                      />
                      <YAxis tick={{ fontSize: 10, fill: "#71717a" }} allowDecimals={false} />
                      <Tooltip content={<OrdersTooltip />} />
                      <Bar dataKey="orders" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-8 text-center text-sm text-zinc-400">No data.</p>
                )}
              </div>

              {/* Lead Acquisition Pie Chart */}
              <div className="trend-card p-4">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">🎯 Lead Sources</h4>
                {data.leadStats.some((l) => l.count > 0) ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={data.leadStats.filter((l) => l.count > 0)}
                        dataKey="count"
                        nameKey="source"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={40}
                        paddingAngle={3}
                        label={renderPieLabel}
                        labelLine={{ stroke: "#71717a", strokeWidth: 1 }}
                      >
                        {data.leadStats.filter((l) => l.count > 0).map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-8 text-center text-sm text-zinc-400">No lead data yet.</p>
                )}
              </div>
            </div>

            {/* Top Clicked Products Table */}
            <section>
              <h3 className="mb-3 text-sm font-bold text-zinc-900 dark:text-zinc-100">🔥 Top Clicked Products</h3>
              <div className="trend-card overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
                    <tr>
                      <th className="px-4 py-2.5 text-xs font-semibold text-zinc-500">Product</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-500">Clicks</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-500">Revenue</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-500">Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProducts.length > 0 ? (
                      data.topProducts.slice(0, 10).map((p, i) => (
                        <tr key={i} className="border-t border-zinc-50 dark:border-zinc-800/50">
                          <td className="px-4 py-2.5 font-medium text-zinc-800 dark:text-zinc-200">{p.name}</td>
                          <td className="px-4 py-2.5 text-right text-zinc-500">{p.clicks.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right font-medium text-emerald-600">{formatRupees(p.revenue)}</td>
                          <td className="px-4 py-2.5 text-right text-zinc-500">{p.orders}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-sm text-zinc-400">No product data yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Lead Conversion Summary */}
            <section>
              <h3 className="mb-3 text-sm font-bold text-zinc-900 dark:text-zinc-100">📊 Lead Conversion Summary</h3>
              <div className="trend-card overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
                    <tr>
                      <th className="px-4 py-2.5 text-xs font-semibold text-zinc-500">Source</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-500">Total Leads</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-500">Converted</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-500">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.leadStats.map((l) => (
                      <tr key={l.source} className="border-t border-zinc-50 dark:border-zinc-800/50">
                        <td className="px-4 py-2.5 font-medium text-zinc-800 dark:text-zinc-200">{l.source}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-500">{l.count.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-500">{l.converted.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`inline-flex items-center gap-1 font-semibold ${l.count > 0 ? "text-emerald-600" : "text-zinc-400"}`}>
                            {l.count > 0 ? `${((l.converted / l.count) * 100).toFixed(1)}%` : "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}