"use client";

import { useMemo } from "react";
import type { Product, Order } from "@/types";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                     */
/* -------------------------------------------------------------------------- */

function PackageIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16.5 9.4L7.55 4.24" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  );
}

function TrendingUpIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Metric Card                                                                */
/* -------------------------------------------------------------------------- */

interface MetricCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  icon: React.ReactNode;
  colorClass: string;
}

function MetricCard({ label, value, sublabel, icon, colorClass }: MetricCardProps) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {value}
          </p>
          {sublabel && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {sublabel}
            </p>
          )}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colorClass}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Progress Bar                                                               */
/* -------------------------------------------------------------------------- */

interface ProgressBarProps {
  label: string;
  current: number;
  total: number;
  colorClass: string;
}

function ProgressBar({ label, current, total, colorClass }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
        <span className="text-zinc-500 dark:text-zinc-400">
          {current} / {total} ({pct}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  DashboardCharts Component                                                  */
/* -------------------------------------------------------------------------- */

interface DashboardChartsProps {
  products: Product[];
  orders: Order[];
  totalViews?: number;
  viewsToday?: number;
  liveSince?: string;
}

export default function DashboardCharts({
  products,
  orders,
  totalViews = 0,
  viewsToday = 0,
  liveSince,
}: DashboardChartsProps) {
  // Compute derived metrics
  const metrics = useMemo(() => {
    const availableProducts = products.filter((p) => p.is_available).length;
    const soldOutProducts = products.length - availableProducts;
    const pendingOrders = orders.filter((o) => o.status === "Pending").length;
    const processingOrders = orders.filter((o) => o.status === "Processing").length;
    const completedOrders = orders.filter((o) => o.status === "Delivered").length;

    const totalRevenue = orders
      .filter((o) => o.status !== "Cancelled")
      .reduce((sum, o) => sum + o.total_amount, 0);

    return {
      availableProducts,
      soldOutProducts,
      pendingOrders,
      processingOrders,
      completedOrders,
      totalRevenue,
    };
  }, [products, orders]);

  return (
    <div className="space-y-4">
      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Catalog Items"
          value={products.length}
          sublabel={`${metrics.availableProducts} available`}
          icon={<PackageIcon />}
          colorClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
        />
        <MetricCard
          label="Total Revenue"
          value={`Rs. ${metrics.totalRevenue.toLocaleString()}`}
          sublabel={`${metrics.completedOrders} completed`}
          icon={<TrendingUpIcon />}
          colorClass="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
        />
        <MetricCard
          label="Store Views"
          value={totalViews}
          sublabel={`${viewsToday} today`}
          icon={<EyeIcon />}
          colorClass="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
        />
        <MetricCard
          label="Active Duration"
          value={(() => {
            if (!liveSince) return "—";
            const start = new Date(liveSince);
            const now = new Date();
            const diffMs = now.getTime() - start.getTime();
            const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            if (days === 0) return "Today";
            if (days === 1) return "1 day";
            return `${days} days`;
          })()}
          icon={<ClockIcon />}
          colorClass="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        />
      </div>

      {/* Progress Indicators */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
          Inventory & Engagement
        </h3>

        <ProgressBar
          label="Products Available"
          current={metrics.availableProducts}
          total={products.length}
          colorClass="bg-emerald-500"
        />

        <ProgressBar
          label="Orders Processing"
          current={metrics.processingOrders}
          total={orders.length || 1}
          colorClass="bg-blue-500"
        />

        <ProgressBar
          label="Orders Completed"
          current={metrics.completedOrders}
          total={orders.length || 1}
          colorClass="bg-green-500"
        />

        {/* Inquiry/Orders engagement summary */}
        <div className="mt-3 grid grid-cols-3 gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <div className="text-center">
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
              {metrics.pendingOrders}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Pending</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {metrics.processingOrders}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Processing</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {metrics.completedOrders}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Completed</p>
          </div>
        </div>
      </div>
    </div>
  );
}