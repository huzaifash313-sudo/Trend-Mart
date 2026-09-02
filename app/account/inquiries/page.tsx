"use client";

import { Suspense, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ChatInbox from "@/components/chat/ChatInbox";

function CustomerMessagesContent() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.replace("/login?redirect=/account/inquiries");
        return;
      }
      if (!cancelled) {
        setUserId(data.session.user.id);
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

  return (
    <ChatInbox
      role="customer"
      userId={userId ?? undefined}
      backHref="/account"
      backLabel="← Account"
      pageTitle="My Chats"
      pageSubtitle="Message shops directly in the app — replies arrive instantly."
      emptyHint="Open any shop and tap Message seller to start a chat."
    />
  );
}

export default function CustomerMessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
      }
    >
      <CustomerMessagesContent />
    </Suspense>
  );
}
