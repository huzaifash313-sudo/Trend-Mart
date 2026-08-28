"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { formatRupees, formatCount } from "@/lib/formatters";
import type { Order, Product } from "@/types";

/* -------------------------------------------------------------------------- */
/*  Types & Constants                                                         */
/* -------------------------------------------------------------------------- */

export interface DailyRevenue {
  date: string;
  revenue: number;
  orders: number;
}

export interface CategoryDistribution {
  category: string;
  count: number;
  revenue: number;
}

export interface PeakHourData {
  hour: string;
  orders: number;
  revenue: number;
}

export interface TopProduct {
  name: string;
  orders: number;
  revenue: number;
}

export interface AnalyticsData {
  dailyRevenue: DailyRevenue[];
  categoryDistribution: CategoryDistribution[];
  peakHours: PeakHourData[];
  topProducts: TopProduct[];
}

type TimeRange = "7d" | "30d" | "90d";
type ChartView = "revenue" | "orders" | "categories" | "peak-hours" | "top-products";

const CHART_COLORS = [
  "#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1",
];

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  "7d": "7 Days",
  "30d": "30 Days",
  "90d": "90 Days",
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Derive daily revenue, category distribution, peak hours, and top products
 * from raw orders and products arrays (client-side aggregation).
 */
export function deriveAnalyticsData(
  orders: Order[],
  products: Product[],
): AnalyticsData {
  // ── Daily Revenue ────────────────────────────────────────────────────────
  const revenueMap = new Map<string, { revenue: number; orders: number }>();

  for (const order of orders) {
    if (order.status === "Cancelled") continue;
    const dateKey = order.created_at.slice(0, 10); // "YYYY-MM-DD"
    const existing = revenueMap.get(dateKey);
    if (existing) {
      existing.revenue += order.total_amount;
      existing.orders += 1;
    } else {
      revenueMap.set(dateKey, { revenue: order.total_amount, orders: 1 });
    }
  }

  const dailyRevenue: DailyRevenue[] = Array.from(revenueMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ── Category Distribution (from products ──────────────────────────────────
  const catMap = new Map<string, { count: number; revenue: number }>();

  // Products don't carry category directly in current schema — bucket all in
  // "General" so the distribution still reflects the catalog size.
  if (products.length > 0) {
    catMap.set("General", { count: products.length, revenue: 0 });
  }

  // Attach revenue from orders to categories
  for (const order of orders) {
    if (order.status === "Cancelled") continue;
    for (const item of order.items_json) {
      const category = "General";
      const existing = catMap.get(category);
      if (existing) {
        existing.revenue += item.price;
      } else {
        catMap.set(category, { count: 0, revenue: item.price });
      }
    }
  }

  const categoryDistribution: CategoryDistribution[] = Array.from(catMap.entries())
    .map(([category, data]) => ({ category, ...data }))
    .sort((a, b) => b.revenue - a.revenue);

  // ── Peak Hours ────────────────────────────────────────────────────────────
  const hourMap = new Map<number, { orders: number; revenue: number }>();
  for (let h = 0; h < 24; h++) {
    hourMap.set(h, { orders: 0, revenue: 0 });
  }

  for (const order of orders) {
    if (order.status === "Cancelled") continue;
    const hour = new Date(order.created_at).getHours();
    const existing = hourMap.get(hour)!;
    existing.orders += 1;
    existing.revenue += order.total_amount;
  }

  const peakHours: PeakHourData[] = Array.from(hourMap.entries())
    .map(([hour, data]) => ({
      hour: `${hour.toString().padStart(2, "0")}:00`,
      ...data,
    }))
    .sort((a, b) => a.hour.localeCompare(b.hour));

  // ── Top Products ──────────────────────────────────────────────────────────
  const productMap = new Map<string, { orders: number; revenue: number }>();

  for (const order of orders) {
    if (order.status === "Cancelled") continue;
    for (const item of order.items_json) {
      const name = item.name || "Unknown Product";
      const existing = productMap.get(name);
      if (existing) {
        existing.orders += 1;
        existing.revenue += item.price;
      } else {
        productMap.set(name, { orders: 1, revenue: item.price });
      }
    }
  }

  const topProducts: TopProduct[] = Array.from(productMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return { dailyRevenue, categoryDistribution, peakHours, topProducts };
}

/** Filter daily revenue data by time range. */
function filterByTimeRange(data: DailyRevenue[], range: TimeRange): DailyRevenue[] {
  const now = new Date();
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return data.filter((d) => d.date >= cutoffStr);
}

/* -------------------------------------------------------------------------- */
/*  Custom Tooltip                                                            */
/* -------------------------------------------------------------------------- */

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  valueFormatter?: (value: number) => string;
}

function ChartTooltip({ active, payload, label, valueFormatter }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
      {label && (
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {label}
        </p>
      )}
      {payload.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2 text-sm">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {entry.name}:
          </span>
          <span className="font-bold text-zinc-900 dark:text-zinc-100">
            {valueFormatter ? valueFormatter(entry.value) : entry.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-Components                                                            */
/* -------------------------------------------------------------------------- */

interface RevenueTrendChartProps {
  data: DailyRevenue[];
}

function RevenueTrendChart({ data }: RevenueTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
        No revenue data available yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="ordersGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12, fill: "#71717a" }}
          tickFormatter={(val: string) => {
            const d = new Date(val);
            return d.toLocaleDateString("en-PK", { month: "short", day: "numeric" });
          }}
        />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 12, fill: "#71717a" }}
          tickFormatter={(val: number) => formatRupees(val)}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 12, fill: "#71717a" }}
          tickFormatter={(val: number) => formatCount(val)}
        />
        <Tooltip
          content={
            <ChartTooltip
              valueFormatter={(v) => formatRupees(v)}
            />
          }
        />
        <Legend />
        <Area
          yAxisId="left"
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke="#10b981"
          fill="url(#revenueGradient)"
          strokeWidth={2}
          dot={{ r: 3, fill: "#10b981" }}
          activeDot={{ r: 5 }}
        />
        <Area
          yAxisId="right"
          type="monotone"
          dataKey="orders"
          name="Orders"
          stroke="#3b82f6"
          fill="url(#ordersGradient)"
          strokeWidth={2}
          dot={{ r: 3, fill: "#3b82f6" }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface CategoryDistributionChartProps {
  data: CategoryDistribution[];
}

function CategoryDistributionChart({ data }: CategoryDistributionChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
        No category data available yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Pie
          data={data}
          dataKey="revenue"
          nameKey="category"
          cx="50%"
          cy="50%"
          outerRadius={100}
          label={({ name, percent }) =>
            `${name} (${(percent != null ? (percent * 100).toFixed(0) : "0")}%)`
          }
          labelLine={{ stroke: "#71717a", strokeWidth: 1 }}
        >
          {data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={CHART_COLORS[index % CHART_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip
          content={
            <ChartTooltip valueFormatter={(v) => formatRupees(v)} />
          }
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

interface PeakHoursChartProps {
  data: PeakHourData[];
}

function PeakHoursChart({ data }: PeakHoursChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
        No traffic data available yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
        <XAxis
          dataKey="hour"
          tick={{ fontSize: 12, fill: "#71717a" }}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "#71717a" }}
          tickFormatter={(val: number) => formatCount(val)}
        />
        <Tooltip
          content={
            <ChartTooltip valueFormatter={(v) => v.toLocaleString()} />
          }
        />
        <Legend />
        <Bar
          dataKey="orders"
          name="Orders"
          fill="#8b5cf6"
          radius={[4, 4, 0, 0]}
          maxBarSize={32}
        />
        <Bar
          dataKey="revenue"
          name="Revenue"
          fill="#f59e0b"
          radius={[4, 4, 0, 0]}
          maxBarSize={32}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface TopProductsChartProps {
  data: TopProduct[];
}

function TopProductsChart({ data }: TopProductsChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
        No product performance data available yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 10, right: 10, left: 20, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
        <XAxis
          type="number"
          tick={{ fontSize: 12, fill: "#71717a" }}
          tickFormatter={(val: number) => formatRupees(val)}
        />
        <YAxis
          dataKey="name"
          type="category"
          tick={{ fontSize: 11, fill: "#71717a" }}
          width={130}
          tickFormatter={(val: string) =>
            val.length > 18 ? val.slice(0, 18) + "…" : val
          }
        />
        <Tooltip
          content={
            <ChartTooltip valueFormatter={(v) => formatRupees(v)} />
          }
        />
        <Legend />
        <Bar
          dataKey="revenue"
          name="Revenue"
          fill="#10b981"
          radius={[0, 4, 4, 0]}
          maxBarSize={20}
        />
        <Bar
          dataKey="orders"
          name="Orders"
          fill="#3b82f6"
          radius={[0, 4, 4, 0]}
          maxBarSize={20}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* -------------------------------------------------------------------------- */
/*  Skeleton Loader                                                            */
/* -------------------------------------------------------------------------- */

function ChartSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-48 rounded-lg bg-zinc-200 dark:bg-zinc-700" />
      <div className="h-80 rounded-xl bg-zinc-100 dark:bg-zinc-800" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Component: AnalyticsCharts                                           */
/* -------------------------------------------------------------------------- */

interface AnalyticsChartsProps {
  orders: Order[];
  products: Product[];
  isLoading?: boolean;
}

export default function AnalyticsCharts({
  orders,
  products,
  isLoading = false,
}: AnalyticsChartsProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [activeView, setActiveView] = useState<ChartView>("revenue");

  // Derive analytics from raw data
  const analytics = useMemo(
    () => deriveAnalyticsData(orders, products),
    [orders, products],
  );

  const filteredRevenue = useMemo(
    () => filterByTimeRange(analytics.dailyRevenue, timeRange),
    [analytics.dailyRevenue, timeRange],
  );

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalRevenue = filteredRevenue.reduce((sum, d) => sum + d.revenue, 0);
    const totalOrders = filteredRevenue.reduce((sum, d) => sum + d.orders, 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const peakHour =
      analytics.peakHours.length > 0
        ? analytics.peakHours.reduce((max, h) =>
            h.orders > max.orders ? h : max,
          )
        : null;

    return { totalRevenue, totalOrders, avgOrderValue, peakHour };
  }, [filteredRevenue, analytics.peakHours]);

  const viewOptions: { key: ChartView; label: string; icon: string }[] = [
    { key: "revenue", label: "Revenue Trend", icon: "📈" },
    { key: "orders", label: "Order Volume", icon: "📦" },
    { key: "categories", label: "Categories", icon: "🏷️" },
    { key: "peak-hours", label: "Peak Hours", icon: "⏰" },
    { key: "top-products", label: "Top Products", icon: "🏆" },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <ChartSkeleton key={i} />
          ))}
        </div>
        <ChartSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Total Revenue
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatRupees(summaryStats.totalRevenue)}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {timeRange === "7d" ? "Last 7 days" : timeRange === "30d" ? "Last 30 days" : "Last 90 days"}
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Total Orders
          </p>
          <p className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">
            {formatCount(summaryStats.totalOrders)}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {timeRange === "7d" ? "Last 7 days" : timeRange === "30d" ? "Last 30 days" : "Last 90 days"}
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Avg. Order Value
          </p>
          <p className="mt-1 text-2xl font-bold text-violet-600 dark:text-violet-400">
            {formatRupees(summaryStats.avgOrderValue)}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">Per order</p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Peak Hour
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {summaryStats.peakHour ? summaryStats.peakHour.hour : "—"}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {summaryStats.peakHour
              ? `${summaryStats.peakHour.orders} orders`
              : "No data yet"}
          </p>
        </div>
      </div>

      {/* ── View Switcher ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {viewOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setActiveView(opt.key)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeView === opt.key
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            }`}
          >
            <span>{opt.icon}</span>
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── Time Range Selector (for revenue/orders views) ────────────────── */}
      {(activeView === "revenue" || activeView === "orders") && (
        <div className="flex items-center gap-2">
          {(Object.keys(TIME_RANGE_LABELS) as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                timeRange === range
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              {TIME_RANGE_LABELS[range]}
            </button>
          ))}
        </div>
      )}

      {/* ── Chart Area ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="mb-4 text-sm font-bold text-zinc-900 dark:text-zinc-100">
          {viewOptions.find((v) => v.key === activeView)?.label}
        </h3>

        {(() => {
          switch (activeView) {
            case "revenue":
              return <RevenueTrendChart data={filteredRevenue} />;
            case "orders":
              return (
                <RevenueTrendChart
                  data={filteredRevenue}
                />
              );
            case "categories":
              return (
                <CategoryDistributionChart
                  data={analytics.categoryDistribution}
                />
              );
            case "peak-hours":
              return (
                <PeakHoursChart data={analytics.peakHours} />
              );
            case "top-products":
              return (
                <TopProductsChart data={analytics.topProducts} />
              );
            default:
              return <RevenueTrendChart data={filteredRevenue} />;
          }
        })()}
      </div>

      {/* ── Data Table (Top Products) ─────────────────────────────────────── */}
      {activeView === "top-products" && analytics.topProducts.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    #
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Product
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Orders
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Revenue
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {analytics.topProducts.map((product, idx) => (
                  <tr
                    key={product.name}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-500">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                      {product.name}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {formatCount(product.orders)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatRupees(product.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}