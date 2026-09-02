"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AiAssistantChat from "@/components/ai/AiAssistantChat";

export default function CustomerAssistantPage() {
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.replace("/login?redirect=/account/assistant");
        return;
      }
      if (!cancelled) {
        setReady(true);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (!ready) return null;

  return (
    <AiAssistantChat
      role="customer"
      title="TrendBot"
      subtitle="Personal orders, deals & tracking — signed in."
      accentClass="from-violet-600 to-indigo-600"
      backHref="/account"
      backLabel="← Account"
    />
  );
}
