"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fetchMyShop } from "@/services/shopService";
import {
  buildPosReport,
  buildReceiptText,
  createPosSale,
  filterPosQueue,
  findProductByScanCode,
  loadHeldBills,
  loadPosSettings,
  loadPosWorkspace,
  orderSource,
  saveHeldBills,
  savePosSettings,
  updateOrderStatus,
  voidPosOrder,
  listPosCustomers,
  listPosExpenses,
  upsertPosCustomer,
  repriceLineFromProduct,
} from "@/services/posService";
import {
  loadOfflineQueue,
  enqueueOfflineSale,
  removeOfflineSale,
  saveOfflineQueue,
} from "@/lib/pos/offlineQueue";
import { applyPackDefaults } from "@/lib/pos/applyPack";
import {
  DEFAULT_POS_SETTINGS,
  POS_MODULE_META,
  type PosCartLine,
  type PosHeldBill,
  type PosModuleId,
  type PosPaymentMethod,
  type PosPaymentSplit,
  type PosSettings,
  type PosCustomer,
  type PosExpense,
} from "@/lib/pos/types";
import {
  POS_PACK_OPTIONS,
  POS_PACK_CATEGORY_COVERAGE,
  posPackHints,
  posPackLabel,
  suggestPosPack,
} from "@/lib/pos/categoryPacks";
import PosKitchenPanel from "@/components/pos/PosKitchenPanel";
import PosCashPanel from "@/components/pos/PosCashPanel";
import PosBarcodeCamera from "@/components/pos/PosBarcodeCamera";
import PosExcelCounter, {
  type PosExcelCounterHandle,
} from "@/components/pos/PosExcelCounter";
import PosBulkAddDialog from "@/components/pos/PosBulkAddDialog";
import PosSaveCustomItemsModal from "@/components/pos/PosSaveCustomItemsModal";
import PosShiftLogin from "@/components/pos/PosShiftLogin";
import PosStaffPanel from "@/components/pos/PosStaffPanel";
import PosAuditPanel from "@/components/pos/PosAuditPanel";
import { computeBillTotals } from "@/lib/pos/billMath";
import {
  cacheActiveStaff,
  endStaffShift,
  listPosStaff,
  readCachedActiveStaff,
  type ActiveStaff,
  type PosStaff,
} from "@/services/posStaffService";
import PosStockPanel from "@/components/pos/PosStockPanel";
import PosExpensesPanel from "@/components/pos/PosExpensesPanel";
import PosCreditPanel from "@/components/pos/PosCreditPanel";
import PosRecipesPanel from "@/components/pos/PosRecipesPanel";
import OrderBillModal from "@/components/OrderBillModal";
import PosReceiptModal from "@/components/pos/PosReceiptModal";
import VariantSelector, { type SelectedVariant } from "@/components/VariantSelector";
import { useToast } from "@/components/Toast";
import { formatRupees } from "@/lib/formatters";
import {
  connectBluetoothPrinter,
  connectSerialPrinter,
  disconnectThermalPrinter,
  getPrintTarget,
  isBluetoothSupported,
  isSerialSupported,
  printerConnectionLabel,
  setPrintTarget,
} from "@/lib/pos/thermalPrinter";
import { customerVariantGroups, computeVariantPricing } from "@/lib/variantPricing";
import { subscribeToOrders } from "@/lib/supabase/realtime";
import {
  transitionOrderStatus,
  getValidTransitions,
  getStatusLabel,
} from "@/services/notificationService";
import { playPosNotify } from "@/lib/pos/notifySound";
import {
  cartQtyForProduct,
  gateStockAdd,
  isExpired,
  packStockProfile,
} from "@/lib/pos/stockRules";
import type { Order, OrderStatus, Product, Shop } from "@/types";

type Tab = PosModuleId | "setup";

const ALL_MODULE_IDS = Object.keys(POS_MODULE_META) as PosModuleId[];

function startOfTodayMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDayMs(isoDate: string) {
  const d = new Date(`${isoDate}T23:59:59.999`);
  return d.getTime();
}

function toInputDate(ms: number) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lineKey(productId: string, variant?: string) {
  return `${productId}::${variant || ""}`;
}

function qtyStep(decimal: boolean) {
  return decimal ? 0.25 : 1;
}

function bumpQty(qty: number, delta: number, decimal: boolean) {
  const next = Math.round((qty + delta) * 100) / 100;
  const min = decimal ? 0.25 : 1;
  return next < min ? 0 : next;
}

function splitSum(split: PosPaymentSplit) {
  return (
    (Number(split.cash) || 0) +
    (Number(split.card) || 0) +
    (Number(split.jazzcash) || 0) +
    (Number(split.easypaisa) || 0) +
    (Number(split.credit) || 0) +
    (Number(split.other) || 0)
  );
}

function primaryPayFromSplit(split: PosPaymentSplit | null, fallback: PosPaymentMethod): PosPaymentMethod {
  if (!split) return fallback;
  const entries: [PosPaymentMethod, number][] = [
    ["cash", Number(split.cash) || 0],
    ["card", Number(split.card) || 0],
    ["jazzcash", Number(split.jazzcash) || 0],
    ["easypaisa", Number(split.easypaisa) || 0],
    ["credit", Number(split.credit) || 0],
    ["other", Number(split.other) || 0],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][1] > 0 ? entries[0][0] : fallback;
}

