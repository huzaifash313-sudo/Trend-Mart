/* -------------------------------------------------------------------------- */
/*  AccountScopeGuard — per-account local data isolation between accounts       */
/* -------------------------------------------------------------------------- */

import { render, act } from "@testing-library/react";
import { createClient } from "@/lib/supabase/client";
import AccountScopeGuard from "@/components/AccountScopeGuard";

type AuthCallback = (event: string, session: { user: { id: string } } | null) => void;

/** Namespaced keys — each account (and the guest) gets its own bucket. */
const CART_KEY = "trendsmart_cart";
const ORDERS_KEY = "trendsmart_orders";
const FAVORITES_KEY = "trendsmart_favorites";
const SCOPE_KEY = "trendsmart_scope_owner_v1";

const cartBucket = (uid: string | null) =>
  uid ? `${CART_KEY}:u_${uid}` : `${CART_KEY}:guest`;
const ordersBucket = (uid: string | null) =>
  uid ? `${ORDERS_KEY}:u_${uid}` : `${ORDERS_KEY}:guest`;

function seedGuestData(): void {
  localStorage.setItem(cartBucket(null), JSON.stringify({ state: { items: [{ id: "p1" }] }, version: 0 }));
  localStorage.setItem(ordersBucket(null), JSON.stringify([{ id: "guest-order", shopId: "s1" }]));
  localStorage.setItem(FAVORITES_KEY + ":guest", JSON.stringify([{ id: "f1", type: "product", name: "x", addedAt: 1 }]));
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

  it("adopts guest data into the new account's bucket on sign-in (hybrid hand-off)", () => {
    seedGuestData();

    const { fire } = renderGuard();
    fire("SIGNED_IN", { user: { id: "user-A" } });

    // The guest cart/orders/favorites moved into account A's own bucket.
    expect(localStorage.getItem(cartBucket("user-A"))).not.toBeNull();
    expect(localStorage.getItem(ordersBucket("user-A"))).not.toBeNull();
    expect(localStorage.getItem(FAVORITES_KEY + ":u_user-A")).not.toBeNull();
    // Guest bucket is drained so it can't leak to a later guest/account.
    expect(localStorage.getItem(cartBucket(null))).toBeNull();
    expect(localStorage.getItem(ordersBucket(null))).toBeNull();
    // Device is now scoped to account A.
    expect(localStorage.getItem(SCOPE_KEY)).toBe("user-A");
  });

  it("keeps each account's data in its own bucket when switching accounts", () => {
    localStorage.setItem(cartBucket("user-A"), JSON.stringify({ state: { items: [{ id: "a-item" }] }, version: 0 }));
    localStorage.setItem(SCOPE_KEY, "user-A");

    const { fire } = renderGuard();
    fire("SIGNED_IN", { user: { id: "user-B" } });

    // Account A's cart is preserved untouched (never leaked, never wiped).
    expect(localStorage.getItem(cartBucket("user-A"))).not.toBeNull();
    // Account B starts with its own (empty) bucket — no bleed from A.
    expect(localStorage.getItem(cartBucket("user-B"))).toBeNull();
    expect(localStorage.getItem(SCOPE_KEY)).toBe("user-B");
  });

  it("preserves the signed-in account's data on sign-out (restored next login)", () => {
    localStorage.setItem(cartBucket("user-A"), JSON.stringify({ state: { items: [{ id: "a-item" }] }, version: 0 }));
    localStorage.setItem(SCOPE_KEY, "user-A");

    const { fire } = renderGuard();
    fire("SIGNED_OUT", null);

    // Account A's data stays in its own bucket — nothing is wiped.
    expect(localStorage.getItem(cartBucket("user-A"))).not.toBeNull();
    // Identity marker cleared; guest scope is active.
    expect(localStorage.getItem(SCOPE_KEY)).toBeNull();
    expect(localStorage.getItem(cartBucket(null))).toBeNull();
  });

  it("does nothing on token refresh for the SAME account", () => {
    localStorage.setItem(cartBucket("user-A"), JSON.stringify({ state: { items: [{ id: "a-item" }] }, version: 0 }));
    localStorage.setItem(SCOPE_KEY, "user-A");

    const { fire } = renderGuard();
    fire("TOKEN_REFRESHED", { user: { id: "user-A" } });

    expect(localStorage.getItem(cartBucket("user-A"))).not.toBeNull();
    expect(localStorage.getItem(SCOPE_KEY)).toBe("user-A");
  });

  it("keeps 10 sequential accounts fully isolated (no cross-account bleed)", () => {
    const { fire } = renderGuard();

    const previousOrderIds: string[] = [];

    for (let n = 1; n <= 10; n++) {
      const uid = `user-${n}`;

      // Sign out of the previous account first, then sign into the next.
      if (previousOrderIds.length > 0) fire("SIGNED_OUT", null);
      fire("SIGNED_IN", { user: { id: uid } });

      // This account is scoped correctly.
      expect(localStorage.getItem(SCOPE_KEY)).toBe(uid);

      // Simulate this account placing an order into its OWN bucket.
      const orderId = `order-of-${uid}`;
      localStorage.setItem(ordersBucket(uid), JSON.stringify([{ id: orderId, shopId: "s1" }]));
      previousOrderIds.push(orderId);

      // No other account's bucket may contain this order.
      for (let m = 1; m < n; m++) {
        const raw = localStorage.getItem(ordersBucket(`user-${m}`));
        const ids = raw ? (JSON.parse(raw) as Array<{ id: string }>).map((o) => o.id) : [];
        expect(ids).not.toContain(orderId);
      }
    }
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
