"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Global Application Context & State Management                  */
/*                                                                             */
/*  Provides:                                                                  */
/*   - Cart state (items, quantities, optimistic updates with rollback)        */
/*   - Wishlist state (favorited shop IDs, optimistic toggle)                  */
/*   - Active shop filters (category, location, search query)                  */
/*   - Notification badges (cart count, wishlist count)                        */
/*   - Toast notifications                                                     */
/*                                                                             */
/*  Architecture:                                                              */
/*   - Context + useReducer for predictable state transitions                  */
/*   - Optimistic updates: UI updates instantly, syncs in background           */
/*   - Automatic error rollback on sync failure                                */
/*   - localStorage persistence for cart/wishlist across sessions              */
/* -------------------------------------------------------------------------- */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { Product, ShopCategory } from "@/types";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CartItem {
  productId: string;
  shopId: string;
  name: string;
  price: number;
  imageUrl: string;
  quantity: number;
  /** Selected variant label (e.g. "Size: M", "Color: Red") */
  variant?: string;
  /** Maximum available stock (used for inventory validation on checkout) */
  maxStock?: number;
}

export interface ShopFilter {
  category: ShopCategory;
  location: string;
  searchQuery: string;
}

export interface AppState {
  /** Cart items keyed by `${productId}-${variant}` for unique identification. */
  cart: CartItem[];
  /** Set of favorited shop IDs. */
  wishlist: Set<string>;
  /** Active shop discovery filters. */
  filters: ShopFilter;
  /** Live notification badge counts. */
  notifications: {
    cartCount: number;
    wishlistCount: number;
    unreadInquiries: number;
  };
  /** Whether state has been hydrated from localStorage. */
  hydrated: boolean;
  /** Pending optimistic operations that haven't been confirmed yet. */
  pendingOps: Set<string>;
}

// ─── Actions ────────────────────────────────────────────────────────────────

type AppAction =
  | { type: "HYDRATE"; payload: AppState }
  | { type: "ADD_TO_CART"; payload: CartItem }
  | { type: "REMOVE_FROM_CART"; payload: { productId: string; variant?: string } }
  | { type: "UPDATE_CART_QUANTITY"; payload: { productId: string; variant?: string; quantity: number } }
  | { type: "CLEAR_CART" }
  | { type: "TOGGLE_WISHLIST"; payload: string }
  | { type: "SET_FILTERS"; payload: Partial<ShopFilter> }
  | { type: "RESET_FILTERS" }
  | { type: "SET_UNREAD_INQUIRIES"; payload: number }
  | { type: "ROLLBACK_CART"; payload: CartItem[] };

// ─── Reducer ────────────────────────────────────────────────────────────────

function cartItemKey(productId: string, variant?: string): string {
  return `${productId}${variant ? `::${variant}` : ""}`;
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "HYDRATE": {
      return { ...action.payload, hydrated: true };
    }

    case "ADD_TO_CART": {
      const key = cartItemKey(action.payload.productId, action.payload.variant);
      const existingIdx = state.cart.findIndex(
        (item) => cartItemKey(item.productId, item.variant) === key,
      );
      let newCart: CartItem[];

      if (existingIdx >= 0) {
        newCart = [...state.cart];
        newCart[existingIdx] = {
          ...newCart[existingIdx],
          quantity: newCart[existingIdx].quantity + action.payload.quantity,
        };
      } else {
        newCart = [...state.cart, action.payload];
      }

      return {
        ...state,
        cart: newCart,
        notifications: { ...state.notifications, cartCount: newCart.reduce((sum, i) => sum + i.quantity, 0) },
      };
    }

    case "REMOVE_FROM_CART": {
      const key = cartItemKey(action.payload.productId, action.payload.variant);
      const newCart = state.cart.filter(
        (item) => cartItemKey(item.productId, item.variant) !== key,
      );
      return {
        ...state,
        cart: newCart,
        notifications: { ...state.notifications, cartCount: newCart.reduce((sum, i) => sum + i.quantity, 0) },
      };
    }

    case "UPDATE_CART_QUANTITY": {
      const key = cartItemKey(action.payload.productId, action.payload.variant);
      const newCart = state.cart
        .map((item) => {
          if (cartItemKey(item.productId, item.variant) === key) {
            const qty = Math.max(0, action.payload.quantity);
            return { ...item, quantity: qty };
          }
          return item;
        })
        .filter((item) => item.quantity > 0);

      return {
        ...state,
        cart: newCart,
        notifications: { ...state.notifications, cartCount: newCart.reduce((sum, i) => sum + i.quantity, 0) },
      };
    }

    case "CLEAR_CART": {
      return {
        ...state,
        cart: [],
        notifications: { ...state.notifications, cartCount: 0 },
      };
    }

    case "TOGGLE_WISHLIST": {
      const newWishlist = new Set(state.wishlist);
      if (newWishlist.has(action.payload)) {
        newWishlist.delete(action.payload);
      } else {
        newWishlist.add(action.payload);
      }
      return {
        ...state,
        wishlist: newWishlist,
        notifications: { ...state.notifications, wishlistCount: newWishlist.size },
      };
    }

    case "SET_FILTERS": {
      return {
        ...state,
        filters: { ...state.filters, ...action.payload },
      };
    }

    case "RESET_FILTERS": {
      return {
        ...state,
        filters: DEFAULT_FILTERS,
      };
    }

    case "SET_UNREAD_INQUIRIES": {
      return {
        ...state,
        notifications: { ...state.notifications, unreadInquiries: action.payload },
      };
    }

    case "ROLLBACK_CART": {
      return {
        ...state,
        cart: action.payload,
        notifications: {
          ...state.notifications,
          cartCount: action.payload.reduce((sum, i) => sum + i.quantity, 0),
        },
      };
    }

    default:
      return state;
  }
}

