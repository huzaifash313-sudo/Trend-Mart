"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Enterprise Product & Inventory Management Engine              */
/*                                                                             */
/*  Features:                                                                  */
/*   - Multi-attribute variant management (color swatches, clothing sizes)     */
/*   - In Stock / Out of Stock availability toggle                             */
/*   - Discounted pricing tiers                                                 */
/*   - Drag-and-drop image association with validation                         */
/*   - Real-time product availability updates                                   */
/*   - Atomic database transactions via Supabase                                */
/*   - CSV bulk import/export for products                                      */
/*   - Advanced filtering, sorting, and search                                  */
/* -------------------------------------------------------------------------- */

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { scopedKey } from "@/lib/clientScope";
import type {
  Product,
  ProductFormData,
  PriceTier,
  VariantGroup,
  Shop,
  AnalyticsSummary,
} from "@/types";
import {
  fetchProductsByShopId,
  createProduct,
  updateProduct,
  deleteProduct,
  bulkUpdateAvailability,
} from "@/services/productService";
import { fetchShops } from "@/services/shopService";
import { fetchAnalyticsSummary } from "@/services/analyticsService";
import { downloadProductsCSV } from "@/services/exportService";
import { getProductDiscount } from "@/lib/formatters";
import MultiImageUpload from "@/components/MultiImageUpload";
import VariantEditor from "@/components/VariantEditor";
import PriceTierEditor from "@/components/PriceTierEditor";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmProvider";
import CustomSelect from "@/components/CustomSelect";
import ToggleSwitch from "@/components/ToggleSwitch";
import Link from "next/link";
import { getProductImages, normalizeProductGallery } from "@/lib/productImages";
import { normalizeTiers } from "@/lib/priceTiers";
import {
  fetchSubCategories,
  getOthersSubCategoryId,
  resolveSubCategoryId,
  type SubCategoryWithMeta,
} from "@/services/subCategoryService";
import { isValidUUID } from "@/lib/sanitization";
import { getProductNamePlaceholder } from "@/lib/productPlaceholders";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Tell the storefront cache a product changed (invalidate marketplace/home). */
function emitProductsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("trendmart:products-updated"));
  }
}

