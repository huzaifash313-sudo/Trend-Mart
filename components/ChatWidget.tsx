"use client";

import { useMemo, useState } from "react";
import { getShopCategoryPrompts, getShopWelcomeExtras } from "@/lib/ai/shopCategoryPrompts";
import { TREND_BOT_NAME, TREND_BOT_WELCOME_SHOP } from "@/lib/ai/trendBotBrand";
import { TrendBotLauncher } from "@/components/trendbot/TrendBotLauncher";
import { TrendBotPanel } from "@/components/trendbot/TrendBotPanel";

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

  const prompts = useMemo(
    () => getShopCategoryPrompts(shopCategory, shopName),
    [shopCategory, shopName],
  );

  const welcomeText = useMemo(() => {
    const extra = getShopWelcomeExtras(shopCategory);
    return `${TREND_BOT_WELCOME_SHOP(shopName)}\n\n_${extra}_`;
  }, [shopCategory, shopName]);

  return (
    <>
      {!open ? (
        <TrendBotLauncher
          side="right"
          bottomOffset="raised"
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
