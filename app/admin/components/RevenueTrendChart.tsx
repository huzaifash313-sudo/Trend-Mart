"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Revenue Trend Chart (last N days)                              */
/*  Renders a 14-day revenue/order trend for the Super-Admin overview.        */
/* -------------------------------------------------------------------------- */

export interface RevenueTrendPoint {
  label: string;
  revenue: number;
  orders: number;
}

const REVENUE_TICK = (value: number): string =>
  value >= 1000 ? `Rs. ${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k` : `Rs. ${value}`;

export default function RevenueTrendChart({ data }: { data: RevenueTrendPoint[] }) {
  const hasData = data.some((d) => d.revenue > 0 || d.orders > 0);

  if (!hasData) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700">
        <p className="text-sm text-zinc-400">No order activity yet — trends appear as orders come in.</p>
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#71717a" }}
            tickLine={false}
            axisLine={{ stroke: "currentColor", opacity: 0.2 }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            yAxisId="revenue"
            tick={{ fontSize: 10, fill: "#71717a" }}
            tickFormatter={REVENUE_TICK}
            tickLine={false}
            axisLine={false}
            width={62}
          />
          <YAxis yAxisId="orders" orientation="right" hide />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid rgba(120,120,120,0.25)",
              background: "var(--tm-surface, #fff)",
              fontSize: 12,
            }}
            labelStyle={{ fontWeight: 600, marginBottom: 4 }}
            formatter={(value, name) =>
              name === "Revenue"
                ? [`Rs. ${Number(value ?? 0).toLocaleString("en-PK")}`, "Revenue"]
                : [String(value ?? 0), "Orders"]
            }
          />
          <Bar
            yAxisId="revenue"
            dataKey="revenue"
            name="Revenue"
            fill="var(--chart-revenue, #10b981)"
            radius={[4, 4, 0, 0]}
            maxBarSize={26}
          />
          <Line
            yAxisId="orders"
            dataKey="orders"
            name="Orders"
            stroke="var(--chart-orders, #6366f1)"
            strokeWidth={2}
            dot={false}
            type="monotone"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
