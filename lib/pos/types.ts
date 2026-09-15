/* TrendsMart POS — types + ERP defaults */

export type PosModuleId =
  | "queue"
  | "counter"
  | "kitchen"
  | "stock"
  | "cash"
  | "reports"
  | "customers"
  | "expenses"
  | "credit"
  | "recipes";

export type PosCategoryPack =
  | "general"
  | "grocery"
  | "fashion"
  | "food"
  | "cafe"
  | "pharmacy"
  | "services"
  | "beauty"
  | "electronics"
  | "bakery"
  /** Sanitary, ceramics, pipes, hardware counter billing */
  | "hardware";

export type PosPaymentMethod =
  | "cash"
  | "card"
  | "jazzcash"
  | "easypaisa"
  | "credit"
  | "other";

export interface PosPaymentSplit {
  cash?: number;
  card?: number;
  jazzcash?: number;
  easypaisa?: number;
  credit?: number;
  other?: number;
}

export interface PosSettings {
  enabled: boolean;
  modules: PosModuleId[];
  pack: PosCategoryPack;
  receipt_footer?: string;
  low_stock_threshold: number;
  auto_complete_counter: boolean;
  barcode_enabled: boolean;
  decimal_qty: boolean;
  token_mode: boolean;
  prefer_customer_phone: boolean;
  /** Soft lock PIN for counter (plain 4–6 digits; local unlock) */
  staff_pin?: string;
  /** Play sound when online/queue ticket arrives */
  order_sound: boolean;
  /** Show kitchen module (auto for food packs) */
  kitchen_enabled: boolean;
  /** Auto-open print dialog after counter sale */
  auto_print_receipt: boolean;
  /**
   * Counter UX mode:
   * - menu = restaurant/cafe tiles + bulk add (tap products)
   * - excel = superstore/pharmacy search+Enter line grid (Noor/Med style)
   */
  counter_layout: "menu" | "excel";
  /** Refuse add/sale when tracked stock would go negative */
  block_oversell: boolean;
  /** Toast when cart add leaves item at/under low threshold */
  warn_low_on_add: boolean;
  /** Show batch / lot fields in Inventory */
  track_batch: boolean;
  /** Show expiry fields + expiring alerts in Inventory */
  track_expiry: boolean;
  /**
   * Receipt output:
   * - browser = OS print dialog (USB / paired Bluetooth via drivers)
   * - bluetooth = Web Bluetooth ESC/POS (Chrome / Android)
   * - serial = Web Serial USB cable (Chrome desktop)
   */
  print_target: "browser" | "bluetooth" | "serial";
  /** Paper width for ESC/POS (58mm ≈ 32 cols, 80mm ≈ 42 cols) */
  print_width_mm: 58 | 80;
}

export const DEFAULT_POS_SETTINGS: PosSettings = {
  enabled: false,
  modules: ["queue", "counter", "stock", "cash", "reports", "customers", "expenses", "credit"],
  pack: "general",
  receipt_footer: "Thanks for shopping with us!",
  low_stock_threshold: 5,
  auto_complete_counter: true,
  barcode_enabled: false,
  decimal_qty: false,
  token_mode: false,
  prefer_customer_phone: false,
  staff_pin: "",
  order_sound: true,
  kitchen_enabled: false,
  auto_print_receipt: true,
  counter_layout: "excel",
  /** Soft default: sell past stock with warning toast; qty may go negative */
  block_oversell: false,
  warn_low_on_add: true,
  track_batch: false,
  track_expiry: false,
  print_target: "browser",
  print_width_mm: 80,
};

export const POS_MODULE_META: Record<
  PosModuleId,
  { label: string; blurb: string; icon: string }
> = {
  queue: {
    label: "Orders",
    blurb: "Online & WhatsApp orders waiting",
    icon: "📋",
  },
  counter: {
    label: "Bill / Counter",
    blurb: "Search item → take payment → print bill",
    icon: "🧾",
  },
  kitchen: {
    label: "Kitchen",
    blurb: "Cook tickets for dine-in / food orders",
    icon: "👨‍🍳",
  },
  stock: {
    label: "Stock",
    blurb: "Product details + count stock in shop",
    icon: "📦",
  },
  cash: {
    label: "Cash drawer",
    blurb: "Open morning float → close night count",
    icon: "💵",
  },
  reports: {
    label: "Reports",
    blurb: "Sales, print & download history",
    icon: "📊",
  },
  customers: {
    label: "Customers",
    blurb: "Save phone book for quick billing",
    icon: "👥",
  },
  expenses: {
    label: "Expenses",
    blurb: "Rent, bills, shop costs",
    icon: "📉",
  },
  credit: {
    label: "Udhaar",
    blurb: "Give credit · collect · balances",
    icon: "💳",
  },
  recipes: {
    label: "Recipes",
    blurb: "Ingredients → finished item stock",
    icon: "🧪",
  },
};

export interface PosCartLine {
  key: string;
  productId: string;
  /** Base catalog unit price (before tier reprice) */
  basePrice: number;
  name: string;
  unitPrice: number;
  originalPrice?: number;
  qty: number;
  variant?: string;
  notes?: string;
  /** Non-catalog misc line */
  custom?: boolean;
  /** Cashier overrode unit price — skip tier reprice + honor on server */
  priceLocked?: boolean;
}

export interface PosHeldBill {
  id: string;
  label: string;
  cart: PosCartLine[];
  custName: string;
  custPhone: string;
  discount: string;
  billNotes: string;
  pay: PosPaymentMethod;
  orderType: "pickup" | "delivery";
  token: string;
  savedAt: string;
  split?: PosPaymentSplit;
}

export interface PosCashSession {
  id: string;
  shop_id: string;
  status: "open" | "closed";
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  notes: string;
  cashier_label: string;
  opened_at: string;
  closed_at: string | null;
}

export interface PosCustomer {
  id: string;
  shop_id: string;
  name: string;
  phone: string;
  notes?: string;
  visit_count: number;
  last_order_at?: string | null;
  /** Outstanding udhaar (customer owes shop) */
  credit_balance?: number;
}

export interface PosExpense {
  id: string;
  shop_id: string;
  title: string;
  amount: number;
  category: string;
  notes?: string;
  spent_at: string;
  created_at?: string;
}

export interface PosRecipeIngredient {
  product_id: string;
  qty: number;
  name?: string;
}

export interface PosRecipe {
  id: string;
  shop_id: string;
  product_id: string;
  ingredients: PosRecipeIngredient[];
  notes?: string;
  updated_at?: string;
}

export interface PosOfflineSale {
  id: string;
  payload: Record<string, unknown>;
  createdAt: string;
}
