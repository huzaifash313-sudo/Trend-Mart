"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchMyShop } from "@/services/shopService";
import AiAssistantChat from "@/components/ai/AiAssistantChat";
import { useToast } from "@/components/Toast";

export default function MerchantAssistantPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [shopId, setShopId] = useState("");
  const [shopName, setShopName] = useState("Your Store");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          window.location.replace("/login?redirect=/dashboard/assistant");
          return;
        }
        const shopResult = await fetchMyShop();
        if (!shopResult.success || !shopResult.data) {
          if (!cancelled) {
            addToast("Register a store first.", "info");
            window.location.replace("/account/become-merchant");
          }
          return;
        }
        if (!cancelled) {
          setShopId(shopResult.data.id);
          setShopName(shopResult.data.name);
        }
      } catch {
        if (!cancelled) addToast("Could not load AI coach.", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [addToast]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (!shopId) return null;

  return (
    <AiAssistantChat
      role="merchant"
      shopId={shopId}
      title={`TrendBot Coach — ${shopName}`}
      subtitle="Live analytics, growth strategy, revenue & stock — from your real store data."
      accentClass="from-emerald-600 to-teal-600"
      backHref="/dashboard"
      backLabel="← Dashboard"
    />
  );
}
