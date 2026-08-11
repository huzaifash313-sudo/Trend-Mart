"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type QuickAddTab = "product" | "bulk" | "story";

interface MerchantQuickAddValue {
  open: boolean;
  tab: QuickAddTab;
  shopId: string | null;
  shopCategory: string;
  openQuickAdd: (opts: { shopId: string; shopCategory?: string; tab?: QuickAddTab }) => void;
  closeQuickAdd: () => void;
  setTab: (tab: QuickAddTab) => void;
}

const MerchantQuickAddContext = createContext<MerchantQuickAddValue | null>(null);

export function useMerchantQuickAdd(): MerchantQuickAddValue {
  const ctx = useContext(MerchantQuickAddContext);
  if (!ctx) throw new Error("useMerchantQuickAdd must be used inside MerchantQuickAddProvider");
  return ctx;
}

export function MerchantQuickAddProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<QuickAddTab>("product");
  const [shopId, setShopId] = useState<string | null>(null);
  const [shopCategory, setShopCategory] = useState("Grocery & Kiryana");

  const openQuickAdd = useCallback(
    (opts: { shopId: string; shopCategory?: string; tab?: QuickAddTab }) => {
      setShopId(opts.shopId);
      if (opts.shopCategory) setShopCategory(opts.shopCategory);
      setTab(opts.tab ?? "product");
      setOpen(true);
    },
    [],
  );

  const closeQuickAdd = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ open, tab, shopId, shopCategory, openQuickAdd, closeQuickAdd, setTab }),
    [open, tab, shopId, shopCategory, openQuickAdd, closeQuickAdd],
  );

  return (
    <MerchantQuickAddContext.Provider value={value}>{children}</MerchantQuickAddContext.Provider>
  );
}
