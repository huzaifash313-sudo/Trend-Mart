"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — New Product Creation Form (Production-Grade)                   */
/*                                                                             */
/*  Features:                                                                   */
/*   - Dynamic Main Category → Sub-Category cascading dropdowns                */
/*   - Mandatory 'Others / General' fallback in every sub-category list        */
/*   - Multi-image upload with drag-and-drop                                   */
/*   - Original/markdown pricing for discount badges                           */
/*   - Stock status selection                                                  */
/*   - Batch-friendly, zero-lag state management                               */
/* -------------------------------------------------------------------------- */

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { ProductFormData, Shop, VariantGroup } from "@/types";
import { PRODUCT_CATEGORIES, CATEGORY_ICONS } from "@/types";
import { fetchShops } from "@/services/shopService";
import { createProduct } from "@/services/productService";
import {
  fetchSubCategories,
  type SubCategoryWithMeta,
} from "@/services/subCategoryService";
import { useToast } from "@/components/Toast";
import ToggleSwitch from "@/components/ToggleSwitch";
import ImageUpload from "@/components/ImageUpload";

// ─── Constants ──────────────────────────────────────────────────────────────

const STOCK_STATUS_OPTIONS = [
  { value: "in_stock", label: "In Stock", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  { value: "low_stock", label: "Low Stock", color: "bg-amber-100 text-amber-700 border-amber-300" },
  { value: "out_of_stock", label: "Out of Stock", color: "bg-red-100 text-red-700 border-red-300" },
  { value: "pre_order", label: "Pre-Order", color: "bg-violet-100 text-violet-700 border-violet-300" },
] as const;

// ─── Icons ──────────────────────────────────────────────────────────────────

function ChevronDownIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

// ─── Form State Type ────────────────────────────────────────────────────────

interface NewProductFormState {
  name: string;
  title: string;
  description: string;
  price: number;
  original_price: string;
  imageUrl: string;
  images: string[];
  category_id: string;
  sub_category_id: string;
  stock_status: string;
  is_available: boolean;
  tags: string[];
  variantGroups: VariantGroup[];
  stockQuantity: number;
  lowStockThreshold: number;
}

const INITIAL_FORM: NewProductFormState = {
  name: "",
  title: "",
  description: "",
  price: 0,
  original_price: "",
  imageUrl: "",
  images: [],
  category_id: "",
  sub_category_id: "",
  stock_status: "in_stock",
  is_available: true,
  tags: [],
  variantGroups: [],
  stockQuantity: 0,
  lowStockThreshold: 5,
};

// ─── Main Component ─────────────────────────────────────────────────────────

export default function NewProductPage() {
  const router = useRouter();
  const { addToast } = useToast();

  // ── Auth & Shop State ────────────────────────────────────────────────────
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [shops, setShops] = useState<Shop[]>([]);
  const [activeShopId, setActiveShopId] = useState<string | null>(null);

  // ── Form State ───────────────────────────────────────────────────────────
  const [form, setForm] = useState<NewProductFormState>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  // ── Dynamic Dropdown State ───────────────────────────────────────────────
  const [subCategories, setSubCategories] = useState<SubCategoryWithMeta[]>([]);
  const [subCategoriesLoading, setSubCategoriesLoading] = useState(false);
  const [subCatError, setSubCatError] = useState<string | null>(null);

  // ── Drag & Drop ──────────────────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);

  // ── Tag input ────────────────────────────────────────────────────────────
  const [tagInput, setTagInput] = useState("");

  // ── Auth Check ───────────────────────────────────────────────────────────
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;
    async function checkAuth() {
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
    checkAuth();
    return () => { cancelled = true; };
  }, [supabase, router]);

  // ── Load Shops ───────────────────────────────────────────────────────────
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
          const saved = typeof window !== "undefined" ? localStorage.getItem("trendmart_active_shop") : null;
          const match = saved ? myShops.find((s) => s.id === saved) : null;
          setActiveShopId(match?.id ?? myShops[0].id);
        }
      } else {
        addToast("Failed to load your shops.", "error");
      }
    }
    loadShops();
    return () => { cancelled = true; };
  }, [userId, activeShopId, addToast]);

  // ── Dynamic Sub-Category Fetching (triggered directly by category change) ─
  const handleCategoryChange = useCallback(
    async (category: string) => {
      // Update category_id immediately (zero lag on the form state)
      setForm((f) => ({ ...f, category_id: category, sub_category_id: "" }));

      if (!category) {
        setSubCategories([]);
        setSubCatError(null);
        return;
      }

      setSubCategoriesLoading(true);
      setSubCatError(null);

      const result = await fetchSubCategories(category);
      if (result.success) {
        setSubCategories(result.data);
        // Auto-select the 'Others / General' fallback as default
        const others = result.data.find((s) => s.is_others);
        setForm((f) => ({
          ...f,
          category_id: category,
          sub_category_id: others?.id ?? "",
        }));
      } else {
        setSubCatError(result.error);
        setSubCategories([]);
      }
      setSubCategoriesLoading(false);
    },
    [],
  );

  // ── Form Handlers ────────────────────────────────────────────────────────

  const updateField = useCallback(
    <K extends keyof NewProductFormState>(
      key: K,
      value: NewProductFormState[K],
    ) => {
      setForm((f) => ({ ...f, [key]: value }));
    },
    [],
  );

  const handleAddTag = useCallback(() => {
    const tag = tagInput.trim();
    if (!tag || form.tags.includes(tag)) return;
    updateField("tags", [...form.tags, tag]);
    setTagInput("");
  }, [tagInput, form.tags, updateField]);

  const handleRemoveTag = useCallback(
    (tag: string) => {
      updateField(
        "tags",
        form.tags.filter((t) => t !== tag),
      );
    },
    [form.tags, updateField],
  );

  const handleAddImage = useCallback(() => {
    if (form.imageUrl && !form.images.includes(form.imageUrl)) {
      updateField("images", [...form.images, form.imageUrl]);
      updateField("imageUrl", "");
    }
  }, [form.imageUrl, form.images, updateField]);

  const handleRemoveImage = useCallback(
    (url: string) => {
      updateField(
        "images",
        form.images.filter((img) => img !== url),
      );
    },
    [form.images, updateField],
  );

  // ── Drag & Drop ──────────────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        if (!file.type.startsWith("image/")) {
          addToast("Please upload an image file (PNG, JPG, WebP).", "error");
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          addToast("Image size must be under 5MB.", "error");
          return;
        }
        addToast(`Image "${file.name}" ready. Use the upload button to add it.`, "info");
      }
    },
    [addToast],
  );

  // ── Form Submission ──────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      if (!activeShopId) {
        addToast("Please select a shop first.", "error");
        return;
      }
      if (!form.name.trim()) {
        addToast("Product name is required.", "error");
        return;
      }
      if (form.price <= 0) {
        addToast("Price must be greater than 0.", "error");
        return;
      }
      if (!form.category_id) {
        addToast("Please select a main category.", "error");
        return;
      }

      setSaving(true);

      const productData: ProductFormData = {
        name: form.name.trim(),
        title: form.title.trim() || form.name.trim(),
        description: form.description.trim(),
        price: form.price,
        original_price: form.original_price
          ? parseFloat(form.original_price)
          : null,
        image_url: form.imageUrl || (form.images.length > 0 ? form.images[0] : ""),
        images: form.images.length > 0 ? form.images : null,
        is_available: form.is_available,
        stock_status: form.stock_status,
        category_id: form.category_id,
        sub_category_id: form.sub_category_id || null,
        variants: form.variantGroups.length > 0 ? form.variantGroups : null,
      };

      try {
        const result = await createProduct(activeShopId, productData);
        if (result.success) {
          addToast("Product created successfully! 🎉", "success");
          const shop = shops.find((s) => s.id === activeShopId);
          if (shop) {
            localStorage.setItem("trendmart_active_shop", shop.id);
          }
          setTimeout(() => {
            router.push("/dashboard/products");
          }, 800);
        } else {
          addToast(result.error ?? "Failed to create product.", "error");
        }
      } catch {
        addToast("An unexpected error occurred.", "error");
      }

      setSaving(false);
    },
    [activeShopId, form, shops, addToast, router],
  );

  // ── Loading State ────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  const activeShop = shops.find((s) => s.id === activeShopId);
  const selectedCategoryIcon = form.category_id
    ? CATEGORY_ICONS[form.category_id] ?? "📦"
    : "📋";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/products"
              className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              <ArrowLeftIcon />
              Products
            </Link>
            <h1 className="text-lg font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              Add New Product
            </h1>
          </div>

          {/* Shop Selector */}
          {shops.length > 1 && (
            <select
              value={activeShopId ?? ""}
              onChange={(e) => {
                setActiveShopId(e.target.value);
                if (e.target.value) {
                  localStorage.setItem("trendmart_active_shop", e.target.value);
                }
              }}
              className="appearance-none rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 pr-7 text-xs font-medium text-zinc-700 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              aria-label="Select shop"
            >
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 pb-24">
        {/* Shop info badge */}
        {activeShop && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-900/20">
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              🏪 Adding product to:{" "}
              <span className="font-bold">{activeShop.name}</span>
              <span className="ml-2 text-emerald-500">
                ({activeShop.category})
              </span>
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ── Section: Basic Information ────────────────────────────────── */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-4 text-base font-bold text-zinc-900 dark:text-zinc-100">
              Basic Information
            </h2>

            {/* Product Name */}
            <div className="mb-4">
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="e.g., Premium Cotton Kurti — Emerald Green"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            {/* Title (optional synonym) */}
            <div className="mb-4">
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Display Title{" "}
                <span className="text-zinc-400 font-normal">
                  (optional, defaults to product name)
                </span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => updateField("title", e.target.value)}
                placeholder="Search-friendly title for marketplace listings"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            {/* Description */}
            <div className="mb-4">
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Description
              </label>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                placeholder="Describe your product — fabric, features, size guide, care instructions..."
                className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            {/* Price Row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Price (PKR) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  step={1}
                  value={form.price || ""}
                  onChange={(e) => updateField("price", Number(e.target.value))}
                  placeholder="2499"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Original Price (PKR){" "}
                  <span className="text-zinc-400 font-normal">
                    — for discount badges
                  </span>
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.original_price}
                  onChange={(e) =>
                    updateField("original_price", e.target.value)
                  }
                  placeholder="3999 (before discount)"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
                {form.original_price &&
                  parseFloat(form.original_price) <= form.price && (
                    <p className="mt-1 text-[0.65rem] text-amber-600 dark:text-amber-400">
                      ⚠️ Original price must be higher than the selling price
                      — this will not show a discount badge.
                    </p>
                  )}
                {form.original_price &&
                  form.price > 0 &&
                  parseFloat(form.original_price) > form.price && (
                    <p className="mt-1 text-[0.65rem] font-semibold text-emerald-600 dark:text-emerald-400">
                      🏷️ Badge preview: -
                      {Math.round(
                        ((parseFloat(form.original_price) - form.price) /
                          parseFloat(form.original_price)) *
                          100,
                      )}
                      % OFF
                    </p>
                  )}
              </div>
            </div>

            {/* Stock Status */}
            <div className="mt-4">
              <label className="mb-2 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Stock Status
              </label>
              <div className="flex flex-wrap gap-2">
                {STOCK_STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateField("stock_status", opt.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                      form.stock_status === opt.value
                        ? `${opt.color} shadow-sm ring-2 ring-offset-1 ring-emerald-500/50`
                        : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Availability Toggle */}
            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
              <ToggleSwitch
                checked={form.is_available}
                onChange={() => updateField("is_available", !form.is_available)}
                label="Toggle product availability"
                visibleLabel="Available for ordering"
              />
              <p className="mt-1.5 text-[0.65rem] text-zinc-400 dark:text-zinc-500">
                When enabled, this product will be visible and purchasable on your storefront.
              </p>
            </div>
          </section>

          {/* ── Section: Category & Sub-Category (Dynamic Dropdowns) ──────── */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-4 text-base font-bold text-zinc-900 dark:text-zinc-100">
              Category & Sub-Category
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Main Category Dropdown */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Main Category <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    required
                    value={form.category_id}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 pr-10 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  >
                    <option value="">— Select Category —</option>
                    {PRODUCT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {CATEGORY_ICONS[cat] ?? "📦"} {cat}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon />
                </div>
              </div>

              {/* Sub-Category Dropdown (Dynamic) */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Sub-Category
                  <span className="ml-1 text-zinc-400 font-normal">
                    — auto-includes &apos;Others&apos;
                  </span>
                </label>
                <div className="relative">
                  <select
                    value={form.sub_category_id}
                    onChange={(e) =>
                      updateField("sub_category_id", e.target.value)
                    }
                    disabled={
                      !form.category_id || subCategoriesLoading
                    }
                    className="w-full appearance-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 pr-10 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  >
                    <option value="">
                      {subCategoriesLoading
                        ? "Loading sub-categories..."
                        : !form.category_id
                          ? "Select a category first"
                          : "— Select Sub-Category —"}
                    </option>
                    {subCategories.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.icon ?? "📦"} {sub.name}
                        {sub.is_others ? " (Default)" : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon />
                  {subCategoriesLoading && (
                    <span className="absolute right-8 top-1/2 -translate-y-1/2">
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border border-emerald-600 border-t-transparent" />
                    </span>
                  )}
                </div>
                {subCatError && (
                  <p className="mt-1 text-[0.65rem] text-red-500">
                    {subCatError}
                  </p>
                )}
                {form.category_id && !subCategoriesLoading && (
                  <p className="mt-1 text-[0.65rem] text-zinc-400 dark:text-zinc-500">
                    {subCategories.length} sub-categor
                    {subCategories.length !== 1 ? "ies" : "y"} available
                    {subCategories.some((s) => s.is_others) &&
                      " · 'Others / General' included"}
                  </p>
                )}
              </div>
            </div>

            {/* Selected category preview */}
            {form.category_id && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  {selectedCategoryIcon} {form.category_id}
                </span>
                {form.sub_category_id && (
                  <>
                    <span className="text-xs text-zinc-300 dark:text-zinc-600">
                      →
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                      {subCategories.find((s) => s.id === form.sub_category_id)
                        ?.icon ?? "📦"}{" "}
                      {subCategories.find((s) => s.id === form.sub_category_id)
                        ?.name ?? "Unknown"}
                    </span>
                  </>
                )}
              </div>
            )}
          </section>

          {/* ── Section: Images ────────────────────────────────────────────── */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-4 text-base font-bold text-zinc-900 dark:text-zinc-100">
              Product Images
            </h2>

            {/* Primary Image Upload */}
            <div className="mb-4">
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Primary Image
              </label>
              <ImageUpload
                label="Product Image"
                currentUrl={form.imageUrl}
                onUploaded={(url) => updateField("imageUrl", url)}
                folder="products"
                fileId="new-product-primary"
                showPreview
              />
            </div>

            {/* Gallery Images */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Additional Gallery Images
              </label>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.imageUrl}
                  onChange={(e) => updateField("imageUrl", e.target.value)}
                  placeholder="Enter image URL..."
                  className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
                <button
                  type="button"
                  onClick={handleAddImage}
                  disabled={!form.imageUrl}
                  className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PlusIcon /> Add
                </button>
              </div>

              {/* Image gallery preview */}
              {form.images.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {form.images.map((img, idx) => (
                    <div
                      key={idx}
                      className="relative overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700"
                    >
                      <img
                        src={img}
                        alt={`Gallery ${idx + 1}`}
                        className="h-24 w-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect fill='%23ddd' width='100' height='100'/></svg>";
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(img)}
                        className="absolute right-1 top-1 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
                        aria-label={`Remove image ${idx + 1}`}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Drag & Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`mt-4 rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
                isDragging
                  ? "border-emerald-400 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-900/20"
                  : "border-zinc-300 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/50"
              }`}
            >
              <UploadIcon />
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Drag & drop an image here, then click &quot;Add&quot;
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                PNG, JPG, WebP up to 5MB
              </p>
            </div>
          </section>

          {/* ── Section: Tags ──────────────────────────────────────────────── */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-4 text-base font-bold text-zinc-900 dark:text-zinc-100">
              Search Tags
            </h2>
            <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
              Tags help customers find your product in search results.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="e.g., cotton, kurti, summer, green"
                className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="rounded-xl bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              >
                Add
              </button>
            </div>

            {form.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {form.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-0.5 text-emerald-500 hover:text-red-500"
                      aria-label={`Remove tag ${tag}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* ── Submit Buttons ──────────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Link
              href="/dashboard/products"
              className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving || !activeShopId}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-700 hover:shadow-emerald-600/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <>
                  <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Saving...
                </>
              ) : (
                "Create Product"
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}