export default function PosApp() {
  const { addToast } = useToast();
  const [boot, setBoot] = useState(true);
  const [shop, setShop] = useState<Shop | null>(null);
  const [settings, setSettings] = useState<PosSettings>(DEFAULT_POS_SETTINGS);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [tab, setTab] = useState<Tab>("queue");
  const [online, setOnline] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  /** Configured staff for this shop — empty means "owner runs the counter". */
  const [staffList, setStaffList] = useState<PosStaff[]>([]);
  const [activeStaff, setActiveStaff] = useState<ActiveStaff | null>(null);
  const [staffReady, setStaffReady] = useState(false);
  /** Cashiers don't see reports, cost price or profit; managers and the owner do. */
  const canSeeReports = !activeStaff || activeStaff.role === "manager";

  const [query, setQuery] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [showCamera, setShowCamera] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [cart, setCart] = useState<PosCartLine[]>([]);
  const [pay, setPay] = useState<PosPaymentMethod>("cash");
  const [splitPay, setSplitPay] = useState(false);
  const [split, setSplit] = useState<PosPaymentSplit>({ cash: 0 });
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [discount, setDiscount] = useState("");
  const [discountMode, setDiscountMode] = useState<"flat" | "percent">("flat");
  const [pendingCustomSave, setPendingCustomSave] = useState<
    { name: string; price: number }[] | null
  >(null);
  const [billNotes, setBillNotes] = useState("");
  const [orderType, setOrderType] = useState<"pickup" | "delivery">("pickup");
  const [token, setToken] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("");
  const [held, setHeld] = useState<PosHeldBill[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastReceipt, setLastReceipt] = useState("");
  const [billOrder, setBillOrder] = useState<Order | null>(null);
  const [autoPrintBill, setAutoPrintBill] = useState(false);
  const [lastPrintedOrder, setLastPrintedOrder] = useState<Order | null>(null);
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [variantSel, setVariantSel] = useState<SelectedVariant[]>([]);
  const [customers, setCustomers] = useState<PosCustomer[]>([]);
  const [expenseRows, setExpenseRows] = useState<PosExpense[]>([]);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustNotes, setNewCustNotes] = useState("");
  const [reportFrom, setReportFrom] = useState(() => toInputDate(startOfTodayMs()));
  const [reportTo, setReportTo] = useState(() => toInputDate(Date.now()));
  const [offlinePending, setOfflinePending] = useState(0);
  const [cashReceived, setCashReceived] = useState("");
  const [undoLine, setUndoLine] = useState<PosCartLine | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showRecent, setShowRecent] = useState(true);
  /** Phone screens: false = product search/grid, true = bill/payment panel (both always show side-by-side at lg+). */
  const [mobileBillView, setMobileBillView] = useState(false);
  // Bill emptied (checkout / clear) → go back to the product list on phones.
  if (mobileBillView && cart.length === 0) setMobileBillView(false);
  const [miscOpen, setMiscOpen] = useState(false);
  const [miscName, setMiscName] = useState("");
  const [miscPrice, setMiscPrice] = useState("");
  const [miscQty, setMiscQty] = useState("1");
  const queuePrevLenRef = useRef(0);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const excelRef = useRef<PosExcelCounterHandle>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const cashRef = useRef<HTMLInputElement>(null);
  const checkoutRef = useRef<(() => void) | null>(null);
  const productsMap = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  /* Immersive shell: drop storefront navbar / bottom-nav / body offset. */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("tm-pos-immersive");
    return () => {
      root.classList.remove("tm-pos-immersive");
    };
  }, []);

  const refresh = useCallback(async (shopId: string) => {
    const res = await loadPosWorkspace(shopId);
    if (res.success) {
      setOrders(res.data.orders);
      setProducts(res.data.products);
    }
  }, []);

  const loadCustomers = useCallback(async (shopId: string) => {
    const res = await listPosCustomers(shopId);
    if (res.success) setCustomers(res.data);
  }, []);

  const flushOffline = useCallback(
    async (shopId: string) => {
      const queue = loadOfflineQueue(shopId);
      if (queue.length === 0) {
        setOfflinePending(0);
        return;
      }
      let remaining = [...queue];
      for (const item of queue) {
        const p = item.payload as {
          shopId?: string;
          lines?: PosCartLine[];
          customerName?: string;
          customerPhone?: string;
          paymentMethod?: PosPaymentMethod;
          paymentSplit?: PosPaymentSplit;
          discountAmount?: number;
          notes?: string;
          autoComplete?: boolean;
          orderType?: "pickup" | "delivery";
          token?: string;
          deliveryFee?: number;
        };
        if (!p.lines?.length) {
          remaining = remaining.filter((x) => x.id !== item.id);
          continue;
        }
        const res = await createPosSale({
          shopId: p.shopId || shopId,
          lines: p.lines,
          customerName: p.customerName,
          customerPhone: p.customerPhone,
          paymentMethod: p.paymentMethod || "cash",
          paymentSplit: p.paymentSplit,
          discountAmount: p.discountAmount,
          notes: p.notes,
          autoComplete: p.autoComplete,
          orderType: p.orderType,
          token: p.token,
          deliveryFee: p.deliveryFee,
        });
        if (res.success) {
          remaining = remaining.filter((x) => x.id !== item.id);
          removeOfflineSale(shopId, item.id);
        } else {
          break;
        }
      }
      saveOfflineQueue(shopId, remaining);
      setOfflinePending(remaining.length);
      if (remaining.length < queue.length) {
        addToast(`Synced ${queue.length - remaining.length} offline sale(s)`, "success");
        await refresh(shopId);
      }
    },
    [addToast, refresh],
  );

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const shopRes = await fetchMyShop();
      if (!shopRes.success || !shopRes.data) {
        if (!cancelled) {
          addToast("Register a store first to use POS.", "info");
          window.location.replace("/account/become-merchant");
        }
        return;
      }
      if (cancelled) return;
      const s = shopRes.data;
      setShop(s);
      setHeld(loadHeldBills(s.id));
      setOfflinePending(loadOfflineQueue(s.id).length);
      setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);

      const sRes = await loadPosSettings(s.id, s.category);
      if (sRes.success) {
        setSettings(sRes.data);
        if (sRes.data.print_target) setPrintTarget(sRes.data.print_target);
        const pin = (sRes.data.staff_pin || "").trim();
        setUnlocked(!pin || pin.length < 4);
        if (!sRes.data.enabled) setTab("setup");
        else setTab(sRes.data.modules[0] ?? "queue");
      } else {
        setUnlocked(true);
      }

      // Staff list decides whether a PIN shift is required at this counter.
      const staffRes = await listPosStaff(s.id);
      if (!cancelled) {
        const rows = staffRes.success ? staffRes.data.filter((r) => r.is_active) : [];
        setStaffList(rows);
        // Cached identity only avoids a lock-screen flash; the httpOnly cookie
        // set by the server is what actually authorizes anything.
        const cached = readCachedActiveStaff(s.id);
        if (cached && rows.some((r) => r.id === cached.id)) setActiveStaff(cached);
        setStaffReady(true);
      }

      await refresh(s.id);
      await loadCustomers(s.id);
      void flushOffline(s.id);

      unsub = subscribeToOrders(
        s.id,
        () => {
          void refresh(s.id);
        },
        () => {
          void refresh(s.id);
        },
      );
      if (!cancelled) setBoot(false);
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [addToast, flushOffline, loadCustomers, refresh]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      if (shop) void flushOffline(shop.id);
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [flushOffline, shop]);

  useEffect(() => {
    if (tab === "counter" && settings.barcode_enabled) {
      barcodeRef.current?.focus();
    }
  }, [tab, settings.barcode_enabled]);

  useEffect(() => {
    if (tab === "customers" && shop) void loadCustomers(shop.id);
  }, [tab, shop, loadCustomers]);

  const enabledTabs = useMemo(() => {
    if (!settings.enabled) return ["setup"] as Tab[];
    const unique = [...new Set(settings.modules)] as PosModuleId[];
    // Cashiers don't get reports (sales history, profit) or POS setup — those
    // are owner/manager surfaces. The existing effect below moves them off the
    // tab automatically if they were on one when the shift started.
    const allowed = canSeeReports
      ? [...unique, "setup"]
      : unique.filter((id) => id !== "reports");
    return allowed as Tab[];
  }, [settings.enabled, settings.modules, canSeeReports]);

  useEffect(() => {
    if (!enabledTabs.includes(tab)) {
      setTab(enabledTabs[0] ?? "setup");
    }
  }, [enabledTabs, tab]);

  const queue = useMemo(() => filterPosQueue(orders), [orders]);

  useEffect(() => {
    const prev = queuePrevLenRef.current;
    if (settings.order_sound && !boot && queue.length > prev) {
      playPosNotify();
    }
    queuePrevLenRef.current = queue.length;
  }, [queue.length, settings.order_sound, boot]);

  const reportFromMs = useMemo(() => Date.parse(`${reportFrom}T00:00:00`), [reportFrom]);
  const reportUntilMs = useMemo(() => endOfDayMs(reportTo), [reportTo]);

  useEffect(() => {
    if (tab === "reports" && shop) {
      void listPosExpenses(shop.id, {
        sinceMs: Number.isFinite(reportFromMs) ? reportFromMs : startOfTodayMs(),
        untilMs: Number.isFinite(reportUntilMs) ? reportUntilMs : undefined,
      }).then((r) => {
        if (r.success) setExpenseRows(r.data);
      });
    }
  }, [tab, shop, reportFromMs, reportUntilMs]);

  const report = useMemo(
    () =>
      buildPosReport(
        orders,
        Number.isFinite(reportFromMs) ? reportFromMs : startOfTodayMs(),
        Number.isFinite(reportUntilMs) ? reportUntilMs : undefined,
        { products, expenses: expenseRows },
      ),
    [orders, reportFromMs, reportUntilMs, products, expenseRows],
  );

  const favourites = useMemo(
    () => products.filter((p) => p.pos_favourite && p.is_available !== false).slice(0, 16),
    [products],
  );

  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    if (!shop?.id || typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(`tm_pos_recent_${shop.id}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed)) setRecentIds(parsed.slice(0, 16));
    } catch {
      /* ignore */
    }
  }, [shop?.id]);

  const recentProducts = useMemo(() => {
    const map = new Map(products.map((p) => [p.id, p]));
    const out: Product[] = [];
    for (const id of recentIds) {
      const p = map.get(id);
      if (p && p.is_available !== false) out.push(p);
      if (out.length >= 10) break;
    }
    return out;
  }, [products, recentIds]);

  function pushRecent(productId: string) {
    if (!shop?.id) return;
    setRecentIds((prev) => {
      const next = [productId, ...prev.filter((id) => id !== productId)].slice(0, 16);
      try {
        localStorage.setItem(`tm_pos_recent_${shop.id}`, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = products.filter((p) => p.is_available !== false);
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.barcode || "").toLowerCase().includes(q) ||
          (p.short_code || "").toLowerCase().includes(q),
      );
    }
    return list.slice(0, 80);
  }, [products, query]);

  const packProfile = useMemo(() => packStockProfile(settings.pack), [settings.pack]);

  const cartTotal = useMemo(() => {
    // Same helper the sales API uses (lib/pos/billMath) — the counter total and
    // the charged total are computed by one function, so they cannot drift.
    const bill = computeBillTotals({
      subtotal: cart.reduce((s, l) => s + l.unitPrice * l.qty, 0),
      discountValue: Number(discount) || 0,
      discountMode,
      taxRatePercent: settings.tax_rate || 0,
      deliveryFee: orderType === "delivery" ? Number(deliveryFee) || 0 : 0,
    });
    return { sub: bill.subtotal, discount: bill.discount, tax: bill.tax, fee: bill.fee, total: bill.total };
  }, [cart, discount, discountMode, deliveryFee, orderType, settings.tax_rate]);

  const customerQuickPick = useMemo(() => {
    const q = (custPhone || custName).trim().toLowerCase();
    if (!q) return customers.slice(0, 6);
    return customers
      .filter(
        (c) =>
          c.phone.includes(q.replace(/\D/g, "")) ||
          c.name.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [customers, custName, custPhone]);

  const cashPaidNum = Math.max(0, Number(cashReceived) || 0);
  const changeDue =
    !splitPay && pay === "cash" && cashPaidNum > 0
      ? Math.max(0, Math.round((cashPaidNum - cartTotal.total) * 100) / 100)
      : 0;

  const recentPosSales = useMemo(() => {
    return orders
      .filter((o) => orderSource(o) === "pos" && !o.voided_at)
      .slice(0, 12);
  }, [orders]);

  async function persistSettings(next: PosSettings) {
    if (!shop) return;
    setSettings(next);
    const res = await savePosSettings(shop.id, next);
    if (!res.success) addToast(res.error, "error");
    else addToast("POS settings saved", "success");
  }

  function updateCartLineQty(key: string, nextQty: number) {
    const line = cart.find((x) => x.key === key);
    if (line && !line.custom && nextQty > line.qty) {
      const product = productsMap.get(line.productId);
      if (product) {
        const otherQty = cartQtyForProduct(cart, line.productId) - line.qty;
        const gate = gateStockAdd({
          product,
          addQty: nextQty - line.qty,
          alreadyInCart: otherQty,
          settings,
        });
        if (!gate.ok) {
          addToast(gate.error, "info");
          return;
        }
        if (gate.warn) addToast(gate.warn, "info");
      }
    }
    setCart((prev) =>
      prev
        .map((x) => {
          if (x.key !== key) return x;
          const withQty = { ...x, qty: nextQty };
          if (x.custom) return withQty;
          return repriceLineFromProduct(withQty, productsMap.get(x.productId));
        })
        .filter((x) => x.qty > 0),
    );
  }

  function updateCartLinePrice(key: string, price: number) {
    setCart((prev) =>
      prev.map((x) =>
        x.key === key
          ? {
              ...x,
              unitPrice: Math.max(0, price),
              basePrice: Math.max(0, price),
              priceLocked: true,
            }
          : x,
      ),
    );
  }

  function removeCartLine(key: string) {
    const hit = cart.find((x) => x.key === key);
    if (!hit) return;
    setUndoLine(hit);
    setCart((prev) => prev.filter((x) => x.key !== key));
    addToast(`Removed ${hit.name} · Undo (Alt+Z)`, "info");
    window.setTimeout(() => excelRef.current?.focusSearch(), 40);
  }

  function removeLastCartLine() {
    if (cart.length === 0) return;
    const last = cart[cart.length - 1];
    if (last) removeCartLine(last.key);
  }

  function undoRemove() {
    if (!undoLine) return;
    setCart((prev) => {
      if (prev.some((x) => x.key === undoLine.key)) {
        return prev.map((x) =>
          x.key === undoLine.key
            ? { ...x, qty: Math.round((x.qty + undoLine.qty) * 100) / 100 }
            : x,
        );
      }
      return [...prev, undoLine];
    });
    setUndoLine(null);
    addToast(`Restored ${undoLine.name}`, "success");
  }

  function addCustomLine() {
    const name = miscName.trim() || "Custom item";
    const price = Math.max(0, Number(miscPrice) || 0);
    const qty = Math.max(
      settings.decimal_qty ? 0.25 : 1,
      Number(miscQty) || (settings.decimal_qty ? 0.25 : 1),
    );
    if (price <= 0) {
      addToast("Custom item needs a price", "info");
      return;
    }
    const key = `custom::${name.toLowerCase()}::${price}`;
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) =>
          l.key === key ? { ...l, qty: Math.round((l.qty + qty) * 100) / 100 } : l,
        );
      }
      return [
        ...prev,
        {
          key,
          productId: key,
          name,
          basePrice: price,
          unitPrice: price,
          qty,
          custom: true,
        },
      ];
    });
    setMiscName("");
    setMiscPrice("");
    setMiscQty("1");
    setMiscOpen(false);
    addToast(`+ ${name}`, "success");
    window.setTimeout(() => excelRef.current?.focusSearch(), 40);
  }

  function addLine(product: Product, variant?: string, unitPrice?: number) {
    const base = Number(product.price) || 0;
    const price = unitPrice ?? base;
    const key = lineKey(product.id, variant);
    const step = qtyStep(settings.decimal_qty);
    pushRecent(product.id);
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => {
          if (l.key !== key) return l;
          const withQty = { ...l, qty: Math.round((l.qty + step) * 100) / 100 };
          return repriceLineFromProduct(withQty, product);
        });
      }
      const line: PosCartLine = {
        key,
        productId: product.id,
        name: product.name,
        basePrice: base,
        unitPrice: price,
        originalPrice: product.original_price ?? undefined,
        qty: step,
        variant,
      };
      return [...prev, repriceLineFromProduct(line, product)];
    });
  }

  function tryAddProduct(product: Product) {
    if (isExpired(product.expiry_date) && settings.track_expiry) {
      addToast(`${product.name} is expired — restock / update expiry first`, "info");
      if (settings.block_oversell !== false) return;
    }
    if (settings.pack === "pharmacy" && settings.track_expiry) {
      if (!product.expiry_date?.trim()) {
        addToast(`${product.name}: set expiry in Stock before pharmacy sale`, "info");
        if (settings.block_oversell) return;
      }
    }
    if (settings.pack === "pharmacy" && settings.track_batch) {
      if (!product.batch_no?.trim()) {
        addToast(`${product.name}: set batch no. in Stock (pharmacy pack)`, "info");
        if (settings.block_oversell) return;
      }
    }
    const step = qtyStep(settings.decimal_qty);
    const gate = gateStockAdd({
      product,
      addQty: step,
      alreadyInCart: cartQtyForProduct(cart, product.id),
      settings,
    });
    if (!gate.ok) {
      addToast(gate.error, "info");
      return;
    }
    if (gate.warn) addToast(gate.warn, "info");

    const groups = customerVariantGroups(product.variants as never);
    if (groups.length > 0) {
      setVariantProduct(product);
      setVariantSel([]);
      return;
    }
    addLine(product);
  }

  function handleBarcodeSubmit(codeRaw?: string) {
    const code = (codeRaw ?? barcodeInput).trim();
    if (!code) return;
    const product = findProductByScanCode(products, code);
    setBarcodeInput("");
    if (!product) {
      addToast(`No product for code “${code}”`, "info");
      return;
    }
    if (product.is_available === false) {
      addToast("Product is out of stock", "info");
      return;
    }
    tryAddProduct(product);
    addToast(`Added ${product.name}`, "success");
  }

  function confirmVariant() {
    if (!variantProduct) return;
    const groups = customerVariantGroups(variantProduct.variants as never);
    if (variantSel.length < groups.length) {
      addToast("Select all options", "info");
      return;
    }
    const label = variantSel.map((s) => `${s.groupName}: ${s.optionLabel}`).join(" · ");
    const pricing = computeVariantPricing(
      Number(variantProduct.price) || 0,
      variantProduct.original_price,
      variantProduct.variants as never,
      label,
    );
    const step = qtyStep(settings.decimal_qty);
    const gate = gateStockAdd({
      product: variantProduct,
      addQty: step,
      alreadyInCart: cartQtyForProduct(cart, variantProduct.id),
      settings,
    });
    if (!gate.ok) {
      addToast(gate.error, "info");
      return;
    }
    if (gate.warn) addToast(gate.warn, "info");
    addLine(variantProduct, label, pricing.price);
    setVariantProduct(null);
    setVariantSel([]);
  }

  function clearBill() {
    setCart([]);
    setDiscount("");
    setDiscountMode("flat");
    setBillNotes("");
    setCustName("");
    setCustPhone("");
    setToken("");
    setDeliveryFee("");
    setOrderType("pickup");
    setSplitPay(false);
    setSplit({ cash: 0 });
    setPay("cash");
    setCashReceived("");
    setUndoLine(null);
  }

  function holdBill() {
    if (!shop || cart.length === 0) return;
    const bill: PosHeldBill = {
      id: `h_${Date.now()}`,
      label: custName.trim() || `Hold ${held.length + 1}`,
      cart,
      custName,
      custPhone,
      discount,
      billNotes,
      pay,
      orderType,
      token,
      savedAt: new Date().toISOString(),
      split: splitPay ? split : undefined,
    };
    const next = [bill, ...held].slice(0, 12);
    setHeld(next);
    saveHeldBills(shop.id, next);
    clearBill();
    addToast("Bill held — recall anytime", "success");
  }

  function recallBill(bill: PosHeldBill) {
    if (!shop) return;
    setCart(bill.cart);
    setCustName(bill.custName);
    setCustPhone(bill.custPhone);
    setDiscount(bill.discount);
    setBillNotes(bill.billNotes);
    setPay(bill.pay);
    setOrderType(bill.orderType);
    setToken(bill.token);
    if (bill.split) {
      setSplitPay(true);
      setSplit(bill.split);
    } else {
      setSplitPay(false);
      setSplit({ cash: 0 });
    }
    const next = held.filter((h) => h.id !== bill.id);
    setHeld(next);
    saveHeldBills(shop.id, next);
    setTab("counter");
    addToast(`Recalled “${bill.label}”`, "success");
  }

  async function checkout() {
    if (!shop || cart.length === 0) return;

    const needByProduct = new Map<string, number>();
    for (const line of cart) {
      if (line.custom) continue;
      needByProduct.set(
        line.productId,
        (needByProduct.get(line.productId) || 0) + line.qty,
      );
    }
    for (const [pid, need] of needByProduct) {
      const product = productsMap.get(pid);
      if (!product) continue;
      if (isExpired(product.expiry_date) && settings.track_expiry) {
        if (settings.block_oversell === true) {
          addToast(`${product.name} is expired — remove or update expiry`, "info");
          return;
        }
        addToast(`${product.name}: expired — selling with warning`, "info");
      }
      const gate = gateStockAdd({
        product,
        addQty: need,
        alreadyInCart: 0,
        settings,
      });
      if (!gate.ok) {
        addToast(gate.error, "info");
        return;
      }
      if (gate.warn) addToast(gate.warn, "info");
    }

    if (
      (pay === "credit" || (splitPay && (Number(split.credit) || 0) > 0)) &&
      !custPhone.replace(/\D/g, "").trim()
    ) {
      addToast("Udhaar / credit sale needs customer phone", "info");
      return;
    }

    if (!splitPay && pay === "cash" && cashPaidNum > 0 && cashPaidNum + 0.01 < cartTotal.total) {
      addToast(
        `Cash received ${formatRupees(cashPaidNum)} is less than bill ${formatRupees(cartTotal.total)}`,
        "info",
      );
      cashRef.current?.focus();
      return;
    }

    if (splitPay) {
      const sum = splitSum(split);
      if (Math.abs(sum - cartTotal.total) > 2 && sum > 0) {
        addToast(
          `Split pays ${formatRupees(sum)} vs total ${formatRupees(cartTotal.total)} — adjust amounts`,
          "info",
        );
      }
    }

    const paymentMethod = splitPay ? primaryPayFromSplit(split, pay) : pay;
    const paymentSplit = splitPay ? split : undefined;

    const salePayload = {
      shopId: shop.id,
      lines: cart,
      customerName: custName,
      customerPhone: custPhone,
      paymentMethod,
      paymentSplit,
      discountAmount: cartTotal.discount,
      taxAmount: cartTotal.tax,
      notes: billNotes,
      autoComplete: settings.auto_complete_counter && orderType === "pickup",
      orderType,
      token: settings.token_mode ? token : undefined,
      deliveryFee: orderType === "delivery" ? cartTotal.fee : 0,
    };

    setBusy(true);
    const res = await createPosSale(salePayload);
    setBusy(false);

    if (!res.success) {
      if (!navigator.onLine || /network|fetch|failed/i.test(res.error || "")) {
        enqueueOfflineSale(shop.id, salePayload as unknown as Record<string, unknown>);
        setOfflinePending(loadOfflineQueue(shop.id).length);
        const receipt = buildReceiptText({
          shopName: shop.name,
          lines: cart,
          subtotal: cartTotal.sub,
          discount: cartTotal.discount,
          tax: cartTotal.tax,
          total: cartTotal.total,
          paymentMethod,
          customerName: custName || "Walk-in",
          customerPhone: custPhone || undefined,
          token: token || undefined,
          footer: settings.receipt_footer,
          orderType,
        });
        setLastReceipt(receipt);
        clearBill();
        addToast("Offline — sale queued; will sync when online", "info");
        return;
      }
      addToast(res.error, "error");
      return;
    }

    const receipt = buildReceiptText({
      shopName: shop.name,
      lines: cart,
      subtotal: cartTotal.sub,
      discount: cartTotal.discount,
      tax: cartTotal.tax,
      total: cartTotal.total,
      paymentMethod,
      customerName: custName || "Walk-in",
      customerPhone: custPhone || undefined,
      token: token || undefined,
      footer: settings.receipt_footer,
      orderType,
      cashReceived: !splitPay && pay === "cash" ? cashPaidNum || undefined : undefined,
      changeDue: changeDue > 0 ? changeDue : undefined,
    });
    setLastReceipt(receipt);
    setAutoPrintBill(settings.auto_print_receipt !== false);
    setBillOrder(res.data);
    setLastPrintedOrder(res.data);
    addToast(
      changeDue > 0
        ? `Bill saved · change ${formatRupees(changeDue)}`
        : `Bill saved · ${formatRupees(cartTotal.total)}`,
      "success",
    );
    const customItems = Array.from(
      new Map(
        cart.filter((l) => l.custom).map((l) => [l.name, { name: l.name, price: l.unitPrice }]),
      ).values(),
    );
    if (customItems.length > 0) setPendingCustomSave(customItems);
    clearBill();
    await refresh(shop.id);
    void loadCustomers(shop.id);
    if (settings.modules.includes("queue") && orderType === "delivery") setTab("queue");
    window.setTimeout(() => excelRef.current?.focusSearch(), 80);
  }

  async function copyReceipt() {
    if (!lastReceipt) return;
    try {
      await navigator.clipboard.writeText(lastReceipt);
      addToast("Receipt copied", "success");
    } catch {
      addToast("Could not copy", "error");
    }
  }

  function shareReceiptWhatsApp() {
    if (!lastReceipt) return;
    const url = `https://wa.me/?text=${encodeURIComponent(lastReceipt)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function advanceOrder(order: Order, next: OrderStatus) {
    if (!shop) return;
    const ok = getValidTransitions(order.status).includes(next);
    if (!ok) {
      addToast("Invalid status step", "info");
      return;
    }
    try {
      const r = await transitionOrderStatus(order.id, next);
      if (!r.success) {
        addToast(r.error || "Could not update status", "error");
        return;
      }
    } catch {
      const fallback = await updateOrderStatus(order.id, next);
      if (!fallback.success) {
        addToast(fallback.error, "error");
        return;
      }
    }
    addToast(getStatusLabel(next), "success");
    await refresh(shop.id);
  }

  async function handleVoid(order: Order) {
    if (!shop) return;
    if (!window.confirm("Void this counter bill? Stock will be restored.")) return;
    const res = await voidPosOrder(shop.id, order);
    if (!res.success) {
      addToast(res.error, "error");
      return;
    }
    addToast("Bill voided", "success");
    await refresh(shop.id);
  }

  useEffect(() => {
    checkoutRef.current = () => {
      void checkout();
    };
  }, [checkout]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.altKey) {
        if (e.key === "Escape" && miscOpen) {
          setMiscOpen(false);
          return;
        }
        if (e.shiftKey && e.key === "Enter" && tab === "counter" && !splitPay && pay === "cash") {
          const t = e.target as HTMLElement | null;
          if (t && (t.tagName === "TEXTAREA" || t.isContentEditable)) return;
          e.preventDefault();
          cashRef.current?.focus();
          cashRef.current?.select();
        }
        return;
      }
      const key = e.key.toLowerCase();
      if (!["f", "s", "c", "z", "g", "r", "p", "m", "h", "b"].includes(key)) return;
      if (tab !== "counter" && key !== "h") return;
      e.preventDefault();
      if (key === "f") {
        setTab("counter");
        window.setTimeout(() => excelRef.current?.focusSearch(), 30);
      } else if (key === "s") {
        setTab("counter");
        checkoutRef.current?.();
      } else if (key === "c") {
        if (cart.length === 0 || window.confirm("Clear current bill?")) clearBill();
      } else if (key === "z") {
        undoRemove();
      } else if (key === "g") {
        discountRef.current?.focus();
        discountRef.current?.select();
      } else if (key === "r") {
        setShowRecent((v) => !v);
      } else if (key === "p") {
        const o = lastPrintedOrder || billOrder;
        if (o) {
          setAutoPrintBill(true);
          setBillOrder(o);
        }
      } else if (key === "m") {
        setTab("counter");
        setMiscOpen(true);
      } else if (key === "b") {
        if (settings.barcode_enabled) {
          setTab("counter");
          setShowCamera(true);
        }
      } else if (key === "h") {
        setShowShortcuts((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    tab,
    cart.length,
    miscOpen,
    splitPay,
    pay,
    lastPrintedOrder,
    billOrder,
    undoLine,
    settings.barcode_enabled,
  ]);

  function tryUnlock() {
    const expected = (settings.staff_pin || "").trim();
    if (pinInput.trim() === expected) {
      setUnlocked(true);
      setPinInput("");
      addToast("Cashier unlocked", "success");
    } else {
      addToast("Incorrect PIN", "error");
      setPinInput("");
    }
  }

  async function handleEndShift() {
    await endStaffShift();
    if (shop) cacheActiveStaff(shop.id, null);
    setActiveStaff(null);
    addToast("Shift ended", "info");
  }

  function toggleModule(id: PosModuleId) {
    setSettings((s) => {
      const on = s.modules.includes(id);
      let modules = on ? s.modules.filter((x) => x !== id) : [...s.modules, id];
      if (modules.length === 0) modules = ["queue"];
      const patch: Partial<PosSettings> = { modules };
      if (id === "kitchen") patch.kitchen_enabled = !on;
      return { ...s, ...patch };
    });
  }

  const needsPin =
    Boolean(settings.staff_pin && settings.staff_pin.trim().length >= 4) && !unlocked;

  if (boot) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-100 text-sm text-zinc-500 dark:bg-zinc-950">
        Loading POS…
      </div>
    );
  }

  if (!shop) return null;

  // Once a shop has staff configured, a named shift is required — the server
  // enforces this too, so skipping the screen can't produce a sale.
  if (staffReady && staffList.length > 0 && !activeStaff) {
    return (
      <PosShiftLogin
        shopId={shop.id}
        shopName={shop.name}
        staff={staffList}
        onStarted={(staff) => {
          setActiveStaff(staff);
          cacheActiveStaff(shop.id, staff);
          setUnlocked(true);
          addToast(`Shift started — ${staff.name}`, "success");
        }}
      />
    );
  }

  if (needsPin) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-zinc-50 px-4 text-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
          TrendsMart POS
        </p>
        <h1 className="mt-2 text-xl font-bold text-zinc-900 dark:text-zinc-50">{shop.name}</h1>
        <p className="mt-1 text-xs text-zinc-500">Enter staff PIN to unlock cashier</p>
        <form
          className="mt-6 flex w-full max-w-xs flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            tryUnlock();
          }}
        >
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            placeholder="PIN"
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-center text-lg tracking-[0.4em] text-white outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-500"
          >
            Unlock
          </button>
        </form>
        <Link href="/dashboard" className="mt-6 text-xs text-zinc-500 hover:text-zinc-300">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const navBtn = (id: Tab) => {
    const meta =
      id === "setup"
        ? { label: "Setup", icon: "⚙️", blurb: "Turn modules on/off · shop type" }
        : POS_MODULE_META[id];
    const active = tab === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => setTab(id)}
        title={meta.blurb}
        className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold transition lg:w-full ${
          active
            ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/20"
            : "text-zinc-600 hover:bg-emerald-50 hover:text-emerald-800 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
        }`}
      >
        <span aria-hidden className="text-sm">
          {meta.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block leading-tight">{meta.label}</span>
          <span
            className={`mt-0.5 hidden text-[9px] font-medium leading-tight lg:block ${
              active ? "text-emerald-100/90" : "text-zinc-400"
            }`}
          >
            {meta.blurb}
          </span>
        </span>
        {id === "queue" && queue.length > 0 ? (
          <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
            {queue.length}
          </span>
        ) : null}
        {id === "customers" && customers.length > 0 ? (
          <span className="rounded-full bg-zinc-600 px-1.5 text-[10px] text-zinc-100">
            {customers.length}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950 lg:flex-row">
      {/* Desktop left nav — TrendsMart light chrome; own scroll only */}
      <aside className="hidden h-full w-56 shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-zinc-200 bg-white text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 lg:flex">
        <div className="sticky top-0 z-10 shrink-0 border-b border-zinc-100 bg-white px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950">
          <Link
            href="/dashboard"
            className="mb-2 inline-flex text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
          >
            ← Dashboard
          </Link>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400/90">
            TrendsMart POS
          </p>
          <p className="mt-1 truncate text-sm font-bold text-zinc-900 dark:text-zinc-50">{shop.name}</p>
          <p className="mt-0.5 truncate text-[10px] text-zinc-500">{posPackLabel(settings.pack)}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2" aria-label="POS modules">
          {enabledTabs.map(navBtn)}
        </nav>
        <div className="shrink-0 border-t border-zinc-100 p-3 text-[10px] text-zinc-500 dark:border-zinc-800">
          <Link href="/dashboard/orders" className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">
            Full orders →
          </Link>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* ERP header */}
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3 py-2 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 sm:px-4">
          <div className="min-w-0">
            <div className="mb-0.5 flex items-center gap-2 lg:hidden">
              <Link
                href="/dashboard"
                className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
              >
                ← Dashboard
              </Link>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">
                POS
              </span>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h1 className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-50 sm:text-base">{shop.name}</h1>
              <span className="text-[11px] text-zinc-500">{posPackLabel(settings.pack)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                online
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800"
                  : "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300"
              }`}
            >
              {online ? "Online" : "Offline"}
            </span>
            {offlinePending > 0 ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                {offlinePending} queued
              </span>
            ) : null}
            {activeStaff ? (
              <span
                className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                title={`On shift · ${activeStaff.role}`}
              >
                {activeStaff.name} · {activeStaff.role}
              </span>
            ) : (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                Owner
              </span>
            )}
            {activeStaff ? (
              <button
                type="button"
                onClick={() => void handleEndShift()}
                className="rounded-md border border-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                End shift
              </button>
            ) : settings.staff_pin && settings.staff_pin.trim().length >= 4 ? (
              <button
                type="button"
                onClick={() => setUnlocked(false)}
                className="rounded-md border border-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Lock
              </button>
            ) : null}
            <Link
              href="/dashboard/orders"
              className="hidden items-center rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50 sm:inline-flex dark:border-zinc-700 dark:bg-zinc-900 dark:text-emerald-400"
            >
              Orders
            </Link>
          </div>
        </header>

        {/* Mobile horizontal tabs */}
        <nav
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-200 bg-white px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950 lg:hidden"
          aria-label="POS sections"
        >
          {enabledTabs.map(navBtn)}
        </nav>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:p-3">
          {/* SETUP */}
          {tab === "setup" && (
            <section className="mx-auto max-w-2xl space-y-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
              <div>
                <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  POS setup
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Toggle modules, pick a category pack, and save preferences for this store.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {ALL_MODULE_IDS.map((id) => {
                  const m = POS_MODULE_META[id];
                  const on = settings.modules.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleModule(id)}
                      className={`rounded-xl border p-3 text-left transition ${
                        on
                          ? "border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30"
                          : "border-zinc-200 dark:border-zinc-700"
                      }`}
                    >
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        <span aria-hidden>{m.icon}</span> {m.label}
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">{m.blurb}</p>
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Category pack
                </label>
                <select
                  value={settings.pack}
                  onChange={(e) => {
                    const pack = e.target.value as PosSettings["pack"];
                    setSettings((s) => applyPackDefaults(pack, s));
                  }}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                >
                  {POS_PACK_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {posPackLabel(p)}
                    </option>
                  ))}
                </select>
                <ul className="mt-2 space-y-0.5 text-[11px] text-zinc-500">
                  {posPackHints(settings.pack).map((h) => (
                    <li key={h}>· {h}</li>
                  ))}
                </ul>
                <p className="mt-2 rounded-lg bg-zinc-100 px-2.5 py-1.5 text-[10px] leading-relaxed text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    Covers:{" "}
                  </span>
                  {(POS_PACK_CATEGORY_COVERAGE[settings.pack] ?? []).join(" · ")}
                </p>
                <button
                  type="button"
                  className="mt-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400"
                  onClick={() => {
                    const pack = suggestPosPack(shop.category);
                    setSettings((s) => applyPackDefaults(pack, s));
                  }}
                >
                  Auto-match from store category ({shop.category} →{" "}
                  {posPackLabel(suggestPosPack(shop.category))})
                </button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["barcode_enabled", "Barcode scan / type"],
                    ["decimal_qty", "Decimal qty (kg / loose)"],
                    ["token_mode", "Token / queue number"],
                    ["prefer_customer_phone", "Prefer customer phone"],
                    ["auto_complete_counter", "Pickup cash → Delivered instantly"],
                    ["order_sound", "Sound on new queue tickets"],
                    ["auto_print_receipt", "Auto-print receipt after sale"],
                    ["kitchen_enabled", "Kitchen module enabled"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 rounded-xl border border-zinc-100 px-3 py-2 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:text-zinc-300"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(settings[key])}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSettings((s) => {
                          const next = { ...s, [key]: checked };
                          if (key === "kitchen_enabled") {
                            if (checked && !s.modules.includes("kitchen")) {
                              next.modules = [...s.modules, "kitchen"];
                            }
                            if (!checked) {
                              next.modules = s.modules.filter((m) => m !== "kitchen");
                            }
                          }
                          return next;
                        });
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600">
                  Counter layout (per shop type)
                </label>
                <select
                  value={settings.counter_layout || "excel"}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      counter_layout: e.target.value as "menu" | "excel",
                    }))
                  }
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <option value="excel">Quick search (Enter to add)</option>
                  <option value="menu">Menu tiles (tap to add)</option>
                </select>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Suggested by your shop type — you can change it anytime.
                </p>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
                <p className="text-xs font-bold text-zinc-800 dark:text-zinc-100">
                  Printer & barcode
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  Supports 58/80mm thermal printers (Bluetooth or USB), camera
                  barcode scan, and USB scanners.
                </p>
                <label className="mt-2 mb-1 block text-[11px] font-semibold text-zinc-500">
                  Print method
                </label>
                <select
                  value={settings.print_target || "browser"}
                  onChange={(e) => {
                    const v = e.target.value as PosSettings["print_target"];
                    setSettings((s) => ({ ...s, print_target: v }));
                    setPrintTarget(v);
                  }}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <option value="browser">
                    Browser print (USB / OS Bluetooth driver — sab se asaan)
                  </option>
                  <option value="bluetooth">
                    Bluetooth ESC/POS (Chrome / Android — pair printer)
                  </option>
                  <option value="serial">
                    USB Serial ESC/POS (Chrome desktop cable)
                  </option>
                </select>
                <label className="mt-2 mb-1 block text-[11px] font-semibold text-zinc-500">
                  Paper width
                </label>
                <select
                  value={settings.print_width_mm || 80}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      print_width_mm: Number(e.target.value) === 58 ? 58 : 80,
                    }))
                  }
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <option value={80}>80mm (most shops)</option>
                  <option value={58}>58mm (mini portable)</option>
                </select>
                <p className="mt-2 text-[11px] text-zinc-500">
                  Status: {printerConnectionLabel()}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!isBluetoothSupported()}
                    onClick={async () => {
                      const res = await connectBluetoothPrinter();
                      if (!res.ok) {
                        addToast(res.error, "error");
                        return;
                      }
                      setSettings((s) => ({ ...s, print_target: "bluetooth" }));
                      addToast(`Bluetooth: ${res.name}`, "success");
                    }}
                    className="rounded-lg bg-sky-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
                  >
                    Pair Bluetooth
                  </button>
                  <button
                    type="button"
                    disabled={!isSerialSupported()}
                    onClick={async () => {
                      const res = await connectSerialPrinter();
                      if (!res.ok) {
                        addToast(res.error, "error");
                        return;
                      }
                      setSettings((s) => ({ ...s, print_target: "serial" }));
                      addToast("USB printer connected", "success");
                    }}
                    className="rounded-lg bg-zinc-800 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40 dark:bg-zinc-200 dark:text-zinc-900"
                  >
                    Connect USB
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await disconnectThermalPrinter();
                      setSettings((s) => ({ ...s, print_target: "browser" }));
                      setPrintTarget("browser");
                      addToast("Printer disconnected · browser print", "info");
                    }}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-[11px] font-bold dark:border-zinc-600"
                  >
                    Disconnect
                  </button>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                  USB scanners work in the search box — scan and press Enter to add.
                  Camera scan is available on Counter when barcode is enabled.
                </p>
              </div>

              <PosStaffPanel
                shopId={shop.id}
                onToast={addToast}
                onChanged={(rows) => setStaffList(rows.filter((r) => r.is_active))}
              />

              <div className="grid gap-2 sm:grid-cols-2">
                {staffList.length === 0 ? (
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-zinc-500">
                      Legacy shared PIN (optional)
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      value={settings.staff_pin ?? ""}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, staff_pin: e.target.value }))
                      }
                      placeholder="Leave blank to disable"
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                    <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
                      Ye purana single PIN hai (sirf is device pe check hota tha). Staff add
                      karte hi ye band ho jata hai aur har banda apne PIN se shift start karta hai.
                    </p>
                  </div>
                ) : null}
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-zinc-500">
                    Low-stock threshold
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={settings.low_stock_threshold}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        low_stock_threshold: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                  Stock discipline · {packProfile.blurb}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["block_oversell", "Hard block oversell (off = warn + allow minus)"],
                      ["warn_low_on_add", "Warn on low / negative stock when adding"],
                      ["track_batch", "Show batch / lot fields (optional)"],
                      ["track_expiry", "Show expiry fields + alerts (optional)"],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(settings[key])}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, [key]: e.target.checked }))
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-500">
                  Receipt footer
                </label>
                <input
                  value={settings.receipt_footer ?? ""}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, receipt_footer: e.target.value }))
                  }
                  placeholder="Thanks for shopping with us!"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-500">
                  Tax % (applied on bill total, 0 = no tax)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={settings.tax_rate || ""}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      tax_rate: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                    }))
                  }
                  placeholder="0"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
                  Online catalog already bills in POS
                </p>
                <p className="mt-1 text-xs leading-relaxed text-emerald-800/90 dark:text-emerald-200/90">
                  Your store products load automatically for Counter billing. Optional
                  barcode, cost, and stock fields can be filled anytime under Inventory →
                  Catalog setup (filter by sub-category, save a few or all).
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSettings((s) => {
                      const mods = new Set(s.modules.length ? s.modules : ["queue", "counter"]);
                      mods.add("stock");
                      return {
                        ...s,
                        enabled: true,
                        modules: [...mods] as PosSettings["modules"],
                      };
                    });
                    setTab("stock");
                  }}
                  className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800"
                >
                  Open catalog setup
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  void persistSettings({
                    ...settings,
                    enabled: true,
                    modules: settings.modules.length
                      ? settings.modules
                      : ["queue", "counter"],
                  }).then(() => {
                    const pin = (settings.staff_pin || "").trim();
                    if (pin.length >= 4) setUnlocked(true);
                    setTab(settings.modules[0] ?? "queue");
                  })
                }
                className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700"
              >
                Save & open POS
              </button>
            </section>
          )}

          {/* QUEUE */}
          {tab === "queue" && settings.enabled && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Live queue · {queue.length}
                </h2>
                <div className="flex gap-2 text-[11px] text-zinc-500">
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                    Open {queue.length}
                  </span>
                  <span>
                    Pending{" "}
                    {queue.filter((o) => o.status === "Pending").length}
                  </span>
                </div>
              </div>
              {queue.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
                  No open tickets. New online orders appear here automatically.
                </p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {queue.map((o) => {
                    const src = orderSource(o);
                    return (
                      <li
                        key={o.id}
                        className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                              {o.customer_name}
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              {src === "pos"
                                ? "Counter"
                                : src === "online"
                                  ? "Online / WhatsApp"
                                  : src}{" "}
                              · {o.order_type || "delivery"}
                            </p>
                          </div>
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                            {o.status}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                          {(o.items_json || [])
                            .map((i) => `${i.quantity ?? 1}× ${i.name}`)
                            .join(", ")}
                        </p>
                        <p className="mt-1 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                          {formatRupees(o.total_amount)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {getValidTransitions(o.status).map((next) => (
                            <button
                              key={next}
                              type="button"
                              onClick={() => void advanceOrder(o, next)}
                              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                            >
                              → {getStatusLabel(next)}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => {
                              setAutoPrintBill(true);
                              setBillOrder(o);
                            }}
                            className="rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-semibold dark:border-zinc-700"
                          >
                            Print
                          </button>
                          {src === "pos" ? (
                            <button
                              type="button"
                              onClick={() => void handleVoid(o)}
                              className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                            >
                              Void
                            </button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {/* COUNTER */}
          {tab === "counter" && settings.enabled && (
            <section className="grid gap-3 lg:grid-cols-[1.35fr_minmax(17rem,22rem)] lg:items-start">
              <div className={`${mobileBillView ? "hidden lg:block" : ""} space-y-1.5`}>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                  <p className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {products.length} product{products.length === 1 ? "" : "s"} ready
                    {" · "}same list as your store
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setMiscOpen(true)}
                      className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-bold dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      + Custom<span className="hidden sm:inline"> (Alt+M)</span>
                    </button>
                    {settings.barcode_enabled ? (
                      <button
                        type="button"
                        onClick={() => setShowCamera(true)}
                        className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200"
                      >
                        Scan<span className="hidden sm:inline"> (Alt+B)</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={!undoLine}
                      onClick={undoRemove}
                      className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-bold disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      Undo<span className="hidden sm:inline"> (Alt+Z)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowShortcuts((v) => !v)}
                      className="hidden items-center rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-bold dark:border-zinc-700 dark:bg-zinc-900 md:inline-flex"
                    >
                      Shortcuts
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRecent((v) => !v)}
                      className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-bold dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      Recent (Alt+R)
                    </button>
                  </div>
                </div>

                {cart.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setMobileBillView(true)}
                    className="flex w-full items-center justify-between rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-600/25 lg:hidden"
                  >
                    <span>
                      View Bill · {cart.length} item{cart.length === 1 ? "" : "s"}
                    </span>
                    <span>{formatRupees(cartTotal.total)} →</span>
                  </button>
                ) : null}

                {held.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {held.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => recallBill(h)}
                        className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
                      >
                        Hold: {h.label}
                      </button>
                    ))}
                  </div>
                ) : null}

                {showShortcuts ? (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] dark:border-zinc-700 dark:bg-zinc-900">
                    <p className="font-bold text-zinc-700 dark:text-zinc-200">Keyboard</p>
                    <ul className="mt-1 grid gap-0.5 text-zinc-600 sm:grid-cols-2 dark:text-zinc-400">
                      <li>Alt+F — search focus</li>
                      <li>Alt+S — complete sale</li>
                      <li>Alt+C — clear bill</li>
                      <li>Alt+Z — undo remove</li>
                      <li>⌫ empty search — remove last line</li>
                      <li>Alt+G — discount</li>
                      <li>Alt+M — misc item</li>
                      <li>Alt+P — reprint last</li>
                      <li>Alt+R — recent sales</li>
                      <li>Alt+B — camera barcode</li>
                      <li>Shift+Enter — cash received</li>
                    </ul>
                  </div>
                ) : null}

                {showRecent && recentPosSales.length > 0 ? (
                  <div className="rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                      Recent counter sales
                    </p>
                    <ul className="max-h-36 space-y-1 overflow-y-auto">
                      {recentPosSales.map((o) => (
                        <li
                          key={o.id}
                          className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-2 py-1.5 text-[11px] dark:bg-zinc-900"
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                              {o.customer_name || "Walk-in"}
                            </span>
                            <span className="text-zinc-400">
                              {" "}
                              ·{" "}
                              {new Date(o.created_at).toLocaleTimeString("en-PK", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </span>
                          <span className="shrink-0 font-bold tabular-nums">
                            {formatRupees(o.total_amount)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setAutoPrintBill(true);
                              setBillOrder(o);
                              setLastPrintedOrder(o);
                            }}
                            className="shrink-0 rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] font-bold dark:border-zinc-700"
                          >
                            Print
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {miscOpen ? (
                  <div className="rounded-xl border-2 border-amber-400/60 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
                    <p className="text-xs font-bold text-amber-900 dark:text-amber-100">
                      Misc / general item
                    </p>
                    <div className="mt-2 grid grid-cols-[1fr_88px_72px] gap-2">
                      <input
                        autoFocus
                        value={miscName}
                        onChange={(e) => setMiscName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addCustomLine();
                          }
                        }}
                        placeholder="Item name"
                        className="rounded-lg border border-amber-200 bg-white px-2 py-2 text-xs dark:border-amber-800 dark:bg-zinc-900"
                      />
                      <input
                        type="number"
                        min={0}
                        value={miscPrice}
                        onChange={(e) => setMiscPrice(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addCustomLine();
                          }
                        }}
                        placeholder="Rs"
                        className="rounded-lg border border-amber-200 bg-white px-2 py-2 text-xs dark:border-amber-800 dark:bg-zinc-900"
                      />
                      <input
                        type="number"
                        min={settings.decimal_qty ? 0.25 : 1}
                        step={settings.decimal_qty ? 0.25 : 1}
                        value={miscQty}
                        onChange={(e) => setMiscQty(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addCustomLine();
                          }
                        }}
                        placeholder="Qty"
                        className="rounded-lg border border-amber-200 bg-white px-2 py-2 text-xs dark:border-amber-800 dark:bg-zinc-900"
                      />
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={addCustomLine}
                        className="rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white"
                      >
                        Add to bill
                      </button>
                      <button
                        type="button"
                        onClick={() => setMiscOpen(false)}
                        className="rounded-lg border border-amber-300 px-3 py-1.5 text-[11px] font-bold dark:border-amber-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {(settings.counter_layout || "excel") === "excel" ? (
                  <PosExcelCounter
                    ref={excelRef}
                    products={products}
                    cart={cart}
                    shopCategory={shop.category}
                    decimalQty={settings.decimal_qty}
                    barcodeEnabled={settings.barcode_enabled}
                    lowStockThreshold={settings.low_stock_threshold}
                    favourites={favourites}
                    recentProducts={recentProducts}
                    onTryAdd={tryAddProduct}
                    onSetQty={updateCartLineQty}
                    onSetUnitPrice={updateCartLinePrice}
                    onRemove={removeCartLine}
                    onRemoveLast={removeLastCartLine}
                    onAdded={(name) => addToast(`+ ${name}`, "success")}
                    onAddCustom={() => setMiscOpen(true)}
                    onScanCode={(code) => handleBarcodeSubmit(code)}
                    onOpenCamera={() => setShowCamera(true)}
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowBulkAdd(true)}
                      className="w-full rounded-xl border-2 border-dashed border-emerald-400/70 bg-emerald-50 py-2.5 text-sm font-bold text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                    >
                      Bulk add
                    </button>

                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Filter menu…"
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />

                    {favourites.length > 0 ? (
                      <div>
                        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                          Favourites
                        </p>
                        <div className="flex gap-1.5 overflow-x-auto pb-1">
                          {favourites.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => tryAddProduct(p)}
                              className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                            >
                              {p.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="grid max-h-[min(36rem,58vh)] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                      {filteredProducts.map((p) => {
                        const hasVariants =
                          customerVariantGroups(p.variants as never).length > 0;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => tryAddProduct(p)}
                            className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white text-left shadow-sm transition hover:border-emerald-500 hover:shadow-md active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-900"
                          >
                            {p.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img loading="lazy" decoding="async"
                                src={p.image_url}
                                alt=""
                                className="h-28 w-full object-cover sm:h-32"
                              />
                            ) : (
                              <div className="flex h-28 items-center justify-center bg-zinc-100 text-4xl dark:bg-zinc-800 sm:h-32">
                                🍽️
                              </div>
                            )}
                            <div className="p-2.5">
                              <p className="line-clamp-2 text-sm font-bold leading-snug text-zinc-900 dark:text-zinc-50">
                                {p.name}
                              </p>
                              <p className="mt-1 text-base font-black text-emerald-700 dark:text-emerald-400">
                                {formatRupees(p.price)}
                              </p>
                              {hasVariants ? (
                                <p className="mt-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                                  Tap · pick variants
                                </p>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 sm:p-2.5 lg:sticky lg:top-0 lg:max-h-[calc(100dvh-4.5rem)] lg:overflow-hidden">
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-100 pb-1 dark:border-zinc-800">
                  <div className="min-w-0">
                    {mobileBillView ? (
                      <button
                        type="button"
                        onClick={() => setMobileBillView(false)}
                        className="mb-0.5 text-[10px] font-bold text-emerald-700 lg:hidden dark:text-emerald-400"
                      >
                        ← Products
                      </button>
                    ) : null}
                    <h2 className="text-xs font-bold text-zinc-900 dark:text-zinc-50">Bill</h2>
                    <p className="truncate text-[9px] text-zinc-500">
                      {shop.name}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={!undoLine}
                      onClick={undoRemove}
                      className="rounded-lg border border-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                    >
                      Undo
                    </button>
                    <button
                      type="button"
                      disabled={cart.length === 0}
                      onClick={holdBill}
                      className="rounded-lg border border-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                    >
                      Hold
                    </button>
                    <button
                      type="button"
                      disabled={cart.length === 0}
                      onClick={clearBill}
                      className="rounded-lg border border-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain py-1">
                {cart.length === 0 ? (
                  <p className="rounded-xl bg-zinc-50 py-4 text-center text-[11px] text-zinc-500 dark:bg-zinc-800/50">
                    {(settings.counter_layout || "excel") === "excel"
                      ? "Quick add / search se bill shuru karo"
                      : "Tap products to add"}
                  </p>
                ) : (settings.counter_layout || "excel") === "excel" ? (
                  <p className="text-center text-[10px] font-medium text-zinc-500">
                    {cart.length} lines · see grid
                  </p>
                ) : (
                  <ul className="max-h-36 space-y-1 overflow-y-auto">
                    {cart.map((l) => (
                      <li
                        key={l.key}
                        className="flex items-start justify-between gap-2 text-[11px]"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-zinc-800 dark:text-zinc-100">
                            {l.name}
                          </p>
                          {l.variant ? (
                            <p className="text-[9px] text-zinc-500">{l.variant}</p>
                          ) : null}
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <button
                              type="button"
                              className="h-6 w-6 rounded bg-zinc-100 text-[11px] font-bold hover:bg-red-50 hover:text-red-600 dark:bg-zinc-800"
                              onClick={() => {
                                const next = bumpQty(
                                  l.qty,
                                  -qtyStep(settings.decimal_qty),
                                  settings.decimal_qty,
                                );
                                if (next <= 0) removeCartLine(l.key);
                                else updateCartLineQty(l.key, next);
                              }}
                            >
                              {l.qty <= qtyStep(settings.decimal_qty) ? "✕" : "−"}
                            </button>
                            {settings.decimal_qty ? (
                              <input
                                type="number"
                                min={0}
                                step={0.25}
                                value={l.qty}
                                onChange={(e) => {
                                  const v = Number(e.target.value);
                                  if (!Number.isFinite(v) || v <= 0) {
                                    removeCartLine(l.key);
                                    return;
                                  }
                                  updateCartLineQty(l.key, v);
                                }}
                                className="w-12 rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 text-center text-[10px] tabular-nums dark:border-zinc-700 dark:bg-zinc-800"
                              />
                            ) : (
                              <span className="min-w-[1.25rem] text-center tabular-nums">
                                {l.qty}
                              </span>
                            )}
                            <button
                              type="button"
                              className="h-6 w-6 rounded bg-emerald-50 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                              onClick={() =>
                                updateCartLineQty(
                                  l.key,
                                  bumpQty(
                                    l.qty,
                                    qtyStep(settings.decimal_qty),
                                    settings.decimal_qty,
                                  ),
                                )
                              }
                            >
                              +
                            </button>
                            <span className="flex items-center gap-1 text-[9px] text-zinc-400">
                              @
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={l.unitPrice}
                                onChange={(e) =>
                                  updateCartLinePrice(l.key, Number(e.target.value) || 0)
                                }
                                className="w-14 rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 text-center tabular-nums dark:border-zinc-700 dark:bg-zinc-800"
                                title="Tap to change sale price"
                              />
                              {l.priceLocked ? (
                                <span className="text-amber-600" title="Price overridden">
                                  *
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <p className="font-bold tabular-nums">
                            {formatRupees(l.unitPrice * l.qty)}
                          </p>
                          <button
                            type="button"
                            onClick={() => removeCartLine(l.key)}
                            className="rounded bg-red-50 px-1.5 py-0.5 text-[9px] font-bold text-red-600 dark:bg-red-950/40 dark:text-red-300"
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex gap-1.5">
                  {(["pickup", "delivery"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setOrderType(t)}
                      className={`flex-1 rounded-xl py-1 text-[11px] font-bold capitalize transition ${
                        orderType === t
                          ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/25"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    placeholder="Customer name"
                    className="rounded-xl border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[12px] dark:border-zinc-700 dark:bg-zinc-800"
                  />
                  <input
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    placeholder="Phone"
                    className="rounded-xl border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[12px] dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>

                {customerQuickPick.length > 0 ? (
                  <div className="flex flex-wrap gap-0.5">
                    {customerQuickPick.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCustName(c.name);
                          setCustPhone(c.phone);
                        }}
                        className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                ) : null}

                {settings.token_mode ? (
                  <input
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Token #"
                    className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-1 text-[11px] dark:border-zinc-700 dark:bg-zinc-800"
                  />
                ) : null}

                {orderType === "delivery" ? (
                  <input
                    value={deliveryFee}
                    onChange={(e) => setDeliveryFee(e.target.value)}
                    type="number"
                    min={0}
                    placeholder="Delivery fee Rs."
                    className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-1 text-[11px] dark:border-zinc-700 dark:bg-zinc-800"
                  />
                ) : null}

                <label className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-600 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    checked={splitPay}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setSplitPay(on);
                      if (on) {
                        setSplit({
                          cash: cartTotal.total,
                          card: 0,
                          jazzcash: 0,
                          easypaisa: 0,
                          credit: 0,
                        });
                      }
                    }}
                  />
                  Split pay
                </label>

                {splitPay ? (
                  <div className="grid grid-cols-2 gap-1">
                    {(
                      [
                        ["cash", "Cash"],
                        ["jazzcash", "JazzCash"],
                        ["easypaisa", "Easypaisa"],
                        ["card", "Card"],
                        ["credit", "Udhaar"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="text-[9px] text-zinc-500">
                        {label}
                        <input
                          type="number"
                          min={0}
                          value={split[key] ?? ""}
                          onChange={(e) =>
                            setSplit((s) => ({
                              ...s,
                              [key]: Math.max(0, Number(e.target.value) || 0),
                            }))
                          }
                          className="mt-0.5 w-full rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-1 text-[11px] dark:border-zinc-700 dark:bg-zinc-800"
                        />
                      </label>
                    ))}
                    <p className="col-span-2 text-[9px] text-zinc-500">
                      Split {formatRupees(splitSum(split))} · bill{" "}
                      {formatRupees(cartTotal.total)}
                      {Math.abs(splitSum(split) - cartTotal.total) > 2 ? (
                        <span className="font-semibold text-amber-600"> · mismatch</span>
                      ) : null}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        "cash",
                        "card",
                        "jazzcash",
                        "easypaisa",
                        "credit",
                        "other",
                      ] as PosPaymentMethod[]
                    ).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPay(m)}
                        className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                          pay === m
                            ? "bg-emerald-600 text-white"
                            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                        }`}
                      >
                        {m === "credit" ? "Udhaar" : m}
                      </button>
                    ))}
                  </div>
                )}

                {!splitPay && pay === "cash" ? (
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">
                      Cash · Shift+Enter
                    </label>
                    <input
                      ref={cashRef}
                      type="number"
                      min={0}
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      placeholder={
                        cartTotal.total > 0 ? String(cartTotal.total) : "Amount paid"
                      }
                      className="w-full rounded-md border-2 border-emerald-500/50 bg-emerald-50/50 px-1.5 py-1 text-sm font-bold tabular-nums dark:border-emerald-700 dark:bg-emerald-950/20"
                    />
                    <div className="grid grid-cols-7 gap-0.5">
                      {[50, 100, 200, 500, 1000, 2000, 5000].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() =>
                            setCashReceived(String(cashPaidNum + val))
                          }
                          className="rounded border border-zinc-200 py-0.5 text-[9px] font-bold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                          {val >= 1000 ? `${val / 1000}k` : val}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setCashReceived(String(cartTotal.total))}
                        className="rounded border border-zinc-200 px-1.5 py-0.5 text-[9px] font-bold dark:border-zinc-700"
                      >
                        Exact
                      </button>
                      <button
                        type="button"
                        onClick={() => setCashReceived("")}
                        className="rounded border border-zinc-200 px-1.5 py-0.5 text-[9px] font-bold dark:border-zinc-700"
                      >
                        Clear
                      </button>
                      {changeDue > 0 ? (
                        <span className="ml-auto text-[11px] font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                          Change {formatRupees(changeDue)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-1">
                  <div className="flex gap-1">
                    <input
                      ref={discountRef}
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      type="number"
                      min={0}
                      placeholder={discountMode === "percent" ? "Discount %" : "Discount Rs"}
                      className="w-full min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-1 text-[11px] dark:border-zinc-700 dark:bg-zinc-800"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDiscountMode((m) => (m === "flat" ? "percent" : "flat"))
                      }
                      title="Switch between flat Rs and % discount"
                      className="shrink-0 rounded-md border border-zinc-200 px-1.5 text-[10px] font-bold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      {discountMode === "percent" ? "%" : "Rs"}
                    </button>
                  </div>
                  <input
                    value={billNotes}
                    onChange={(e) => setBillNotes(e.target.value)}
                    placeholder={
                      settings.pack === "electronics"
                        ? "IMEI / notes"
                        : settings.pack === "pharmacy"
                          ? "Rx / notes"
                          : settings.pack === "hardware"
                            ? "Size / finish / notes"
                            : "Notes"
                    }
                    className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-1 text-[11px] dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
                </div>

                <div className="shrink-0 space-y-1 border-t border-zinc-100 pt-1 dark:border-zinc-800">
                <div className="space-y-0.5 text-sm">
                  {cartTotal.discount > 0 || cartTotal.tax > 0 || cartTotal.fee > 0 ? (
                    <>
                      <div className="flex justify-between text-[10px] text-zinc-500">
                        <span>Subtotal</span>
                        <span>{formatRupees(cartTotal.sub)}</span>
                      </div>
                      {cartTotal.discount > 0 ? (
                        <div className="flex justify-between text-[10px] text-zinc-500">
                          <span>Discount</span>
                          <span>−{formatRupees(cartTotal.discount)}</span>
                        </div>
                      ) : null}
                      {cartTotal.tax > 0 ? (
                        <div className="flex justify-between text-[10px] text-zinc-500">
                          <span>Tax ({settings.tax_rate}%)</span>
                          <span>{formatRupees(cartTotal.tax)}</span>
                        </div>
                      ) : null}
                      {cartTotal.fee > 0 ? (
                        <div className="flex justify-between text-[10px] text-zinc-500">
                          <span>Delivery</span>
                          <span>{formatRupees(cartTotal.fee)}</span>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  <div className="flex items-center justify-between rounded-xl bg-emerald-600 px-3 py-1.5 text-white shadow-sm shadow-emerald-600/30">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-100">
                      Total
                    </span>
                    <span className="text-lg font-black tabular-nums tracking-tight">
                      {formatRupees(cartTotal.total)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busy || cart.length === 0}
                  onClick={() => void checkout()}
                  className="w-full rounded-lg bg-emerald-600 py-1.5 text-xs font-extrabold text-white shadow-md shadow-emerald-600/25 hover:bg-emerald-500 disabled:opacity-50"
                >
                  {busy
                    ? "Saving…"
                    : settings.auto_print_receipt !== false
                      ? "Complete & Print (Alt+S)"
                      : "Complete sale (Alt+S)"}
                </button>

                {lastReceipt ? (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const o = lastPrintedOrder || billOrder;
                        if (o) {
                          setAutoPrintBill(true);
                          setBillOrder(o);
                        } else {
                          void copyReceipt();
                        }
                      }}
                      className="flex-1 rounded-md border border-zinc-200 py-1 text-[10px] font-bold dark:border-zinc-700"
                    >
                      Print again
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyReceipt()}
                      className="flex-1 rounded-md border border-zinc-200 py-1 text-[10px] font-bold dark:border-zinc-700"
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={shareReceiptWhatsApp}
                      className="flex-1 rounded-md border border-emerald-200 bg-emerald-50 py-1 text-[10px] font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
                    >
                      WhatsApp
                    </button>
                  </div>
                ) : null}
                </div>
              </div>
            </section>
          )}

          {/* KITCHEN */}
          {tab === "kitchen" && settings.enabled && (
            <PosKitchenPanel shop={shop} soundEnabled={settings.order_sound} />
          )}

          {/* STOCK */}
          {tab === "stock" && settings.enabled && (
            <PosStockPanel
              shopId={shop.id}
              shopCategory={shop.category}
              products={products}
              settings={settings}
              onProductsChange={setProducts}
              onRefresh={async () => {
                await refresh(shop.id);
              }}
            />
          )}

          {/* CASH */}
          {tab === "cash" && settings.enabled && (
            <PosCashPanel shopId={shop.id} orders={orders} />
          )}

          {tab === "expenses" && settings.enabled && (
            <PosExpensesPanel shopId={shop.id} />
          )}

          {tab === "credit" && settings.enabled && (
            <PosCreditPanel
              shopId={shop.id}
              onPickCustomer={(c) => {
                setCustName(c.name);
                setCustPhone(c.phone.startsWith("name:") ? "" : c.phone);
                setTab("counter");
              }}
            />
          )}

          {tab === "recipes" && settings.enabled && (
            <PosRecipesPanel shopId={shop.id} products={products} />
          )}

          {/* REPORTS */}
          {tab === "reports" && settings.enabled && canSeeReports && (
            <section className="space-y-2.5">
              <PosAuditPanel shopId={shop.id} />
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                <h2 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
                  Sales &amp; reports
                </h2>
                <p className="text-[10px] text-zinc-500">
                  Dates choose → Print / Download → neeche history se bill reprint
                </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <label className="text-[10px] font-semibold text-zinc-500">
                    From
                    <input
                      type="date"
                      value={reportFrom}
                      onChange={(e) => setReportFrom(e.target.value)}
                      className="ml-1 rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-[11px] dark:border-zinc-700 dark:bg-zinc-900"
                    />
                  </label>
                  <label className="text-[10px] font-semibold text-zinc-500">
                    To
                    <input
                      type="date"
                      value={reportTo}
                      onChange={(e) => setReportTo(e.target.value)}
                      className="ml-1 rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-[11px] dark:border-zinc-700 dark:bg-zinc-900"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const lines = [
                        `TrendsMart POS report`,
                        `Shop: ${shop.name}`,
                        `Range: ${reportFrom} → ${reportTo}`,
                        `Total sales: ${formatRupees(report.totalRevenue)}`,
                        `Online: ${report.onlineCount} · ${formatRupees(report.onlineRevenue)}`,
                        `Counter: ${report.posCount} · ${formatRupees(report.posRevenue)}`,
                        `Cash: ${formatRupees(report.cashSales)}`,
                        `Udhaar: ${formatRupees(report.creditSales)}`,
                        `Gross profit (est.): ${formatRupees(report.grossProfitEstimate)}`,
                        `Expenses: ${formatRupees(report.expenseTotal)}`,
                        `Net: ${formatRupees(report.netProfitEstimate)}`,
                        "",
                        "Top items:",
                        ...report.topItems.map(
                          (t) => `${t.name} x${t.qty} · ${formatRupees(t.revenue)}`,
                        ),
                      ];
                      const blob = new Blob([lines.join("\n")], {
                        type: "text/plain;charset=utf-8",
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `pos-report-${reportFrom}-${reportTo}.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                      addToast("Report downloaded", "success");
                    }}
                    className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] font-bold dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const w = window.open("", "_blank", "noopener,noreferrer,width=720,height=900");
                      if (!w) {
                        addToast("Allow popups to print", "info");
                        return;
                      }
                      const rows = report.topItems
                        .map(
                          (t) =>
                            `<tr><td>${t.name}</td><td>×${t.qty}</td><td>${formatRupees(t.revenue)}</td></tr>`,
                        )
                        .join("");
                      w.document.write(`<!doctype html><html><head><title>POS Report</title>
                        <style>body{font-family:system-ui,sans-serif;padding:16px;color:#111}
                        h1{font-size:18px;margin:0 0 8px}table{width:100%;border-collapse:collapse;font-size:12px}
                        td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left}
                        .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}
                        .card{border:1px solid #e5e5e5;border-radius:8px;padding:8px}
                        .label{font-size:10px;color:#666;text-transform:uppercase}.val{font-weight:700}</style></head><body>
                        <h1>${shop.name} · Sales report</h1>
                        <p>${reportFrom} → ${reportTo}</p>
                        <div class="grid">
                          <div class="card"><div class="label">Total</div><div class="val">${formatRupees(report.totalRevenue)}</div></div>
                          <div class="card"><div class="label">Counter</div><div class="val">${report.posCount} · ${formatRupees(report.posRevenue)}</div></div>
                          <div class="card"><div class="label">Cash</div><div class="val">${formatRupees(report.cashSales)}</div></div>
                          <div class="card"><div class="label">Net</div><div class="val">${formatRupees(report.netProfitEstimate)}</div></div>
                        </div>
                        <h2 style="font-size:14px">Top items</h2>
                        <table><thead><tr><th>Item</th><th>Qty</th><th>Revenue</th></tr></thead><tbody>${rows || "<tr><td colspan=3>No sales</td></tr>"}</tbody></table>
                        <script>window.onload=()=>{window.print();}</script>
                        </body></html>`);
                      w.document.close();
                    }}
                    className="rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white"
                  >
                    Print
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
                {[
                  { label: "Total sales", value: formatRupees(report.totalRevenue) },
                  {
                    label: "Online",
                    value: `${report.onlineCount} · ${formatRupees(report.onlineRevenue)}`,
                  },
                  {
                    label: "Counter",
                    value: `${report.posCount} · ${formatRupees(report.posRevenue)}`,
                  },
                  { label: "Cash", value: formatRupees(report.cashSales) },
                  { label: "Udhaar", value: formatRupees(report.creditSales) },
                  { label: "COGS", value: formatRupees(report.cogsEstimate) },
                  { label: "Gross", value: formatRupees(report.grossProfitEstimate) },
                  { label: "Expenses", value: formatRupees(report.expenseTotal) },
                  { label: "Net", value: formatRupees(report.netProfitEstimate) },
                  { label: "Refunds", value: formatRupees(report.refundedTotal) },
                  { label: "Open", value: String(report.pendingCount) },
                ].map((c) => (
                  <div
                    key={c.label}
                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-500">
                      {c.label}
                    </p>
                    <p className="mt-0.5 text-[12px] font-extrabold tabular-nums text-zinc-900 dark:text-zinc-100">
                      {c.value}
                    </p>
                  </div>
                ))}
              </div>
              <div className="grid gap-2 lg:grid-cols-2">
                <div>
                  <h3 className="mb-1 text-[11px] font-extrabold text-zinc-700 dark:text-zinc-300">
                    Top items
                  </h3>
                  <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                    {report.topItems.length === 0 ? (
                      <li className="px-2.5 py-3 text-center text-[11px] text-zinc-500">
                        No sales in this range
                      </li>
                    ) : (
                      report.topItems.map((t) => (
                        <li
                          key={t.name}
                          className="flex justify-between border-b border-zinc-100 px-2.5 py-1.5 text-[11px] last:border-0 dark:border-zinc-800"
                        >
                          <span className="min-w-0 truncate font-semibold">
                            {t.name} ×{t.qty}
                          </span>
                          <span className="shrink-0 font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                            {formatRupees(t.revenue)}
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-1 text-[11px] font-extrabold text-zinc-700 dark:text-zinc-300">
                    Sale history
                  </h3>
                  <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                    {orders
                      .filter((o) => {
                        const t = new Date(o.created_at).getTime();
                        const from = Number.isFinite(reportFromMs)
                          ? reportFromMs
                          : startOfTodayMs();
                        const until = Number.isFinite(reportUntilMs)
                          ? reportUntilMs
                          : Number.POSITIVE_INFINITY;
                        return t >= from && t <= until;
                      })
                      .slice(0, 40)
                      .map((o) => (
                        <li
                          key={o.id}
                          className="flex items-center justify-between gap-2 border-b border-zinc-100 px-2.5 py-1.5 text-[11px] last:border-0 dark:border-zinc-800"
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-semibold">{o.customer_name || "Walk-in"}</span>
                            <span className="text-zinc-400">
                              {" "}
                              ·{" "}
                              {new Date(o.created_at).toLocaleString("en-PK", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            <span className="text-zinc-400">
                              {" "}
                              · {o.source === "pos" ? "Counter" : o.source || "Order"}
                            </span>
                          </span>
                          <span className="shrink-0 font-bold tabular-nums">
                            {formatRupees(o.total_amount)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setAutoPrintBill(true);
                              setBillOrder(o);
                              setLastPrintedOrder(o);
                            }}
                            className="shrink-0 rounded border border-zinc-200 px-1.5 py-0.5 text-[9px] font-bold dark:border-zinc-700"
                          >
                            Print
                          </button>
                        </li>
                      ))}
                    {orders.filter((o) => {
                      const t = new Date(o.created_at).getTime();
                      const from = Number.isFinite(reportFromMs)
                        ? reportFromMs
                        : startOfTodayMs();
                      const until = Number.isFinite(reportUntilMs)
                        ? reportUntilMs
                        : Number.POSITIVE_INFINITY;
                      return t >= from && t <= until;
                    }).length === 0 ? (
                      <li className="px-2.5 py-3 text-center text-[11px] text-zinc-500">
                        No orders in this range
                      </li>
                    ) : null}
                  </ul>
                </div>
              </div>
            </section>
          )}

          {/* CUSTOMERS */}
          {tab === "customers" && settings.enabled && (
            <section className="mx-auto max-w-2xl space-y-2">
              <div>
                <h2 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
                  Customers
                </h2>
                <p className="text-[10px] text-zinc-500">
                  Name + phone save karo · Counter bill pe quick fill ke liye tap
                </p>
              </div>

              <form
                className="grid gap-1.5 rounded-xl border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-[1fr_1fr_1fr_auto]"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const res = await upsertPosCustomer(shop.id, {
                    name: newCustName,
                    phone: newCustPhone,
                    notes: newCustNotes,
                  });
                  if (!res.success) {
                    addToast(res.error, "error");
                    return;
                  }
                  setNewCustName("");
                  setNewCustPhone("");
                  setNewCustNotes("");
                  addToast("Customer saved", "success");
                  await loadCustomers(shop.id);
                }}
              >
                <input
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  placeholder="Name"
                  className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                />
                <input
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  placeholder="Phone"
                  className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                />
                <input
                  value={newCustNotes}
                  onChange={(e) => setNewCustNotes(e.target.value)}
                  placeholder="Notes"
                  className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                />
                <button
                  type="submit"
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  Save
                </button>
              </form>

              <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {customers.length === 0 ? (
                  <li className="p-6 text-center text-xs text-zinc-500">
                    No customers yet
                  </li>
                ) : (
                  customers.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCustName(c.name);
                          setCustPhone(c.phone);
                          setTab("counter");
                          addToast(`Loaded ${c.name}`, "success");
                        }}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/80"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                            {c.name}
                          </p>
                          <p className="text-[11px] text-zinc-500">{c.phone}</p>
                          {c.notes ? (
                            <p className="truncate text-[10px] text-zinc-400">{c.notes}</p>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-[10px] font-semibold text-zinc-400">
                          {c.visit_count} visits
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </section>
          )}

          {!settings.enabled && tab !== "setup" ? (
            <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
              Enable POS from Setup to use modules.
            </p>
          ) : null}
        </main>
      </div>

      {showCamera ? (
        <PosBarcodeCamera
          onCode={(code) => handleBarcodeSubmit(code)}
          onClose={() => setShowCamera(false)}
        />
      ) : null}

      {showBulkAdd ? (
        <PosBulkAddDialog
          products={products}
          favourites={favourites}
          onTryAdd={tryAddProduct}
          onClose={() => setShowBulkAdd(false)}
        />
      ) : null}

      {pendingCustomSave && shop ? (
        <PosSaveCustomItemsModal
          shopId={shop.id}
          shopCategory={shop.category}
          items={pendingCustomSave}
          onClose={() => setPendingCustomSave(null)}
          onToast={addToast}
        />
      ) : null}

      {billOrder && shop ? (
        orderSource(billOrder) === "pos" ||
        (billOrder.notes || "").includes("[POS]") ? (
          <PosReceiptModal
            order={billOrder}
            shop={shop}
            footerNote={settings.receipt_footer}
            cashierLabel={activeStaff?.name || "Cashier"}
            autoPrint={autoPrintBill}
            printTarget={settings.print_target || getPrintTarget()}
            printWidthMm={settings.print_width_mm || 80}
            onClose={() => {
              setBillOrder(null);
              setAutoPrintBill(false);
            }}
          />
        ) : (
          <OrderBillModal
            order={billOrder}
            shop={shop}
            onClose={() => {
              setBillOrder(null);
              setAutoPrintBill(false);
            }}
          />
        )
      ) : null}

      {variantProduct && (
        <div
          className="fixed inset-0 z-[180] flex items-end justify-center bg-black/50 sm:items-center"
          onClick={() => setVariantProduct(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              confirmVariant();
            }
            if (e.key === "Escape") setVariantProduct(null);
          }}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 dark:bg-zinc-900 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold">{variantProduct.name}</h3>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Options select karo — Enter se bill pe add
            </p>
            <div className="mt-3">
              <VariantSelector
                variants={(variantProduct.variants as never) ?? []}
                basePrice={Number(variantProduct.price) || 0}
                baseOriginalPrice={variantProduct.original_price}
                onSelectionChange={setVariantSel}
                compact
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVariantProduct(null)}
                className="rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmVariant}
                className="rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white"
              >
                Add to bill ↵
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
