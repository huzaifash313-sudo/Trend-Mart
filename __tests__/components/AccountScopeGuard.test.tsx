/* -------------------------------------------------------------------------- */
/*  AccountScopeGuard — device-local buyer data isolation between accounts      */
/* -------------------------------------------------------------------------- */

import { render, act } from "@testing-library/react";
import { createClient } from "@/lib/supabase/client";
import AccountScopeGuard from "@/components/AccountScopeGuard";

type AuthCallback = (event: string, session: { user: { id: string } } | null) => void;

const CART_KEY = "trendmart_cart";
const ORDERS_KEY = "trendmart_orders";
const LEGACY_ORDERS_KEY = "trendmart_order_history";
const FAVORITES_KEY = "trendmart_favorites";
const FAVORITES_COUNT_KEY = "trendmart_favorites_count";
const WISHLIST_SEEN_KEY = "trendmart_wishlist_seen_at";
const ACTIVE_UID_KEY = "trendmart_active_uid";

/** Seed every device-local buyer key so we can prove which ones get wiped. */
function seedBuyerData(): void {
  localStorage.setItem(CART_KEY, JSON.stringify({ state: { items: [{ id: "p1" }] }, version: 0 }));
  localStorage.setItem(ORDERS_KEY, JSON.stringify([{ id: "o1", shopId: "s1" }]));
  localStorage.setItem(LEGACY_ORDERS_KEY, JSON.stringify([{ id: "old" }]));
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([{ id: "f1", type: "product", name: "x", addedAt: 1 }]));
  localStorage.setItem(FAVORITES_COUNT_KEY, "1");
  localStorage.setItem(WISHLIST_SEEN_KEY, "123");
}

function buyerDataExists(): boolean {
  return (
    localStorage.getItem(ORDERS_KEY) !== null ||
    localStorage.getItem(FAVORITES_KEY) !== null ||
    localStorage.getItem(FAVORITES_COUNT_KEY) !== null ||
    localStorage.getItem(WISHLIST_SEEN_KEY) !== null ||
    localStorage.getItem(LEGACY_ORDERS_KEY) !== null
  );
}

/**
 * Render the guard while capturing the auth-state callback it registers, so
 * tests can drive SIGNED_IN / SIGNED_OUT transitions deterministically.
 */
function renderGuard(): { fire: AuthCallback; unsubscribe: jest.Mock } {
  let captured: AuthCallback = () => {};
  const unsubscribe = jest.fn();

  (createClient as jest.Mock).mockReturnValue({
    auth: {
      onAuthStateChange: (cb: AuthCallback) => {
        captured = cb;
        return { data: { subscription: { unsubscribe } } };
      },
    },
  });

  act(() => {
    render(<AccountScopeGuard />);
  });

  return {
    fire: (event, session) => act(() => captured(event, session)),
    unsubscribe,
  };
}

describe("AccountScopeGuard", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it("does NOT wipe buyer data when a guest signs in (hybrid cart hand-off preserved)", () => {
    seedBuyerData();

    const { fire } = renderGuard();
    fire("SIGNED_IN", { user: { id: "user-A" } });

    // Guest → first account: keep the cart/orders/wishlist they built as a guest.
    expect(localStorage.getItem(ORDERS_KEY)).not.toBeNull();
    expect(localStorage.getItem(FAVORITES_KEY)).not.toBeNull();
    expect(localStorage.getItem(CART_KEY)).not.toBeNull();
    // Device is now scoped to account A.
    expect(localStorage.getItem(ACTIVE_UID_KEY)).toBe("user-A");
  });

  it("wipes buyer data when switching to a DIFFERENT account", () => {
    seedBuyerData();
    localStorage.setItem(ACTIVE_UID_KEY, "user-A");

    const { fire } = renderGuard();
    fire("SIGNED_IN", { user: { id: "user-B" } });

    expect(buyerDataExists()).toBe(false);
    expect(localStorage.getItem(CART_KEY)).toBeNull();
    expect(localStorage.getItem(ACTIVE_UID_KEY)).toBe("user-B");
  });

  it("wipes buyer data on sign-out", () => {
    seedBuyerData();
    localStorage.setItem(ACTIVE_UID_KEY, "user-A");

    const { fire } = renderGuard();
    fire("SIGNED_OUT", null);

    expect(buyerDataExists()).toBe(false);
    expect(localStorage.getItem(CART_KEY)).toBeNull();
    // Identity marker cleared so the next login starts clean.
    expect(localStorage.getItem(ACTIVE_UID_KEY)).toBeNull();
  });

  it("does NOT wipe buyer data on token refresh for the SAME account", () => {
    seedBuyerData();
    localStorage.setItem(ACTIVE_UID_KEY, "user-A");

    const { fire } = renderGuard();
    fire("TOKEN_REFRESHED", { user: { id: "user-A" } });

    expect(localStorage.getItem(ORDERS_KEY)).not.toBeNull();
    expect(localStorage.getItem(FAVORITES_KEY)).not.toBeNull();
    expect(localStorage.getItem(ACTIVE_UID_KEY)).toBe("user-A");
  });

  it("unsubscribes from the auth listener on unmount", () => {
    let captured: AuthCallback = () => {};
    const unsubscribe = jest.fn();
    (createClient as jest.Mock).mockReturnValue({
      auth: {
        onAuthStateChange: (cb: AuthCallback) => {
          captured = cb;
          return { data: { subscription: { unsubscribe } } };
        },
      },
    });

    const { unmount } = render(<AccountScopeGuard />);
    expect(typeof captured).toBe("function");
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