// ─── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_FILTERS: ShopFilter = {
  category: "All",
  location: "",
  searchQuery: "",
};

const DEFAULT_STATE: AppState = {
  cart: [],
  wishlist: new Set<string>(),
  filters: DEFAULT_FILTERS,
  notifications: {
    cartCount: 0,
    wishlistCount: 0,
    unreadInquiries: 0,
  },
  hydrated: false,
  pendingOps: new Set(),
};

// ─── Context ────────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  /** Add item to cart with optimistic update and background sync. */
  addToCart: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
  /** Remove item from cart. */
  removeFromCart: (productId: string, variant?: string) => void;
  /** Update item quantity (0 = remove). */
  updateCartQuantity: (productId: string, quantity: number, variant?: string) => void;
  /** Clear the entire cart (e.g., after successful checkout). */
  clearCart: () => void;
  /** Toggle a shop in/out of the wishlist. */
  toggleWishlist: (shopId: string) => Promise<void>;
  /** Check if a shop is in the wishlist. */
  isWishlisted: (shopId: string) => boolean;
  /** Update shop filters. */
  setFilters: (filters: Partial<ShopFilter>) => void;
  /** Reset all filters to defaults. */
  resetFilters: () => void;
  /** Set unread inquiry count for notification badge. */
  setUnreadInquiries: (count: number) => void;
  /** Get cart items grouped by shop (for checkout flow). */
  getCartByShop: () => Map<string, CartItem[]>;
  /** Get total cart item count. */
  getCartTotal: () => number;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

// ─── LocalStorage Keys ──────────────────────────────────────────────────────

const STORAGE_KEY_CART = "trendmart_cart";
const STORAGE_KEY_WISHLIST = "trendmart_wishlist";

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadCartFromStorage(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CART);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCartToStorage(cart: CartItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_CART, JSON.stringify(cart));
  } catch {
    // Storage full or unavailable — silently degrade
  }
}

function loadWishlistFromStorage(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_WISHLIST);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveWishlistToStorage(wishlist: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_WISHLIST, JSON.stringify([...wishlist]));
  } catch {
    // Storage full — silently degrade
  }
}

