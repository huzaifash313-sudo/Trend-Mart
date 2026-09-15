/** Shared merchant dashboard navigation (sidebar + drawer). */

export type MerchantNavItem = {
  href: string;
  label: string;
  blurb: string;
  /** Highlight TrendBot differently */
  accent?: "indigo";
  /** Only show for dine-in shop categories */
  dineInOnly?: boolean;
};

export const MERCHANT_NAV: MerchantNavItem[] = [
  { href: "/dashboard", label: "Overview", blurb: "Store snapshot" },
  { href: "/dashboard/orders", label: "Orders", blurb: "Queue & status" },
  {
    href: "/dashboard/kitchen",
    label: "Kitchen",
    blurb: "Prep tickets",
    dineInOnly: true,
  },
  {
    href: "/dashboard/tables",
    label: "Tables",
    blurb: "QR dine-in",
    dineInOnly: true,
  },
  { href: "/dashboard/products", label: "Products", blurb: "Catalog & stock" },
  { href: "/dashboard/pos", label: "POS", blurb: "Counter & billing" },
  {
    href: "/dashboard/assistant",
    label: "TrendBot",
    blurb: "AI coach",
    accent: "indigo",
  },
  { href: "/dashboard/inquiries", label: "Messages", blurb: "Customer chat" },
  { href: "/dashboard/leads", label: "Leads", blurb: "Follow-ups" },
  { href: "/dashboard/finances", label: "Finance", blurb: "Income & expenses" },
  { href: "/dashboard/ads", label: "Ads", blurb: "Sponsored reach" },
  { href: "/dashboard/analytics", label: "Analytics", blurb: "Views & sales" },
  { href: "/dashboard/settings", label: "Settings", blurb: "Store & delivery" },
  { href: "/dashboard/billing", label: "Billing", blurb: "Plan & tokens" },
];

export function isMerchantNavActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

export function filterMerchantNav(
  items: MerchantNavItem[],
  dineIn: boolean,
): MerchantNavItem[] {
  return items.filter((item) => !item.dineInOnly || dineIn);
}
