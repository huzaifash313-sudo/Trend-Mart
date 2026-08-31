"use client";

/* -------------------------------------------------------------------------- */
/*  Ad link target picker — shop / product / deal / page / custom URL           */
/* -------------------------------------------------------------------------- */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchProductsByShopId } from "@/services/productService";
import { fetchDealsByShopId } from "@/services/dealService";
import type { Product } from "@/types";
import type { ShopDeal } from "@/lib/dealSchedule";

export type AdLinkKind = "shop" | "product" | "deal" | "page" | "custom";

type ShopOption = { id: string; name: string; slug?: string | null };

interface AdLinkTargetPickerProps {
  value: string;
  onChange: (url: string) => void;
  /** Merchant: fixed to their shop. Admin: leave null to allow picking any shop. */
  shopId?: string | null;
  shopName?: string;
  /** When true (admin), load a shop list and allow platform page targets. */
  allowAnyShop?: boolean;
  className?: string;
}

const PAGE_TARGETS: { label: string; href: string }[] = [
  { label: "Home", href: "/" },
  { label: "Deals page", href: "/deals" },
  { label: "Products page", href: "/products" },
];

function inferKind(url: string, shopId?: string | null): AdLinkKind {
  const u = url.trim();
  if (!u) return shopId ? "shop" : "page";
  if (u === "/" || u === "/deals" || u === "/products") return "page";
  if (/^\/p\//.test(u)) return "product";
  if (/#deals/.test(u) || /#deal-/.test(u)) return "deal";
  if (/^\/shop\//.test(u)) return "shop";
  return "custom";
}

function productHref(p: Product): string {
  const code = p.short_code?.trim() || p.id;
  return `/p/${code}`;
}

function dealHref(shopId: string, dealId: string): string {
  return `/shop/${shopId}#deal-${dealId}`;
}

function shopHref(shopId: string): string {
  return `/shop/${shopId}`;
}

export default function AdLinkTargetPicker({
  value,
  onChange,
  shopId: fixedShopId = null,
  shopName,
  allowAnyShop = false,
  className = "",
}: AdLinkTargetPickerProps) {
  const supabase = useMemo(() => createClient(), []);
  const [kind, setKind] = useState<AdLinkKind>(() => inferKind(value, fixedShopId));
  const [shops, setShops] = useState<ShopOption[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<string>(fixedShopId ?? "");
  const [products, setProducts] = useState<Product[]>([]);
  const [deals, setDeals] = useState<ShopDeal[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [productId, setProductId] = useState("");
  const [dealId, setDealId] = useState("");

  const activeShopId = fixedShopId || selectedShopId || "";

  // Sync kind when external value changes (e.g. edit form)
  useEffect(() => {
    setKind(inferKind(value, fixedShopId));
  }, [value, fixedShopId]);

  // Admin: load approved shops once
  useEffect(() => {
    if (!allowAnyShop) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("shops")
        .select("id, name, slug")
        .eq("verification_status", "approved")
        .order("name", { ascending: true })
        .limit(300);
      if (cancelled) return;
      setShops((data as ShopOption[]) ?? []);
      // Infer shop from current URL if present
      const m = value.trim().match(/^\/shop\/([^/#?]+)/);
      if (m?.[1]) setSelectedShopId(m[1]);
    })();
    return () => {
      cancelled = true;
    };
  }, [allowAnyShop, supabase, value]);

  const loadCatalog = useCallback(async (id: string) => {
    if (!id) {
      setProducts([]);
      setDeals([]);
      return;
    }
    setLoadingList(true);
    const [prodRes, dealRes] = await Promise.all([
      fetchProductsByShopId(id),
      fetchDealsByShopId(id),
    ]);
    setProducts(prodRes.success ? prodRes.data : []);
    setDeals(dealRes.success ? dealRes.data : []);
    setLoadingList(false);
  }, []);

  useEffect(() => {
    if (kind === "product" || kind === "deal" || (kind === "shop" && allowAnyShop)) {
      void loadCatalog(activeShopId);
    }
  }, [kind, activeShopId, allowAnyShop, loadCatalog]);

  // Infer selected product/deal from current URL
  useEffect(() => {
    if (kind === "product" && products.length) {
      const match = products.find((p) => productHref(p) === value.trim() || `/p/${p.id}` === value.trim());
      if (match) setProductId(match.id);
    }
    if (kind === "deal" && deals.length) {
      const m = value.trim().match(/#deal-([^/?#]+)/);
      if (m?.[1]) setDealId(m[1]);
    }
  }, [kind, products, deals, value]);

  const applyKind = (next: AdLinkKind) => {
    setKind(next);
    if (next === "shop" && activeShopId) {
      onChange(shopHref(activeShopId));
    } else if (next === "page") {
      onChange("/");
    } else if (next === "custom") {
      // keep current value for free typing
    } else if (next === "product" || next === "deal") {
      onChange("");
      setProductId("");
      setDealId("");
    }
  };

  const kinds: { value: AdLinkKind; label: string }[] = allowAnyShop
    ? [
        { value: "page", label: "App page" },
        { value: "shop", label: "Shop" },
        { value: "product", label: "Product" },
        { value: "deal", label: "Deal" },
        { value: "custom", label: "Custom URL" },
      ]
    : [
        { value: "shop", label: "My store" },
        { value: "product", label: "Product" },
        { value: "deal", label: "Deal" },
        { value: "custom", label: "Custom URL" },
      ];

  return (
    <div className={`space-y-2.5 ${className}`}>
      <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
        Link opens *
      </label>
      <div className="flex flex-wrap gap-1.5">
        {kinds.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => applyKind(opt.value)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
              kind === opt.value
                ? "bg-emerald-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {kind === "page" ? (
        <div className="grid grid-cols-3 gap-2">
          {PAGE_TARGETS.map((p) => (
            <button
              key={p.href}
              type="button"
              onClick={() => onChange(p.href)}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                value.trim() === p.href
                  ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300"
                  : "border-zinc-200 text-zinc-600 hover:border-emerald-300 dark:border-zinc-700 dark:text-zinc-300"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : null}

      {allowAnyShop && (kind === "shop" || kind === "product" || kind === "deal") ? (
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-zinc-500">Shop</label>
          <select
            value={activeShopId}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedShopId(id);
              setProductId("");
              setDealId("");
              if (kind === "shop" && id) onChange(shopHref(id));
              else onChange("");
            }}
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="">Select a shop…</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {!allowAnyShop && kind === "shop" && fixedShopId ? (
        <p className="rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">
          Opens <span className="font-semibold">{shopName || "your store"}</span>
          {" → "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">{shopHref(fixedShopId)}</code>
        </p>
      ) : null}

      {kind === "product" ? (
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-zinc-500">Product</label>
          <select
            value={productId}
            disabled={!activeShopId || loadingList}
            onChange={(e) => {
              const id = e.target.value;
              setProductId(id);
              const p = products.find((x) => x.id === id);
              if (p) onChange(productHref(p));
            }}
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 disabled:opacity-50"
          >
            <option value="">{loadingList ? "Loading…" : "Select a product…"}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {!loadingList && activeShopId && products.length === 0 ? (
            <p className="mt-1 text-[11px] text-zinc-400">No products in this shop yet.</p>
          ) : null}
        </div>
      ) : null}

      {kind === "deal" ? (
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-zinc-500">Deal</label>
          <select
            value={dealId}
            disabled={!activeShopId || loadingList}
            onChange={(e) => {
              const id = e.target.value;
              setDealId(id);
              if (id && activeShopId) onChange(dealHref(activeShopId, id));
            }}
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 disabled:opacity-50"
          >
            <option value="">{loadingList ? "Loading…" : "Select a deal…"}</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
                {d.is_active ? "" : " (paused)"}
              </option>
            ))}
          </select>
          {!loadingList && activeShopId && deals.length === 0 ? (
            <p className="mt-1 text-[11px] text-zinc-400">No deals in this shop yet.</p>
          ) : null}
        </div>
      ) : null}

      {kind === "custom" || kind === "page" ? null : null}

      {(kind === "custom" || value) && (
        <div>
          {kind === "custom" ? (
            <label className="mb-1 block text-[11px] font-semibold text-zinc-500">
              Custom path or URL
            </label>
          ) : (
            <label className="mb-1 block text-[11px] font-semibold text-zinc-500">
              Resolved link
            </label>
          )}
          <input
            type="text"
            required
            value={value}
            onChange={(e) => {
              if (kind !== "custom") setKind("custom");
              onChange(e.target.value);
            }}
            placeholder={fixedShopId ? `/shop/${fixedShopId}` : "/shop/… or https://…"}
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <p className="mt-1 text-[11px] text-zinc-400">
            Internal paths like <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">/shop/…</code> or full https links work.
          </p>
        </div>
      )}
    </div>
  );
}
