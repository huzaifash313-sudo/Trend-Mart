"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { createClient } from "@/lib/supabase/client";
import {
  subscribeToCustomerOrders,
  type OrderPayload,
} from "@/lib/supabase/realtime";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { fetchMyReviews, submitReview } from "@/services/reviewService";

/* -------------------------------------------------------------------------- */
/*  Star selector                                                              */
/* -------------------------------------------------------------------------- */

function StarPath() {
  return (
    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
  );
}

function Stars({
  rating,
  onChange,
}: {
  rating: number;
  onChange: (rating: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const display = hover || rating;
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Star rating">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = display >= star;
        return (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            className="cursor-pointer rounded-sm p-0.5 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
            aria-label={`${star} star${star !== 1 ? "s" : ""}`}
          >
            <svg
              className={`h-8 w-8 ${filled ? "text-amber-400" : "text-zinc-300 dark:text-zinc-600"}`}
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <StarPath />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Popup                                                                      */
/* -------------------------------------------------------------------------- */

interface ReviewTarget {
  id: string;
  name: string;
  /** Delivered order that triggered this prompt — dismissal is per order, so a
   *  new order from the same shop later will show the popup again. */
  orderId?: string;
}

/** Dismissed orders (per ORDER, per ACCOUNT — never per device). Cross kiya →
 *  woh order usi account ko dobara nahi dikhega, lekin usi dukaan ka naya
 *  order (naya orderId) phir popup laayega. Kisi doosre account ke orders ko
 *  yeh list kabhi block nahi karti, kyunki key account-scoped hai. */
const DISMISS_KEY_PREFIX = "tm_review_dismissed_orders_v1";
const MAX_DISMISSED = 300;

function reviewDismissKey(userId: string): string {
  return `${DISMISS_KEY_PREFIX}:${userId || "guest"}`;
}

function getDismissedOrders(userId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(reviewDismissKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function markOrderDismissed(userId: string, orderId: string): void {
  if (typeof window === "undefined" || !orderId) return;
  try {
    const list = getDismissedOrders(userId);
    if (!list.includes(orderId)) {
      // Keep the list bounded — old dismissals fall off naturally.
      localStorage.setItem(reviewDismissKey(userId), JSON.stringify([...list, orderId].slice(-MAX_DISMISSED)));
    }
  } catch {
    // Storage full or disabled — dismissal simply won't persist.
  }
}

function isOrderDismissed(userId: string, orderId: string): boolean {
  if (!orderId) return false;
  return getDismissedOrders(userId).includes(orderId);
}

export default function ReviewReminderPopup() {
  const { addToast } = useToast();
  const [target, setTarget] = useState<ReviewTarget | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const autoShownRef = useRef(false);
  const checkBusyRef = useRef(false);
  /** Which account is signed in on this device right now. Review prompts are
   *  strictly scoped to the account that placed the order — on a shared device
   *  with multiple accounts, only the ordering account may be prompted. */
  const currentUserIdRef = useRef<string>("");
  /** Orders the popup already surfaced this session — never re-show the same
   *  order twice in one session, but new orders always get their chance. */
  const shownOrderIdsRef = useRef<Set<string>>(new Set());

  const openFor = useCallback((shop: ReviewTarget) => {
    if (shop.orderId && shownOrderIdsRef.current.has(shop.orderId)) return;
    if (shop.orderId) shownOrderIdsRef.current.add(shop.orderId);
    setRating(0);
    setComment("");
    setTarget(shop);
  }, []);

  /** Look for a delivered-but-unreviewed order that wasn't dismissed yet and
   *  surface it. Shared by the initial/visibility check AND the realtime
   *  "order flips to Delivered while the app is open" path. */
  const checkForReviewable = useCallback(async () => {
    if (checkBusyRef.current) return;

    const supabase = createClient();
    let session;
    try {
      const {
        data: { session: s },
      } = await supabase.auth.getSession();
      session = s;
    } catch {
      return;
    }
    if (!session?.user) return;
    currentUserIdRef.current = session.user.id;

    checkBusyRef.current = true;
    try {
      const result = await fetchMyReviews();
      if (result.success) {
        const shop = result.data.reviewableShops.find(
          (s) => !s.orderId || !isOrderDismissed(session.user.id, s.orderId),
        );
        if (shop) openFor({ id: shop.id, name: shop.name, orderId: shop.orderId });
      }
    } finally {
      checkBusyRef.current = false;
    }
  }, [openFor]);

  /** Once per session on mount / tab-return. */
  const maybeAutoOpen = useCallback(async () => {
    if (autoShownRef.current) return;
    autoShownRef.current = true;
    await checkForReviewable();
  }, [checkForReviewable]);

  useEffect(() => {
    void maybeAutoOpen();

    const onVisible = () => {
      if (document.visibilityState === "visible") void maybeAutoOpen();
    };
    document.addEventListener("visibilitychange", onVisible);

    // Realtime: an order flips to Delivered while the app is open — show the
    // review popup immediately (transitionOrderStatus dispatches this event).
    // STRICT ACCOUNT SCOPE: the event carries the ordering account's id
    // (customerUserId). Only that exact account on this device may be prompted —
    // another account logged into the same phone must never see this prompt.
    // Dismissal is per ORDER — cross kiya order skip, magar usi shop ka naya
    // order (naya orderId) popup phir laayega.
    const onOrderUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{
        newStatus?: string;
        shopId?: string;
        shopName?: string;
        orderId?: string;
        customerUserId?: string | null;
      }>).detail;
      if (!detail || detail.newStatus !== "Delivered" || !detail.shopId) return;
      // Guest orders (no linked account) are not reviewable by anyone — and an
      // event without a matching account id must never prompt this device.
      if (!detail.customerUserId || detail.customerUserId !== currentUserIdRef.current) return;
      if (detail.orderId && isOrderDismissed(currentUserIdRef.current, detail.orderId)) return;
      openFor({ id: detail.shopId, name: detail.shopName || "the shop", orderId: detail.orderId });
    };
    window.addEventListener("trendsmart:order-update", onOrderUpdate);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("trendsmart:order-update", onOrderUpdate);
    };
  }, [maybeAutoOpen, openFor]);

  // Realtime (app open on ANY page): a merchant marks one of the customer's
  // orders Delivered → re-check reviewable shops and surface the popup right
  // away, even if the customer isn't on the tracking page. Also covers a
  // mid-session sign-in, so pending delivered orders appear right after login.
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;

    const supabase = createClient();

    const setup = (userId: string) => {
      currentUserIdRef.current = userId;
      unsub?.();
      unsub = subscribeToCustomerOrders(userId, (payload) => {
        const record = (payload as RealtimePostgresChangesPayload<OrderPayload>).new;
        if (!record || !("status" in record)) return;
        if (String(record.status ?? "").toLowerCase() === "delivered") {
          void checkForReviewable();
        }
      });
    };

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session?.user) return;
      setup(session.user.id);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_IN") {
        if (session?.user) {
          setup(session.user.id);
          void checkForReviewable();
        }
      } else if (event === "SIGNED_OUT") {
        currentUserIdRef.current = "";
        unsub?.();
        unsub = undefined;
      }
    });

    return () => {
      cancelled = true;
      unsub?.();
      authListener.subscription.unsubscribe();
    };
  }, [checkForReviewable]);

  const handleSubmit = async () => {
    if (!target) return;
    if (rating < 1) {
      addToast("Please select a star rating.", "error");
      return;
    }
    setSubmitting(true);
    const result = await submitReview(target.id, "", rating, comment);
    setSubmitting(false);
    if (!result.success) {
      addToast(result.error, "error");
      return;
    }
    addToast(`Review submitted for ${target.name}.`, "success");
    setTarget(null);
  };

  const dismiss = () => {
    // Per-order, per-account dismiss: sirf yeh order is account ke liye block
    // hota hai, shop nahi. Naya order usi shop se deliver hua → popup phir aayega.
    if (target?.orderId) markOrderDismissed(currentUserIdRef.current, target.orderId);
    setTarget(null);
  };

  if (!target) return null;

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              How do you rate the shop?
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Your order from {target.name} was delivered.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          <div className="flex flex-col items-center gap-1.5">
            <Stars rating={rating} onChange={setRating} />
            {rating > 0 ? (
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                {rating === 1
                  ? "Poor"
                  : rating === 2
                    ? "Fair"
                    : rating === 3
                      ? "Good"
                      : rating === 4
                        ? "Great"
                        : "Excellent!"}
              </p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="review-reminder-comment"
              className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
            >
              Comment <span className="font-normal">(optional)</span>
            </label>
            <textarea
              id="review-reminder-comment"
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
              placeholder={`How was your experience with ${target.name}?`}
              className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-300/50 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="inline-flex w-full items-center justify-center rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-700 hover:shadow-emerald-600/40 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-zinc-900"
          >
            {submitting ? "Submitting…" : "Submit rating"}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="mt-2 w-full rounded-full py-2 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
