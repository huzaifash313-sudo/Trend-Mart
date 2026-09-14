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
  | "bakery";

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
    blurb: "WhatsApp + online + counter tickets",
    icon: "📋",
  },
  counter: {
    label: "Counter",
    blurb: "Billing, barcode, split pay, print",
    icon: "🧾",
  },
  kitchen: {
    label: "Kitchen",
    blurb: "Dine-in KOT board wired into POS",
    icon: "👨‍🍳",
  },
  stock: {
    label: "Inventory",
    blurb: "Catalog setup · stock · barcodes",
    icon: "📦",
  },
  cash: {
    label: "Cash",
    blurb: "Open drawer · day close · variance",
    icon: "💵",
  },
  reports: {
    label: "Reports",
    blurb: "Today + date range sales mix",
    icon: "📊",
  },
  customers: {
    label: "Customers",
    blurb: "Walk-in phone book / quick pick",
    icon: "👥",
  },
  expenses: {
    label: "Expenses",
    blurb: "Shop costs · rent · utilities",
    icon: "📉",
  },
  credit: {
    label: "Credit",
    blurb: "Udhaar give · collect · balances",
    icon: "💳",
  },
  recipes: {
    label: "Recipes",
    blurb: "Raw → finished BOM / stock deduct",
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

/** Apply pack defaults onto settings (merchant can still override). */
export function applyPackDefaults(
  pack: PosCategoryPack,
  current: PosSettings,
): PosSettings {
  const next = { ...current, pack };
  const ensure = (mods: PosModuleId[]) => {
    const set = new Set([...current.modules, ...mods]);
    return [...set] as PosModuleId[];
  };
  const core = [
    "queue",
    "counter",
    "stock",
    "cash",
    "reports",
    "customers",
    "expenses",
    "credit",
  ] as PosModuleId[];
  const foodish = [...core, "kitchen", "recipes"] as PosModuleId[];

  // Soft stock + optional barcode/expiry/batch everywhere (merchant can turn on).
  switch (pack) {
    case "grocery":
      return {
        ...next,
        barcode_enabled: false,
        decimal_qty: true,
        token_mode: false,
        prefer_customer_phone: false,
        kitchen_enabled: false,
        counter_layout: "excel",
        block_oversell: false,
        warn_low_on_add: true,
        track_batch: false,
        track_expiry: false,
        low_stock_threshold: 10,
        modules: ensure(core),
      };
    case "pharmacy":
      return {
        ...next,
        barcode_enabled: false,
        decimal_qty: false,
        token_mode: false,
        prefer_customer_phone: false,
        kitchen_enabled: false,
        counter_layout: "excel",
        block_oversell: false,
        warn_low_on_add: true,
        track_batch: false,
        track_expiry: false,
        low_stock_threshold: 8,
        modules: ensure(core),
      };
    case "food":
      return {
        ...next,
        barcode_enabled: false,
        decimal_qty: false,
        token_mode: true,
        prefer_customer_phone: false,
        kitchen_enabled: true,
        counter_layout: "menu",
        block_oversell: false,
        warn_low_on_add: true,
        track_batch: false,
        track_expiry: false,
        low_stock_threshold: 5,
        modules: ensure(foodish),
      };
    case "cafe":
      return {
        ...next,
        barcode_enabled: false,
        decimal_qty: false,
        token_mode: true,
        prefer_customer_phone: false,
        kitchen_enabled: true,
        counter_layout: "menu",
        block_oversell: false,
        warn_low_on_add: true,
        track_batch: false,
        track_expiry: false,
        low_stock_threshold: 5,
        modules: ensure(foodish),
      };
    case "bakery":
      return {
        ...next,
        barcode_enabled: false,
        decimal_qty: true,
        token_mode: true,
        prefer_customer_phone: false,
        kitchen_enabled: true,
        counter_layout: "excel",
        block_oversell: false,
        warn_low_on_add: true,
        track_batch: false,
        track_expiry: false,
        low_stock_threshold: 8,
        modules: ensure(foodish),
      };
    case "fashion":
      return {
        ...next,
        barcode_enabled: false,
        decimal_qty: false,
        token_mode: false,
        prefer_customer_phone: false,
        kitchen_enabled: false,
        counter_layout: "excel",
        block_oversell: false,
        warn_low_on_add: true,
        track_batch: false,
        track_expiry: false,
        low_stock_threshold: 3,
        modules: ensure(core),
      };
    case "beauty":
      return {
        ...next,
        barcode_enabled: false,
        decimal_qty: false,
        token_mode: false,
        prefer_customer_phone: false,
        kitchen_enabled: false,
        counter_layout: "excel",
        block_oversell: false,
        warn_low_on_add: true,
        track_batch: false,
        track_expiry: false,
        low_stock_threshold: 4,
        modules: ensure(core),
      };
    case "electronics":
      return {
        ...next,
        barcode_enabled: false,
        decimal_qty: false,
        token_mode: false,
        prefer_customer_phone: false,
        kitchen_enabled: false,
        counter_layout: "excel",
        block_oversell: false,
        warn_low_on_add: true,
        track_batch: false,
        track_expiry: false,
        low_stock_threshold: 2,
        modules: ensure(core),
      };
    case "services":
      return {
        ...next,
        barcode_enabled: false,
        decimal_qty: false,
        token_mode: false,
        prefer_customer_phone: false,
        kitchen_enabled: false,
        counter_layout: "excel",
        block_oversell: false,
        warn_low_on_add: false,
        track_batch: false,
        track_expiry: false,
        low_stock_threshold: 0,
        modules: ensure([
          "queue",
          "counter",
          "cash",
          "reports",
          "customers",
          "expenses",
          "credit",
        ]).filter((m) => m !== "stock" && m !== "recipes"),
      };
    default:
      return {
        ...next,
        barcode_enabled: false,
        counter_layout: "excel",
        block_oversell: false,
        warn_low_on_add: true,
        track_batch: false,
        track_expiry: false,
        low_stock_threshold: 5,
        modules: ensure(core),
      };
  }
}
