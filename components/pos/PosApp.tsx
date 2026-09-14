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
import {
  applyPackDefaults,
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
  const [miscOpen, setMiscOpen] = useState(false);
  const [miscName, setMiscName] = useState("");
  const [miscPrice, setMiscPrice] = useState("");
  const [miscQty, setMiscQty] = useState("1");
  const queuePrevLenRef = useRef(0);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const excelRef = useRef<PosExcelCounterHandle>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const cashRef = useRef<HTMLInputElement>(null);
  const checkoutRef = useRef<() => void>(() => {});
  const productsMap = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

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
    return [...unique, "setup"] as Tab[];
  }, [settings.enabled, settings.modules]);

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
    const sub = cart.reduce((s, l) => s + l.unitPrice * l.qty, 0);
    const d = Math.max(0, Number(discount) || 0);
    const fee = orderType === "delivery" ? Math.max(0, Number(deliveryFee) || 0) : 0;
    return {
      sub,
      discount: Math.min(d, sub),
      fee,
      total: Math.max(0, sub - Math.min(d, sub) + fee),
    };
  }, [cart, discount, deliveryFee, orderType]);

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
    setCart((prev) => {
      const hit = prev.find((x) => x.key === key);
      if (hit) setUndoLine(hit);
      return prev.filter((x) => x.key !== key);
    });
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
    const key = `custom::${Date.now()}::${Math.random().toString(36).slice(2, 7)}`;
    setCart((prev) => [
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
    ]);
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

  checkoutRef.current = () => {
    void checkout();
  };

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
        checkoutRef.current();
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
      <div className="flex min-h-[70vh] items-center justify-center bg-zinc-100 text-sm text-zinc-500 dark:bg-zinc-950">
        Loading POS…
      </div>
    );
  }

  if (!shop) return null;

  if (needsPin) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-zinc-900 px-4 text-zinc-100">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
          TrendsMart POS
        </p>
        <h1 className="mt-2 text-xl font-bold">{shop.name}</h1>
        <p className="mt-1 text-xs text-zinc-400">Enter staff PIN to unlock cashier</p>
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
        ? { label: "Setup", icon: "⚙️", blurb: "Modules & preferences" }
        : POS_MODULE_META[id];
    const active = tab === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => setTab(id)}
        className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition lg:w-full ${
          active
            ? "bg-emerald-600 text-white shadow-sm"
            : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
        }`}
      >
        <span aria-hidden className="text-sm">
          {meta.icon}
        </span>
        <span className="flex-1">{meta.label}</span>
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
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-zinc-100 dark:bg-zinc-950 lg:flex-row">
      {/* Desktop left nav */}
      <aside className="hidden w-52 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 text-zinc-100 lg:flex">
        <div className="border-b border-zinc-800 px-3 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400">
            TrendsMart POS
          </p>
          <p className="mt-1 truncate text-sm font-bold">{shop.name}</p>
          <p className="mt-0.5 truncate text-[10px] text-zinc-400">{posPackLabel(settings.pack)}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2" aria-label="POS modules">
          {enabledTabs.map(navBtn)}
        </nav>
        <div className="border-t border-zinc-800 p-3 text-[10px] text-zinc-500">
          <Link href="/dashboard/orders" className="hover:text-zinc-300">
            Full orders →
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ERP header */}
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-2.5 text-zinc-100 sm:px-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400 lg:hidden">
              TrendsMart POS
            </p>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h1 className="truncate text-sm font-bold sm:text-base">{shop.name}</h1>
              <span className="text-[11px] text-zinc-400">{posPackLabel(settings.pack)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                online
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-amber-500/20 text-amber-300"
              }`}
            >
              {online ? "Online" : "Offline"}
            </span>
            {offlinePending > 0 ? (
              <span className="rounded-full bg-amber-600/30 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                {offlinePending} queued
              </span>
            ) : null}
            <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-[10px] font-semibold text-zinc-200">
              Cashier unlocked
            </span>
            {settings.staff_pin && settings.staff_pin.trim().length >= 4 ? (
              <button
                type="button"
                onClick={() => setUnlocked(false)}
                className="rounded-md border border-zinc-600 px-2 py-0.5 text-[10px] font-semibold text-zinc-300 hover:bg-zinc-800"
              >
                Lock
              </button>
            ) : null}
            <Link
              href="/dashboard/orders"
              className="hidden rounded-md border border-zinc-600 px-2 py-0.5 text-[10px] font-semibold text-zinc-300 hover:bg-zinc-800 sm:inline"
            >
              Orders
            </Link>
          </div>
        </header>

        {/* Mobile horizontal tabs */}
        <nav
          className="flex gap-1 overflow-x-auto border-b border-zinc-800 bg-zinc-900 px-2 py-1.5 lg:hidden"
          aria-label="POS sections"
        >
          {enabledTabs.map(navBtn)}
        </nav>

        <main className="flex-1 overflow-y-auto p-3 sm:p-4">
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
                <button
                  type="button"
                  className="mt-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400"
                  onClick={() => {
                    const pack = suggestPosPack(shop.category);
                    setSettings((s) => applyPackDefaults(pack, s));
                  }}
                >
                  Suggest from store category ({shop.category})
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

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-zinc-500">
                    Staff PIN (4+ digits, optional)
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
                </div>
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
            <section className="grid gap-4 lg:grid-cols-[1.25fr_0.95fr]">
              <div className="space-y-3">
                <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                  {products.length} catalog product{products.length === 1 ? "" : "s"} ready
                  for billing — same as your online store. Optional POS fields: Inventory →
                  Catalog setup.
                </p>
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
                    className="hidden rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-bold dark:border-zinc-700 dark:bg-zinc-900 md:inline-flex"
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

                {showShortcuts ? (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] dark:border-zinc-700 dark:bg-zinc-900">
                    <p className="font-bold text-zinc-700 dark:text-zinc-200">Keyboard</p>
                    <ul className="mt-1 grid gap-0.5 text-zinc-600 sm:grid-cols-2 dark:text-zinc-400">
                      <li>Alt+F — search focus</li>
                      <li>Alt+S — complete sale</li>
                      <li>Alt+C — clear bill</li>
                      <li>Alt+Z — undo remove</li>
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
                    decimalQty={settings.decimal_qty}
                    barcodeEnabled={settings.barcode_enabled}
                    lowStockThreshold={settings.low_stock_threshold}
                    onTryAdd={tryAddProduct}
                    onSetQty={updateCartLineQty}
                    onSetUnitPrice={updateCartLinePrice}
                    onRemove={removeCartLine}
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
                              <img
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

              <div className="flex flex-col rounded-2xl border border-zinc-800/10 bg-white p-3 shadow-md dark:border-zinc-700 dark:bg-zinc-900 sm:p-4 lg:sticky lg:top-3">
                <div className="flex items-center justify-between gap-2 border-b border-zinc-100 pb-2 dark:border-zinc-800">
                  <div>
                    <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Bill</h2>
                    <p className="truncate text-[10px] text-zinc-500">
                      {(settings.counter_layout || "excel") === "excel"
                        ? "Quick search"
                        : "Menu"}
                      {" · "}
                      {shop.name}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={!undoLine}
                      onClick={undoRemove}
                      className="rounded-lg border border-zinc-200 px-2 py-1 text-[10px] font-bold disabled:opacity-40 dark:border-zinc-700"
                    >
                      Undo
                    </button>
                    <button
                      type="button"
                      disabled={cart.length === 0}
                      onClick={holdBill}
                      className="rounded-lg border border-zinc-200 px-2 py-1 text-[10px] font-bold disabled:opacity-40 dark:border-zinc-700"
                    >
                      Hold
                    </button>
                    <button
                      type="button"
                      disabled={cart.length === 0}
                      onClick={clearBill}
                      className="rounded-lg border border-zinc-200 px-2 py-1 text-[10px] font-bold disabled:opacity-40 dark:border-zinc-700"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {cart.length === 0 ? (
                  <p className="mt-6 text-center text-xs text-zinc-500">
                    {(settings.counter_layout || "excel") === "excel"
                      ? "Search + Enter on the grid to add"
                      : "Tap products to add"}
                  </p>
                ) : (settings.counter_layout || "excel") === "excel" ? (
                  <p className="mt-3 text-center text-xs font-medium text-zinc-500">
                    {cart.length} lines · see grid
                  </p>
                ) : (
                  <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                    {cart.map((l) => (
                      <li
                        key={l.key}
                        className="flex items-start justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-zinc-800 dark:text-zinc-100">
                            {l.name}
                          </p>
                          {l.variant ? (
                            <p className="text-[10px] text-zinc-500">{l.variant}</p>
                          ) : null}
                          <div className="mt-1 flex items-center gap-2">
                            <button
                              type="button"
                              className="h-6 w-6 rounded bg-zinc-100 font-bold dark:bg-zinc-800"
                              onClick={() =>
                                updateCartLineQty(
                                  l.key,
                                  bumpQty(
                                    l.qty,
                                    -qtyStep(settings.decimal_qty),
                                    settings.decimal_qty,
                                  ),
                                )
                              }
                            >
                              −
                            </button>
                            {settings.decimal_qty ? (
                              <input
                                type="number"
                                min={0.25}
                                step={0.25}
                                value={l.qty}
                                onChange={(e) => {
                                  const v = Math.max(0.25, Number(e.target.value) || 0.25);
                                  updateCartLineQty(l.key, v);
                                }}
                                className="w-14 rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 text-center tabular-nums dark:border-zinc-700 dark:bg-zinc-800"
                              />
                            ) : (
                              <span className="tabular-nums">{l.qty}</span>
                            )}
                            <button
                              type="button"
                              className="h-6 w-6 rounded bg-zinc-100 font-bold dark:bg-zinc-800"
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
                            <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                              @
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={l.unitPrice}
                                onChange={(e) =>
                                  updateCartLinePrice(l.key, Number(e.target.value) || 0)
                                }
                                className="w-16 rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 text-center tabular-nums dark:border-zinc-700 dark:bg-zinc-800"
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
                        <p className="shrink-0 font-bold tabular-nums">
                          {formatRupees(l.unitPrice * l.qty)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3 flex gap-1.5">
                  {(["pickup", "delivery"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setOrderType(t)}
                      className={`flex-1 rounded-lg py-1.5 text-[11px] font-bold capitalize ${
                        orderType === t
                          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    placeholder="Name (optional)"
                    className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                  />
                  <input
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    placeholder="Phone (optional)"
                    className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>

                {customerQuickPick.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {customerQuickPick.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCustName(c.name);
                          setCustPhone(c.phone);
                        }}
                        className="rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      >
                        {c.name} · {c.phone}
                      </button>
                    ))}
                  </div>
                ) : null}

                {settings.token_mode ? (
                  <input
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Token / queue #"
                    className="mt-2 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                  />
                ) : null}

                {orderType === "delivery" ? (
                  <input
                    value={deliveryFee}
                    onChange={(e) => setDeliveryFee(e.target.value)}
                    type="number"
                    min={0}
                    placeholder="Delivery fee Rs."
                    className="mt-2 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                  />
                ) : null}

                <label className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
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
                  Split payment
                </label>

                {splitPay ? (
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {(
                      [
                        ["cash", "Cash"],
                        ["jazzcash", "JazzCash"],
                        ["easypaisa", "Easypaisa"],
                        ["card", "Card"],
                        ["credit", "Udhaar"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="text-[10px] text-zinc-500">
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
                          className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                        />
                      </label>
                    ))}
                    <p className="col-span-2 text-[10px] text-zinc-500">
                      Split total {formatRupees(splitSum(split))} · bill{" "}
                      {formatRupees(cartTotal.total)}
                      {Math.abs(splitSum(split) - cartTotal.total) > 2 ? (
                        <span className="font-semibold text-amber-600"> · mismatch</span>
                      ) : null}
                    </p>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
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
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
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
                  <div className="mt-2 space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                      Cash received · Shift+Enter
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
                      className="w-full rounded-lg border-2 border-emerald-500/50 bg-emerald-50/50 px-2 py-2 text-sm font-bold tabular-nums dark:border-emerald-700 dark:bg-emerald-950/20"
                    />
                    <div className="grid grid-cols-7 gap-1">
                      {[50, 100, 200, 500, 1000, 2000, 5000].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() =>
                            setCashReceived(String(cashPaidNum + val))
                          }
                          className="rounded-md border border-zinc-200 py-1 text-[10px] font-bold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setCashReceived(String(cartTotal.total))}
                        className="rounded-md border border-zinc-200 px-2 py-1 text-[10px] font-bold dark:border-zinc-700"
                      >
                        Exact
                      </button>
                      <button
                        type="button"
                        onClick={() => setCashReceived("")}
                        className="rounded-md border border-zinc-200 px-2 py-1 text-[10px] font-bold dark:border-zinc-700"
                      >
                        Clear
                      </button>
                    </div>
                    {changeDue > 0 ? (
                      <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2">
                        <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">
                          Change / wapas
                        </span>
                        <span className="text-lg font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                          {formatRupees(changeDue)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <input
                  ref={discountRef}
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  type="number"
                  min={0}
                  placeholder="Discount Rs. (Alt+G)"
                  className="mt-2 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                />
                <textarea
                  value={billNotes}
                  onChange={(e) => setBillNotes(e.target.value)}
                  rows={2}
                  placeholder={
                    settings.pack === "electronics"
                      ? "IMEI / serial / notes"
                      : settings.pack === "pharmacy"
                        ? "Rx reminder / notes"
                        : "Bill notes"
                  }
                  className="mt-2 w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
                />

                <div className="mt-3 space-y-0.5 text-sm">
                  {cartTotal.discount > 0 || cartTotal.fee > 0 ? (
                    <>
                      <div className="flex justify-between text-xs text-zinc-500">
                        <span>Subtotal</span>
                        <span>{formatRupees(cartTotal.sub)}</span>
                      </div>
                      {cartTotal.discount > 0 ? (
                        <div className="flex justify-between text-xs text-zinc-500">
                          <span>Discount</span>
                          <span>−{formatRupees(cartTotal.discount)}</span>
                        </div>
                      ) : null}
                      {cartTotal.fee > 0 ? (
                        <div className="flex justify-between text-xs text-zinc-500">
                          <span>Delivery</span>
                          <span>{formatRupees(cartTotal.fee)}</span>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  <div className="flex items-center justify-between rounded-xl bg-zinc-900 px-3 py-2.5 text-white dark:bg-emerald-950">
                    <span className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
                      Total
                    </span>
                    <span className="text-xl font-black tabular-nums tracking-tight">
                      {formatRupees(cartTotal.total)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busy || cart.length === 0}
                  onClick={() => void checkout()}
                  className="mt-3 w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-500 disabled:opacity-50"
                >
                  {busy
                    ? "Saving…"
                    : settings.auto_print_receipt !== false
                      ? "Complete & Print (Alt+S)"
                      : "Complete sale (Alt+S)"}
                </button>

                {lastReceipt ? (
                  <div className="mt-2 flex gap-1.5">
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
                      className="flex-1 rounded-lg border border-zinc-200 py-2 text-[11px] font-bold dark:border-zinc-700"
                    >
                      Print again
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyReceipt()}
                      className="flex-1 rounded-lg border border-zinc-200 py-2 text-[11px] font-bold dark:border-zinc-700"
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={shareReceiptWhatsApp}
                      className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50 py-2 text-[11px] font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
                    >
                      WhatsApp
                    </button>
                  </div>
                ) : null}
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
          {tab === "reports" && settings.enabled && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Sales & profit
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-[11px] text-zinc-500">
                    From
                    <input
                      type="date"
                      value={reportFrom}
                      onChange={(e) => setReportFrom(e.target.value)}
                      className="ml-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                    />
                  </label>
                  <label className="text-[11px] text-zinc-500">
                    To
                    <input
                      type="date"
                      value={reportTo}
                      onChange={(e) => setReportTo(e.target.value)}
                      className="ml-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                    />
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
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
                  { label: "Cash sales", value: formatRupees(report.cashSales) },
                  { label: "Udhaar sales", value: formatRupees(report.creditSales) },
                  { label: "COGS (est.)", value: formatRupees(report.cogsEstimate) },
                  { label: "Gross profit", value: formatRupees(report.grossProfitEstimate) },
                  { label: "Expenses", value: formatRupees(report.expenseTotal) },
                  { label: "Net (gross−exp)", value: formatRupees(report.netProfitEstimate) },
                  { label: "Refunds", value: formatRupees(report.refundedTotal) },
                  { label: "Open tickets", value: String(report.pendingCount) },
                ].map((c) => (
                  <div
                    key={c.label}
                    className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <p className="text-[10px] font-semibold uppercase text-zinc-500">
                      {c.label}
                    </p>
                    <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {c.value}
                    </p>
                  </div>
                ))}
              </div>
              <div>
                <h3 className="mb-2 text-xs font-bold text-zinc-600 dark:text-zinc-400">
                  Top items
                </h3>
                <ul className="space-y-1.5">
                  {report.topItems.length === 0 ? (
                    <li className="text-xs text-zinc-500">No sales in this range</li>
                  ) : (
                    report.topItems.map((t) => (
                      <li
                        key={t.name}
                        className="flex justify-between rounded-lg bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-900"
                      >
                        <span className="font-medium">
                          {t.name} ×{t.qty}
                        </span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">
                          {formatRupees(t.revenue)}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </section>
          )}

          {/* CUSTOMERS */}
          {tab === "customers" && settings.enabled && (
            <section className="mx-auto max-w-lg space-y-4">
              <div>
                <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Walk-in customers
                </h2>
                <p className="text-[11px] text-zinc-500">
                  Tap a contact to fill the counter bill. Add new numbers below.
                </p>
              </div>

              <form
                className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
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
                  placeholder="Name (optional)"
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
                <input
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  placeholder="Phone (optional)"
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
                <input
                  value={newCustNotes}
                  onChange={(e) => setNewCustNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
                <button
                  type="submit"
                  className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  Save customer
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

      {billOrder && shop ? (
        orderSource(billOrder) === "pos" ||
        (billOrder.notes || "").includes("[POS]") ? (
          <PosReceiptModal
            order={billOrder}
            shop={shop}
            footerNote={settings.receipt_footer}
            cashierLabel="Cashier"
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
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 dark:bg-zinc-900 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold">{variantProduct.name}</h3>
            <div className="mt-3">
              <VariantSelector
                variants={(variantProduct.variants as never) ?? []}
                basePrice={Number(variantProduct.price) || 0}
                baseOriginalPrice={variantProduct.original_price}
                onSelectionChange={setVariantSel}
                compact
              />
            </div>
            <button
              type="button"
              onClick={confirmVariant}
              className="mt-4 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white"
            >
              Add to bill
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
