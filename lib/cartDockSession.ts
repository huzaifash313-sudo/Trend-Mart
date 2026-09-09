/* -------------------------------------------------------------------------- */
/*  Session-only cart dock (floating bar + nav badge)                          */
/*                                                                             */
/*  Cart contents persist in localStorage (+ DB when signed in). The floating  */
/*  CartBar / navbar badge only show while this browser tab session is active  */
/*  and the shopper has touched the cart. After close/reopen, items remain on  */
/*  /cart — the dock stays hidden until they add something again.              */
/* -------------------------------------------------------------------------- */

const DOCK_KEY = "tm_cart_dock_active";

export function isCartDockActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(DOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function activateCartDock(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(DOCK_KEY, "1");
    window.dispatchEvent(new CustomEvent("tm:cart-dock"));
  } catch {
    /* ignore */
  }
}

export function deactivateCartDock(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(DOCK_KEY);
    window.dispatchEvent(new CustomEvent("tm:cart-dock"));
  } catch {
    /* ignore */
  }
}