// ─── Provider ───────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, DEFAULT_STATE);
  const hydratingRef = useRef(false);
  const supabase = useMemo(() => createClient(), []);

  // ── Hydrate from localStorage on mount ──────────────────────────────────
  useEffect(() => {
    if (hydratingRef.current) return;
    hydratingRef.current = true;

    const savedCart = loadCartFromStorage();
    const savedWishlist = loadWishlistFromStorage();

    dispatch({
      type: "HYDRATE",
      payload: {
        ...DEFAULT_STATE,
        cart: savedCart,
        wishlist: savedWishlist,
        notifications: {
          cartCount: savedCart.reduce((sum, i) => sum + i.quantity, 0),
          wishlistCount: savedWishlist.size,
          unreadInquiries: 0,
        },
      },
    });
  }, []);

  // ── Persist cart to localStorage whenever it changes ────────────────────
  useEffect(() => {
    if (!state.hydrated) return;
    saveCartToStorage(state.cart);
  }, [state.cart, state.hydrated]);

  // ── Persist wishlist to localStorage ────────────────────────────────────
  useEffect(() => {
    if (!state.hydrated) return;
    saveWishlistToStorage(state.wishlist);
  }, [state.wishlist, state.hydrated]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const addToCart = useCallback(
    (item: Omit<CartItem, "quantity"> & { quantity?: number }) => {
      const cartItem: CartItem = {
        ...item,
        quantity: item.quantity ?? 1,
      };

      // Optimistic update — UI responds instantly
      const previousCart = state.cart;
      dispatch({ type: "ADD_TO_CART", payload: cartItem });

      // Background sync: validate stock availability against Supabase
      // In a production app, this would call the inventory API
      // and dispatch ROLLBACK_CART if the item is out of stock.
      (async () => {
        try {
          const { data: product, error } = await supabase
            .from("products")
            .select("is_available, price, name")
            .eq("id", cartItem.productId)
            .single();

          if (error || !product || !product.is_available) {
            // Item no longer available — rollback
            dispatch({ type: "ROLLBACK_CART", payload: previousCart });
            // Dispatch toast event
            window.dispatchEvent(
              new CustomEvent("trendmart:toast", {
                detail: {
                  type: "error",
                  message: `"${cartItem.name}" is no longer available.`,
                  duration: 5000,
                },
              }),
            );
          }
        } catch {
          // Network error, keep optimistic state but the user will see
          // availability issues at checkout time.
        }
      })();
    },
    [state.cart, supabase],
  );

  const removeFromCart = useCallback((productId: string, variant?: string) => {
    dispatch({ type: "REMOVE_FROM_CART", payload: { productId, variant } });
  }, []);

  const updateCartQuantity = useCallback(
    (productId: string, quantity: number, variant?: string) => {
      dispatch({
        type: "UPDATE_CART_QUANTITY",
        payload: { productId, variant, quantity },
      });
    },
    [],
  );

  const clearCart = useCallback(() => {
    dispatch({ type: "CLEAR_CART" });
  }, []);

  const toggleWishlist = useCallback(
    async (shopId: string) => {
      // Optimistic toggle — UI updates instantly
      dispatch({ type: "TOGGLE_WISHLIST", payload: shopId });

      // Background sync with wishlistService
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { toggleFavorite } = await import("@/services/wishlistService");
          const isNowFavorited = !state.wishlist.has(shopId);
          /* Note: The wishlist service uses localStorage-based favorites
             that sync to Supabase when available. This provides the
             optimistic UI toggle while persisting in the background. */
          toggleFavorite(shopId, "shop", "");
        }
      } catch {
        // Sync failed — rollback
        dispatch({ type: "TOGGLE_WISHLIST", payload: shopId });
        window.dispatchEvent(
          new CustomEvent("trendmart:toast", {
            detail: {
              type: "error",
              message: "Failed to sync wishlist. Please try again.",
              duration: 4000,
            },
          }),
        );
      }
    },
    [state.wishlist, supabase],
  );

  const isWishlisted = useCallback(
    (shopId: string) => state.wishlist.has(shopId),
    [state.wishlist],
  );

  const setFilters = useCallback((filters: Partial<ShopFilter>) => {
    dispatch({ type: "SET_FILTERS", payload: filters });
  }, []);

  const resetFilters = useCallback(() => {
    dispatch({ type: "RESET_FILTERS" });
  }, []);

  const setUnreadInquiries = useCallback((count: number) => {
    dispatch({ type: "SET_UNREAD_INQUIRIES", payload: count });
  }, []);

  const getCartByShop = useCallback((): Map<string, CartItem[]> => {
    const grouped = new Map<string, CartItem[]>();
    for (const item of state.cart) {
      const existing = grouped.get(item.shopId) ?? [];
      existing.push(item);
      grouped.set(item.shopId, existing);
    }
    return grouped;
  }, [state.cart]);

  const getCartTotal = useCallback((): number => {
    return state.cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [state.cart]);

  // ── Memoized context value ──────────────────────────────────────────────
  const value = useMemo<AppContextValue>(
    () => ({
      state,
      addToCart,
      removeFromCart,
      updateCartQuantity,
      clearCart,
      toggleWishlist,
      isWishlisted,
      setFilters,
      resetFilters,
      setUnreadInquiries,
      getCartByShop,
      getCartTotal,
    }),
    [
      state,
      addToCart,
      removeFromCart,
      updateCartQuantity,
      clearCart,
      toggleWishlist,
      isWishlisted,
      setFilters,
      resetFilters,
      setUnreadInquiries,
      getCartByShop,
      getCartTotal,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useAppContext must be used inside <AppProvider>");
  }
  return ctx;
}

/**
 * Convenience hook for cart-specific operations.
 */
export function useCart() {
  const { state, addToCart, removeFromCart, updateCartQuantity, clearCart, getCartByShop, getCartTotal } =
    useAppContext();

  return {
    cart: state.cart,
    cartCount: state.notifications.cartCount,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    getCartByShop,
    getCartTotal,
  };
}

/**
 * Convenience hook for wishlist-specific operations.
 */
export function useWishlist() {
  const { state, toggleWishlist, isWishlisted } = useAppContext();

  return {
    wishlist: state.wishlist,
    wishlistCount: state.notifications.wishlistCount,
    toggleWishlist,
    isWishlisted,
  };
}

/**
 * Convenience hook for filter-specific operations.
 */
export function useShopFilters() {
  const { state, setFilters, resetFilters } = useAppContext();

  return {
    filters: state.filters,
    setFilters,
    resetFilters,
  };
}