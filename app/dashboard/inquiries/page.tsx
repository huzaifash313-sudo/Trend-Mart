"use client";

import { Suspense, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchMyShop } from "@/services/shopService";
import ChatInbox from "@/components/chat/ChatInbox";
import { useToast } from "@/components/Toast";

function MerchantMessagesContent() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [shopId, setShopId] = useState("");
  const [shopName, setShopName] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          window.location.replace("/login?redirect=/dashboard/inquiries");
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
        if (!cancelled) addToast("Could not load messages.", "error");
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

  return (
    <ChatInbox
      role="merchant"
      shopId={shopId}
      backHref="/dashboard"
      backLabel="← Dashboard"
      pageTitle={`Messages — ${shopName || "Your store"}`}
      pageSubtitle="Chat with customers in real time. Orders stay in Order Desk — WhatsApp checkout is unchanged."
      emptyHint="When customers message your shop or you message them from an order, chats appear here."
    />
  );
}

export default function MerchantMessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
      }
    >
      <MerchantMessagesContent />
    </Suspense>
  );
}
