"use client";

import { useState, useEffect, useMemo } from "react";
import type { MerchantAnalytics } from "@/types";
import { fetchMerchantAnalytics } from "@/services/orderService";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                      */
/* -------------------------------------------------------------------------- */

function RevenueIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16.5 9.4L7.55 4.24" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.29 7 12 12 20.71 7" /><line x1="12" y1="22" x2="12" y2="12" />
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
  title: string;
  value: string | number;
  icon: React.ReactNode;
  accent: "emerald" | "blue" | "amber" | "purple";
  loading?: boolean;
}

function MetricCard({ title, value, icon, accent, loading }: MetricCardProps) {
  const accentColor = useMemo(() => {
    switch (accent) {
      case "emerald": return "text-emerald-600 dark:text-emerald-400";
      case "blue": return "text-blue-600 dark:text-blue-400";
      case "amber": return "text-amber-600 dark:text-amber-400";
      case "purple": return "text-purple-600 dark:text-purple-400";
      default: return "text-zinc-600 dark:text-zinc-400";
    }
  }, [accent]);

  const accentBg = useMemo(() => {
    switch (accent) {
      case "emerald": return "bg-emerald-100 dark:bg-emerald-900/30";
      case "blue": return "bg-blue-100 dark:bg-blue-900/30";
      case "amber": return "bg-amber-100 dark:bg-amber-900/30";
      case "purple": return "bg-purple-100 dark:bg-purple-900/30";
      default: return "bg-zinc-100 dark:bg-zinc-800";
    }
  }, [accent]);

  if (loading) {
    return (
      <div className="animate-pulse rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 h-8 w-8 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="mb-2 h-7 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-3 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <div className={`inline-flex rounded-lg p-2 ${accentBg} ${accentColor}`}>
          {icon}
        </div>
      </div>
      <p className={`text-2xl font-bold ${accentColor}`}>{value}</p>
      <p className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">{title}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  AnalyticsCards Component                                                    */
/* -------------------------------------------------------------------------- */

interface AnalyticsCardsProps {
  shopId: string;
}

export default function AnalyticsCards({ shopId }: AnalyticsCardsProps) {
  const [data, setData] = useState<MerchantAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      const result = await fetchMerchantAnalytics(shopId);
      if (cancelled) return;
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error);
      }
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [shopId]);

  const formatRevenue = (amount: number) => {
    if (amount >= 1_000_000) return `Rs. ${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `Rs. ${(amount / 1_000).toFixed(1)}K`;
    return `Rs. ${amount}`;
  };

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center dark:border-red-800 dark:bg-red-900/20">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <MetricCard
        title="Total Revenue"
        value={data ? formatRevenue(data.total_revenue) : "—"}
        icon={<RevenueIcon />}
        accent="emerald"
        loading={loading}
      />
      <MetricCard
        title="Active Products"
        value={data?.active_product_count ?? "—"}
        icon={<PackageIcon />}
        accent="blue"
        loading={loading}
      />
      <MetricCard
        title="Store Views"
        value={data?.total_store_views ?? "—"}
        icon={<EyeIcon />}
        accent="purple"
        loading={loading}
      />
      <MetricCard
        title="Pending Orders"
        value={data?.pending_orders_count ?? "—"}
        icon={<ClockIcon />}
        accent="amber"
        loading={loading}
      />
    </div>
  );
}