interface ProductFormState {
  name: string;
  description: string;
  basePrice: number;
  /** Original ("before discount") price as a string form field. Empty = no markdown badge. */
  originalPrice: string;
  /** ISO deal end; empty = no expiry on discount. */
  dealExpiresAt: string;
  imageUrl: string;
  isAvailable: boolean;
  /** SKU prefix auto-generated from product name */
  skuPrefix: string;
  /** Multi-attribute variants */
  variantGroups: VariantGroup[];
  /** Discounted pricing tiers */
  priceTiers: PriceTier[];
  /** Additional product images */
  galleryImages: string[];
  /** Product tags for search */
  tags: string[];
  /** Sub-category UUID under the shop's main category */
  subCategoryId: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const INITIAL_PRODUCT_FORM: ProductFormState = {
  name: "",
  description: "",
  basePrice: 0,
  originalPrice: "",
  dealExpiresAt: "",
  imageUrl: "",
  isAvailable: true,
  skuPrefix: "",
  variantGroups: [],
  priceTiers: [],
  galleryImages: [],
  tags: [],
  subCategoryId: "",
};

// ─── Inline Icons ───────────────────────────────────────────────────────────

function TrashIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>); }
function SaveIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>); }
function PackageIcon() { return (<svg className="h-8 w-8 text-zinc-300 dark:text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>); }
function UploadIcon() { return (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>); }
function DownloadIcon() { return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>); }

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ProductsDashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { addToast } = useToast();
  const { confirm } = useConfirm();

  // ── State ───────────────────────────────────────────────────────────────
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeShopId, setActiveShopId] = useState<string | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);

  // Product form state
  const [form, setForm] = useState<ProductFormState>(INITIAL_PRODUCT_FORM);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Bulk operations
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [bulkDiscountPercent, setBulkDiscountPercent] = useState("");

  // Search & filter
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "available" | "sold_out">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "price_asc" | "price_desc" | "name">("newest");

  // CSV import
  const [csvImporting, setCsvImporting] = useState(false);

  // Sub-categories for active shop
  const [subCategories, setSubCategories] = useState<SubCategoryWithMeta[]>([]);
  const activeShop = shops.find((s) => s.id === activeShopId) ?? null;

  useEffect(() => {
    const cat = activeShop?.category;
    if (!cat) {
      setSubCategories([]);
      return;
    }
    let cancelled = false;
    fetchSubCategories(cat).then((result) => {
      if (cancelled) return;
      if (result.success) {
        setSubCategories(result.data);
        const others = result.data.find((s) => s.is_others);
        setForm((f) => ({
          ...f,
          subCategoryId: f.subCategoryId || others?.id || "",
        }));
      } else {
        setSubCategories([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeShop?.category]);

  // ── Auth check ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function checkSession() {
      const { data } = await supabase.auth.getUser();
      if (!cancelled) {
        if (!data.user) {
          router.replace("/auth");
        } else {
          setUserId(data.user.id);
        }
        setAuthLoading(false);
      }
    }
    checkSession();
    return () => { cancelled = true; };
  }, [supabase.auth, router]);

  // ── Load shops ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function loadShops() {
      const result = await fetchShops();
      if (cancelled) return;
      if (result.success) {
        const myShops = result.data.filter((s) => s.owner_id === userId);
        setShops(myShops);
        if (myShops.length > 0 && !activeShopId) {
          const saved = typeof window !== "undefined" ? localStorage.getItem(scopedKey("trendmart_active_shop")) : null;
          const match = saved ? myShops.find(s => s.id === saved) : null;
          setActiveShopId(match?.id ?? myShops[0].id);
        }
      }
    }
    loadShops();
    return () => { cancelled = true; };
  }, [userId, activeShopId]);

  // ── Load products & analytics ───────────────────────────────────────────
  useEffect(() => {
    if (!activeShopId) return;
    let cancelled = false;

    async function loadData() {
      setProductsLoading(true);
      const [productResult, analyticsResult] = await Promise.all([
        fetchProductsByShopId(activeShopId!),
        fetchAnalyticsSummary(activeShopId!),
      ]);
      if (!cancelled) {
        if (productResult.success) setProducts(productResult.data);
        if (analyticsResult.success) setAnalytics(analyticsResult.data);
        setProductsLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, [activeShopId]);

  // ── Derived: filtered & sorted products ─────────────────────────────────
  const filteredProducts = useMemo(() => {
    let filtered = [...products];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter === "available") filtered = filtered.filter(p => p.is_available);
    if (statusFilter === "sold_out") filtered = filtered.filter(p => !p.is_available);

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "newest": return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
        case "oldest": return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
        case "price_asc": return a.price - b.price;
        case "price_desc": return b.price - a.price;
        case "name": return a.name.localeCompare(b.name);
        default: return 0;
      }
    });

    return filtered;
  }, [products, searchQuery, statusFilter, sortBy]);

  // ── SKU Generation ──────────────────────────────────────────────────────
  const generateSkuPrefix = useCallback((name: string): string => {
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
    }
    return name.slice(0, 3).toUpperCase();
  }, []);

  // ── Form Handlers ───────────────────────────────────────────────────────

  const handleNameChange = useCallback((name: string) => {
    setForm(f => ({
      ...f,
      name,
      skuPrefix: generateSkuPrefix(name),
    }));
  }, [generateSkuPrefix]);

  const addTag = useCallback((tag: string) => {
    if (!tag.trim() || form.tags.includes(tag.trim())) return;
    setForm(f => ({ ...f, tags: [...f.tags, tag.trim()] }));
  }, [form.tags]);

  const removeTag = useCallback((tag: string) => {
    setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }));
  }, []);

  // ── Form Submission ─────────────────────────────────────────────────────

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!activeShopId) return;
    if (!form.name.trim()) { addToast("Product name is required.", "error"); return; }
    if (form.basePrice <= 0) { addToast("Price must be greater than 0.", "error"); return; }

    setFormSaving(true);

    const shopCat = shops.find((s) => s.id === activeShopId)?.category ?? "";
    let subId = form.subCategoryId;
    if (subId && !isValidUUID(subId) && shopCat) {
      const resolved = await resolveSubCategoryId(shopCat, subId);
      subId = resolved ?? "";
    }
    if ((!subId || !isValidUUID(subId)) && shopCat) {
      const othersId = await getOthersSubCategoryId(shopCat);
      subId = isValidUUID(othersId) ? othersId : "";
    }

    const gallery = normalizeProductGallery(
      form.galleryImages.length > 0
        ? form.galleryImages
        : form.imageUrl
          ? [form.imageUrl]
          : [],
    );
    const original = form.originalPrice ? parseFloat(form.originalPrice) : null;
    const hasDeal =
      original != null && Number.isFinite(original) && original > form.basePrice;
    const cleanTiers = normalizeTiers(form.priceTiers);
    const productData: ProductFormData = {
      name: form.name.trim(),
      description: form.description.trim(),
      price: form.basePrice,
      original_price: hasDeal ? original : null,
      deal_expires_at:
        hasDeal && form.dealExpiresAt.trim()
          ? new Date(form.dealExpiresAt).toISOString()
          : null,
      image_url: gallery.image_url,
      images: gallery.images,
      is_available: form.isAvailable,
      stock_status: form.isAvailable ? "in_stock" : "out_of_stock",
      // Availability toggle only — no numeric stock counts.
      variants: form.variantGroups.length > 0 ? form.variantGroups : null,
      price_tiers: cleanTiers.length > 0 ? cleanTiers : null,
      category_id: shopCat || null,
      sub_category_id: subId && isValidUUID(subId) ? subId : null,
    };

    try {
      const result = editingProductId
        ? await updateProduct(editingProductId, productData)
        : await createProduct(activeShopId, productData);

      if (result.success) {
        addToast(
          editingProductId ? "Product updated successfully!" : "Product created successfully!",
          "success"
        );
        emitProductsChanged();

        // Refresh products list
        const refreshed = await fetchProductsByShopId(activeShopId);
        if (refreshed.success) setProducts(refreshed.data);

        // Reset form
        setForm(INITIAL_PRODUCT_FORM);
        setEditingProductId(null);
      } else {
        addToast(result.error ?? "Failed to save product.", "error");
      }
    } catch {
      addToast("An unexpected error occurred. Please try again.", "error");
    }

    setFormSaving(false);
  }, [activeShopId, form, editingProductId, addToast, shops]);

  const handleEdit = useCallback((product: Product) => {
    setEditingProductId(product.id);
    const gallery = getProductImages(product);
    setForm({
      name: product.name,
      description: product.description,
      basePrice: product.price,
      originalPrice:
        product.original_price != null ? String(product.original_price) : "",
      dealExpiresAt: product.deal_expires_at ?? "",
      imageUrl: gallery[0] ?? "",
      isAvailable: product.is_available,
      skuPrefix: generateSkuPrefix(product.name),
      variantGroups: product.variants ?? [],
      priceTiers: product.price_tiers ?? [],
      galleryImages: gallery,
      tags: [],
      subCategoryId: product.sub_category_id ?? "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [generateSkuPrefix]);

  const handleDelete = useCallback(async (productId: string) => {
    if (!(await confirm("Delete this product and all its variants permanently? This action cannot be undone."))) return;

    const result = await deleteProduct(productId);
    if (result.success) {
      setProducts(prev => prev.filter(p => p.id !== productId));
      addToast("Product deleted.", "info");
      emitProductsChanged();
    } else {
      addToast(result.error ?? "Failed to delete product.", "error");
    }
  }, [addToast, confirm]);

  // ── Bulk Operations ─────────────────────────────────────────────────────

  const handleSelectAll = useCallback(() => {
    if (selectedProductIds.size === filteredProducts.length) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(filteredProducts.map(p => p.id)));
    }
  }, [filteredProducts, selectedProductIds.size]);

  const handleToggleSelect = useCallback((productId: string) => {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId); else next.add(productId);
      return next;
    });
  }, []);

  const handleBulkMarkOutOfStock = useCallback(async () => {
    if (selectedProductIds.size === 0) return;
    if (!(await confirm(`Mark ${selectedProductIds.size} product(s) as out of stock?`))) return;

    setBulkActionLoading(true);
    const result = await bulkUpdateAvailability([...selectedProductIds], false);
    if (result.success) {
      addToast(`${selectedProductIds.size} product(s) marked out of stock.`, "success");
      emitProductsChanged();
      const refreshed = await fetchProductsByShopId(activeShopId!);
      if (refreshed.success) setProducts(refreshed.data);
      setSelectedProductIds(new Set());
    } else {
      addToast(result.error ?? "Bulk update failed.", "error");
    }
    setBulkActionLoading(false);
  }, [selectedProductIds, activeShopId, addToast, confirm]);

  const handleBulkMarkInStock = useCallback(async () => {
    if (selectedProductIds.size === 0) return;

    setBulkActionLoading(true);
    const result = await bulkUpdateAvailability([...selectedProductIds], true);
    if (result.success) {
      addToast(`${selectedProductIds.size} product(s) marked as available.`, "success");
      emitProductsChanged();
      const refreshed = await fetchProductsByShopId(activeShopId!);
      if (refreshed.success) setProducts(refreshed.data);
      setSelectedProductIds(new Set());
    } else {
      addToast(result.error ?? "Bulk update failed.", "error");
    }
    setBulkActionLoading(false);
  }, [selectedProductIds, activeShopId, addToast]);

  const handleBulkDiscount = useCallback(async () => {
    if (selectedProductIds.size === 0 || !bulkDiscountPercent) return;
    const percent = parseFloat(bulkDiscountPercent);
    if (isNaN(percent) || percent < 0 || percent > 99) {
      addToast("Please enter a valid discount percentage (0-99).", "error");
      return;
    }

    if (!(await confirm(`Apply ${percent}% discount to ${selectedProductIds.size} product(s)?`))) return;

    setBulkActionLoading(true);
    let successCount = 0;
    for (const id of selectedProductIds) {
      const product = products.find(p => p.id === id);
      if (product) {
        // Use the existing markdown reference price if this product is
        // already discounted (avoids re-discounting an already-discounted
        // price on repeated bulk applications); otherwise the current price
        // becomes the new "original" (strikethrough) price.
        const referenceOriginal =
          product.original_price != null && product.original_price > product.price
            ? product.original_price
            : product.price;
        const newPrice = Math.round(referenceOriginal * (1 - percent / 100));
        const result = await updateProduct(id, {
          name: product.name,
          description: product.description,
          price: newPrice,
          original_price: referenceOriginal,
          image_url: product.image_url ?? "",
          is_available: product.is_available,
        });
        if (result.success) successCount++;
      }
    }

    addToast(`${successCount} product(s) updated with ${percent}% discount.`, "success");
    emitProductsChanged();
    const refreshed = await fetchProductsByShopId(activeShopId!);
    if (refreshed.success) setProducts(refreshed.data);
    setSelectedProductIds(new Set());
    setBulkDiscountPercent("");
    setBulkActionLoading(false);
  }, [selectedProductIds, bulkDiscountPercent, products, activeShopId, addToast, confirm]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedProductIds.size === 0) return;
    if (!(await confirm(`Permanently delete ${selectedProductIds.size} product(s)? This cannot be undone.`))) return;

    setBulkActionLoading(true);
    let successCount = 0;
    for (const id of selectedProductIds) {
      const result = await deleteProduct(id);
      if (result.success) successCount++;
    }
    setProducts(prev => prev.filter(p => !selectedProductIds.has(p.id)));
    setSelectedProductIds(new Set());
    addToast(`${successCount} product(s) deleted.`, successCount > 0 ? "success" : "error");
    if (successCount > 0) emitProductsChanged();
    setBulkActionLoading(false);
  }, [selectedProductIds, addToast, confirm]);

  /** Instantly pause/resume a single product's availability — no need to open the edit form. */
  const handleToggleAvailability = useCallback(async (product: Product) => {
    const nextAvailable = !product.is_available;
    setProducts(prev => prev.map(p => (p.id === product.id ? { ...p, is_available: nextAvailable } : p)));
    const result = await updateProduct(product.id, {
      name: product.name,
      description: product.description,
      price: product.price,
      image_url: product.image_url ?? "",
      is_available: nextAvailable,
    });
    if (result.success) {
      addToast(nextAvailable ? `"${product.name}" is now in stock.` : `"${product.name}" marked out of stock.`, "success");
      emitProductsChanged();
    } else {
      setProducts(prev => prev.map(p => (p.id === product.id ? { ...p, is_available: product.is_available } : p)));
      addToast(result.error, "error");
    }
  }, [addToast]);

  // ── CSV Import ──────────────────────────────────────────────────────────

  const handleCsvImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeShopId) return;

    setCsvImporting(true);
    try {
      const text = await file.text();
      const lines = text.split("\n").filter(l => l.trim());
      if (lines.length < 2) {
        addToast("CSV file must have a header row and at least one data row.", "error");
        setCsvImporting(false);
        return;
      }

      // Parse header
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
      const nameIdx = headers.indexOf("name");
      const priceIdx = headers.indexOf("price");
      const descIdx = headers.indexOf("description");

      if (nameIdx < 0 || priceIdx < 0) {
        addToast("CSV must have 'name' and 'price' columns.", "error");
        setCsvImporting(false);
        return;
      }

      let imported = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map(c => c.trim());
        const name = cols[nameIdx]?.replace(/^"|"$/g, "");
        const price = parseFloat(cols[priceIdx]?.replace(/^"|"$/g, ""));
        const description = descIdx >= 0 ? cols[descIdx]?.replace(/^"|"$/g, "") ?? "" : "";

        if (name && !isNaN(price) && price > 0) {
          const result = await createProduct(activeShopId, {
            name,
            description,
            price,
            image_url: "",
            is_available: true,
          });
          if (result.success) imported++;
        }
      }

      addToast(`${imported} product(s) imported successfully!`, "success");
      if (imported > 0) emitProductsChanged();
      const refreshed = await fetchProductsByShopId(activeShopId);
      if (refreshed.success) setProducts(refreshed.data);
    } catch {
      addToast("Failed to parse CSV file. Please check the format.", "error");
    }
    setCsvImporting(false);
    // Reset file input
    e.target.value = "";
  }, [activeShopId, addToast]);

  // ── CSV Export ──────────────────────────────────────────────────────────

  const handleExportCsv = useCallback(() => {
    if (products.length === 0) { addToast("No products to export.", "error"); return; }
    const shop = shops.find(s => s.id === activeShopId);
    downloadProductsCSV(products, shop?.name ?? "products");
    addToast("Products CSV downloaded!", "success");
  }, [products, shops, activeShopId, addToast]);

  // ── Loading State ───────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[color:var(--tm-surface)]">
      {/* Header */}
      <header className="sticky top-[var(--tm-navbar-sticky-offset)] z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/dashboard" className="shrink-0 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
              ← Dashboard
            </Link>
            <h1 className="truncate text-lg font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              Product & Inventory Manager
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard/products/new"
              className="inline-flex items-center rounded-full border border-emerald-600 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
            >
              Batch Add
            </Link>
            {activeShopId && (
              <Link
                href={`/shop/${activeShopId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                View My Store
              </Link>
            )}
            <CustomSelect
              value={activeShopId ?? ""}
              onChange={(val) => setActiveShopId(val)}
              options={shops.map((s) => ({ value: s.id, label: s.name }))}
              ariaLabel="Select shop"
              pill
              size="sm"
              fullWidth={false}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {/* Quick Stats Bar */}
        {activeShopId && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="tm-panel p-3 text-center">
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{products.length}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Total Products</p>
            </div>
            <div className="tm-panel p-3 text-center">
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{products.filter(p => p.is_available).length}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Available</p>
            </div>
            <div className="tm-panel p-3 text-center">
              <p className="text-xl font-bold text-red-500">{products.filter(p => !p.is_available).length}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Sold Out</p>
            </div>
            <div className="tm-panel p-3 text-center">
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{analytics?.total_product_clicks ?? "—"}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Total Clicks</p>
            </div>
          </div>
        )}

        {/* Product Creation / Edit Form */}
        {activeShopId && (
          <section className="tm-panel p-5">
            <h2 className="mb-4 text-base font-bold text-zinc-900 dark:text-zinc-100">
              {editingProductId ? "Edit Product" : "Add New Product"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Basic Info Row */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    Product Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder={getProductNamePlaceholder(activeShop?.category)}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  {form.skuPrefix && (
                    <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                      SKU Prefix: <span className="font-mono font-bold">{form.skuPrefix}</span>
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    Sub-Category *
                  </label>
                  <CustomSelect
                    value={form.subCategoryId}
                    onChange={(val) => setForm((f) => ({ ...f, subCategoryId: val }))}
                    placeholder={subCategories.length ? "Select" : "No sub-categories"}
                    options={subCategories.map((s) => ({
                      value: s.id,
                      label: `${s.icon ? `${s.icon} ` : ""}${s.name}`,
                    }))}
                  />
                  {activeShop && (
                    <p className="mt-1 text-[0.6rem] text-zinc-400">
                      Store: {activeShop.category}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    Base Price (PKR) *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={1}
                    value={form.basePrice || ""}
                    onChange={(e) => setForm(f => ({ ...f, basePrice: Number(e.target.value) }))}
                    placeholder="Price"
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
              </div>

              {/* Original Price (Markdown / Discount Badge) */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Original Price (PKR){" "}
                  <span className="text-zinc-400 font-normal">— optional, shows a discount badge</span>
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.originalPrice}
                  onChange={(e) => setForm(f => ({ ...f, originalPrice: e.target.value }))}
                  placeholder="Original price"
                  className="w-full max-w-xs rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-300/50 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
                {form.originalPrice && parseFloat(form.originalPrice) <= form.basePrice && (
                  <p className="mt-1 text-[0.65rem] text-amber-600 dark:text-amber-400">
                    ⚠️ Original price must be higher than the base price — this will not show a discount badge.
                  </p>
                )}
                {form.originalPrice && form.basePrice > 0 && parseFloat(form.originalPrice) > form.basePrice && (
                  <p className="mt-1 text-[0.65rem] font-semibold text-emerald-600 dark:text-emerald-400">
                    Badge preview: -{Math.round(((parseFloat(form.originalPrice) - form.basePrice) / parseFloat(form.originalPrice)) * 100)}% OFF
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Deal ends{" "}
                  <span className="font-normal text-zinc-400">— optional</span>
                </label>
                <input
                  type="datetime-local"
                  value={
                    form.dealExpiresAt
                      ? (() => {
                          const d = new Date(form.dealExpiresAt);
                          if (Number.isNaN(d.getTime())) return "";
                          const pad = (n: number) => n.toString().padStart(2, "0");
                          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                        })()
                      : ""
                  }
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      dealExpiresAt: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : "",
                    }))
                  }
                  disabled={
                    !form.originalPrice ||
                    parseFloat(form.originalPrice) <= form.basePrice
                  }
                  className="w-full max-w-xs rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Description <span className="font-normal text-zinc-400">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  maxLength={300}
                  value={form.description}
                  onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Short description"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 resize-none"
                />
              </div>

              <MultiImageUpload
                label="Product photos"
                urls={
                  form.galleryImages.length > 0
                    ? form.galleryImages
                    : form.imageUrl
                      ? [form.imageUrl]
                      : []
                }
                onChange={(urls) => {
                  const g = normalizeProductGallery(urls);
                  setForm((f) => ({
                    ...f,
                    imageUrl: g.image_url,
                    galleryImages: g.images,
                  }));
                }}
                folder="products"
                fileIdPrefix={editingProductId ?? activeShopId ?? "new"}
              />

              {/* Multi-Attribute Variant Builder — always visible */}
              <div>
                <VariantEditor
                  variants={form.variantGroups}
                  onChange={(v) => setForm((f) => ({ ...f, variantGroups: v }))}
                />
              </div>

              {/* Availability only — no numeric stock counts */}
              {form.variantGroups.length > 0 && (
                <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
                  Variants save with this product. Use the <strong>In Stock / Out of Stock</strong> toggle —
                  TrendMart does not track numeric stock quantities.
                </p>
              )}

              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
              >
                {showAdvanced ? "▾ Hide advanced options" : "▸ Show advanced options (tags)"}
              </button>

              {/* Quantity Price Tiers — always visible, live editor */}
              <div>
                <PriceTierEditor
                  tiers={form.priceTiers}
                  onChange={(tiers) => setForm((f) => ({ ...f, priceTiers: tiers }))}
                  basePrice={form.basePrice || undefined}
                />
              </div>

              {/* Tags */}
              {showAdvanced && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    Product Tags
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {form.tags.map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        {tag}
                        <button type="button" onClick={() => removeTag(tag)} className="text-emerald-500 hover:text-emerald-700">×</button>
                      </span>
                    ))}
                    <input
                      type="text"
                      placeholder="Add tag"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTag((e.target as HTMLInputElement).value);
                          (e.target as HTMLInputElement).value = "";
                        }
                      }}
                      className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-900 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                  </div>
                </div>
              )}

              {/* Availability Toggle & Save */}
              <div className="flex items-center gap-4">
                <ToggleSwitch
                  checked={form.isAvailable}
                  onChange={() => setForm(f => ({ ...f, isAvailable: !f.isAvailable }))}
                  label="Toggle product availability"
                  visibleLabel="Available for ordering"
                />
                <div className="ml-auto flex gap-2">
                  {editingProductId && (
                    <button
                      type="button"
                      onClick={() => {
                        setForm(INITIAL_PRODUCT_FORM);
                        setEditingProductId(null);
                      }}
                      className="rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={formSaving}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {formSaving ? "Saving…" : <><SaveIcon />{editingProductId ? "Update Product" : "Done"}</>}
                  </button>
                </div>
              </div>
            </form>
          </section>
        )}

        {/* Product List Section */}
        {activeShopId && (
          <section>
            {/* Toolbar: Search, Filter, Sort, Bulk Actions, Import/Export */}
            <div className="mb-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {/* Search */}
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products"
                  className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />

                {/* Status Filter */}
                <CustomSelect
                  value={statusFilter}
                  onChange={(val) => setStatusFilter(val as typeof statusFilter)}
                  options={[
                    { value: "all", label: "All" },
                    { value: "available", label: "Available" },
                    { value: "sold_out", label: "Sold Out" },
                  ]}
                  size="sm"
                  fullWidth={false}
                />

                {/* Sort */}
                <CustomSelect
                  value={sortBy}
                  onChange={(val) => setSortBy(val as typeof sortBy)}
                  options={[
                    { value: "newest", label: "Newest First" },
                    { value: "oldest", label: "Oldest First" },
                    { value: "price_asc", label: "Price: Low → High" },
                    { value: "price_desc", label: "Price: High → Low" },
                    { value: "name", label: "Name A-Z" },
                  ]}
                  size="sm"
                  fullWidth={false}
                />
              </div>

              {/* Bulk Action Bar */}
              {selectedProductIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 dark:border-emerald-800 dark:bg-emerald-900/20">
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    {selectedProductIds.size} selected
                  </span>
                  <button
                    type="button"
                    onClick={handleBulkMarkInStock}
                    disabled={bulkActionLoading}
                    className="rounded-lg bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-200 disabled:opacity-50 dark:bg-emerald-900/30 dark:text-emerald-400"
                  >
                    Mark Available
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkMarkOutOfStock}
                    disabled={bulkActionLoading}
                    className="rounded-lg bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-200 disabled:opacity-50 dark:bg-amber-900/30 dark:text-amber-400"
                  >
                    Mark Out of Stock
                  </button>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={bulkDiscountPercent}
                      onChange={(e) => setBulkDiscountPercent(e.target.value)}
                      placeholder="Discount %"
                      min={0}
                      max={99}
                      className="w-20 rounded border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={handleBulkDiscount}
                      disabled={bulkActionLoading || !bulkDiscountPercent}
                      className="rounded-lg bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700 hover:bg-purple-200 disabled:opacity-50 dark:bg-purple-900/30 dark:text-purple-400"
                    >
                      Apply Discount
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    disabled={bulkActionLoading}
                    className="ml-auto rounded-lg bg-red-100 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-200 disabled:opacity-50 dark:bg-red-900/30 dark:text-red-400"
                  >
                    Delete Selected
                  </button>
                </div>
              )}

              {/* Import/Export Actions */}
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
                  <UploadIcon />
                  Import CSV
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCsvImport}
                    className="hidden"
                    disabled={csvImporting}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={products.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  <DownloadIcon />
                  Export CSV
                </button>
                {filteredProducts.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                  >
                    {selectedProductIds.size === filteredProducts.length ? "Deselect All" : "Select All"}
                  </button>
                )}
              </div>

              {csvImporting && (
                <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <div className="h-3 w-3 animate-spin rounded-full border border-emerald-500 border-t-transparent" />
                  Importing products from CSV...
                </div>
              )}
            </div>

            {/* Product Grid / List */}
            {productsLoading && (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="tm-panel animate-pulse px-4 py-3">
                    <div className="h-16 rounded bg-zinc-200 dark:bg-zinc-800" />
                  </div>
                ))}
              </div>
            )}

            {!productsLoading && filteredProducts.length === 0 && (
              <div className="tm-panel rounded-2xl border border-dashed border-zinc-300 py-12 text-center dark:border-zinc-700">
                <div className="mb-2 flex justify-center"><PackageIcon /></div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {products.length === 0
                    ? "No products yet. Add your first product above!"
                    : "No products match your search."}
                </p>
              </div>
            )}

            {!productsLoading && filteredProducts.length > 0 && (
              <div className="space-y-2">
                {filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    className={`tm-panel flex items-center gap-3 px-4 py-3 transition-shadow hover:shadow-sm ${
                      selectedProductIds.has(product.id)
                        ? "border-emerald-300 ring-1 ring-emerald-500/20 dark:border-emerald-700"
                        : ""
                    }`}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={selectedProductIds.has(product.id)}
                      onChange={() => handleToggleSelect(product.id)}
                      className="h-3.5 w-3.5 shrink-0 rounded border-zinc-300 text-emerald-600 focus:ring-1 focus:ring-emerald-500 dark:border-zinc-600"
                      aria-label={`Select ${product.name}`}
                    />

                    {/* Image */}
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                      {product.image_url ? (
                        <img src={product.image_url} alt="" className="h-full w-full rounded-lg object-cover" />
                      ) : (
                        <PackageIcon />
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100"
                        title={product.name}
                      >
                        {product.name}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">
                          Rs. {product.price.toLocaleString()}
                        </span>
                        {(() => {
                          const { hasDiscount, originalPrice, discountPercent } = getProductDiscount(product);
                          if (!hasDiscount || originalPrice == null) return null;
                          return (
                            <>
                              <span className="text-zinc-400 line-through">
                                Rs. {originalPrice.toLocaleString()}
                              </span>
                              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-600 dark:bg-red-900/30 dark:text-red-400">
                                -{discountPercent}%
                              </span>
                            </>
                          );
                        })()}
                        <button
                          type="button"
                          onClick={() => handleToggleAvailability(product)}
                          aria-pressed={product.is_available}
                          aria-label={`${product.is_available ? "Mark out of stock" : "Mark in stock"}: ${product.name}`}
                          className={`rounded-full px-1.5 py-0.5 text-xs font-medium transition-colors ${
                            product.is_available
                              ? "bg-emerald-100 text-emerald-600 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50"
                              : "bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                          }`}
                        >
                          {product.is_available ? "Available" : "Sold Out"}
                        </button>
                        {product.variants && product.variants.length > 0 && (
                          <span className="text-zinc-400">
                            {product.variants.reduce((acc, g) => acc * g.options.length, 1)} variants
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleEdit(product)}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(product.id)}
                        className="rounded-lg px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}