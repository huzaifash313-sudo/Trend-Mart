"use client";

import { useMemo, useState } from "react";
import { getShopCategoryPrompts, getShopWelcomeExtras } from "@/lib/ai/shopCategoryPrompts";
import {
  buildContextualWelcome,
  getTrendBotPagePack,
} from "@/lib/ai/trendBotContext";
import { TREND_BOT_NAME, TREND_BOT_WELCOME_SHOP } from "@/lib/ai/trendBotBrand";
import { TrendBotLauncher } from "@/components/trendbot/TrendBotLauncher";
import { TrendBotPanel } from "@/components/trendbot/TrendBotPanel";
import { useCart } from "@/context/CartContext";

interface ChatWidgetProps {
  shopId: string;
  shopName?: string;
  shopCategory?: string | null;
}

/** Shop-scoped TrendBot — side FAB above WhatsApp float. */
export default function ChatWidget({
  shopId,
  shopName = "Shop",
  shopCategory,
}: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const shopPack = getTrendBotPagePack("shop");

  // Raise TrendBot above the CartBar when the cart is non-empty so the FAB
  // doesn't overlap the clear-cart button on the right edge of the CartBar.
  const { totalItems } = useCart();

  const prompts = useMemo(() => {
    const category = getShopCategoryPrompts(shopCategory, shopName);
    // Shop-context prompts first, then category-specific — unique list.
    const merged = [...shopPack.prompts, ...category];
    const seen = new Set<string>();
    return merged.filter((p) => {
      const key = p.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 6);
  }, [shopCategory, shopName, shopPack.prompts]);

  const welcomeText = useMemo(() => {
    const extra = getShopWelcomeExtras(shopCategory);
    const base = `${TREND_BOT_WELCOME_SHOP(shopName)}\n\n_${extra}_`;
    return buildContextualWelcome("shop", base);
  }, [shopCategory, shopName]);

  return (
    <>
      {!open ? (
        <TrendBotLauncher
          side="right"
          bottomOffset={totalItems > 0 ? "cart" : "raised"}
          shopName={shopName}
          onOpen={() => setOpen(true)}
        />
      ) : null}

      <TrendBotPanel
        role="shop"
        shopId={shopId}
        shopName={shopName}
        shopCategory={shopCategory ?? undefined}
        welcomeText={welcomeText}
        initialPrompts={prompts}
        open={open}
        onClose={() => setOpen(false)}
        subtitle={`${shopCategory ?? "Shop"} · ${TREND_BOT_NAME}`}
      />
    </>
  );
}
