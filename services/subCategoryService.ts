/* -------------------------------------------------------------------------- */
/*  TrendMart — Sub-Category Management Service                                */
/*  Fetches sub-categories with mandatory 'Others' fallback per category.       */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import { isValidCategory } from "@/services/categoryService";
import { sanitizeLight, truncate, isValidUUID } from "@/lib/sanitization";
import type { SubCategory } from "@/types";
import {
  getDefaultSubCategories,
  seedSubCategoryId,
} from "@/lib/defaultSubCategories";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SubCategoryWithMeta extends SubCategory {
  /** The parent main category name */
  mainCategory: string;
}

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toError(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

/**
 * Sanitize and validate a category string before using it in database queries.
 * Returns the cleaned category string or empty string if invalid.
 */
function sanitizeCategoryParam(category: string): string {
  if (!category || typeof category !== "string") return "";
  const clean = sanitizeLight(category);
  if (!isValidCategory(clean)) {
    logError(`Rejected invalid category in subCategoryService: "${category}"`, {
      module: "subCategoryService.sanitizeCategoryParam",
      meta: { raw: category, clean },
    });
    return "";
  }
  return clean;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

function buildDefaultSubs(safeCategory: string): SubCategory[] {
  return getDefaultSubCategories(safeCategory).map((def) => ({
    id: seedSubCategoryId(safeCategory, def.slug),
    category: safeCategory,
    name: def.name,
    slug: def.slug,
    description: def.description,
    icon: def.icon,
    is_active: true,
    sort_order: def.sort_order,
    is_others: Boolean(def.is_others),
  }));
}

/**
 * Merge DB rows with the built-in catalog so the UI always shows rich
 * sub-categories (Burgers, Shawarma, Laptop Repair, …) even before SQL seed.
 * Prefer real DB UUIDs when a matching slug already exists.
 */
function mergeWithDefaults(safeCategory: string, dbSubs: SubCategory[]): SubCategory[] {
  const defaults = buildDefaultSubs(safeCategory);
  const bySlug = new Map(dbSubs.map((s) => [s.slug, s]));
  const merged: SubCategory[] = defaults.map((def) => bySlug.get(def.slug) ?? def);

  // Keep any extra custom DB rows not in the built-in catalog
  for (const row of dbSubs) {
    if (!merged.some((m) => m.slug === row.slug)) merged.push(row);
  }

  merged.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  return merged;
}

/**
 * Fetch all sub-categories for a given main category.
 * Always includes the 'Others / General' fallback entry.
 *
 * Merges live DB rows with the built-in Pakistan retail/services catalog so
 * homepage + Add Product never show only an empty / Others-only list.
 */
export async function fetchSubCategories(
  category: string,
): Promise<ServiceResult<SubCategoryWithMeta[]>> {
  // Sanitize and validate category before querying
  const safeCategory = sanitizeCategoryParam(category);
  if (!safeCategory) {
    return { success: false, error: "Invalid category specified." };
  }

  // Fire-and-forget: try to upsert missing rows into Supabase when service role is configured
  if (typeof window !== "undefined") {
    void fetch(`/api/sub-categories/seed?category=${encodeURIComponent(safeCategory)}`, {
      method: "POST",
    }).catch(() => {
      /* seed is best-effort */
    });
  }

  const supabase = createClient();

  try {
    const { data, error } = await supabase
      .from("sub_categories")
      .select("*")
      .eq("category", safeCategory)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;

    const merged = mergeWithDefaults(safeCategory, (data as SubCategory[]) ?? []);

    const result: SubCategoryWithMeta[] = merged.map((s) => ({
      ...s,
      mainCategory: safeCategory,
    }));

    return { success: true, data: result };
  } catch (err) {
    logError(err, {
      module: "subCategoryService.fetchSubCategories",
      meta: { category: safeCategory },
    });
    // Offline / DB down — still return built-in catalog so UI stays usable
    const fallback = mergeWithDefaults(safeCategory, []);
    return {
      success: true,
      data: fallback.map((s) => ({ ...s, mainCategory: safeCategory })),
    };
  }
}

/**
 * Resolve a seed:/fallback sub-category id to a real DB UUID (via seed API).
 * Returns the original id if it is already a UUID.
 */
export async function resolveSubCategoryId(
  category: string,
  subCategoryId: string | null | undefined,
): Promise<string | null> {
  if (!subCategoryId) return null;
  if (isValidUUID(subCategoryId)) return subCategoryId;

  const safeCategory = sanitizeCategoryParam(category);
  if (!safeCategory) return null;

  try {
    const res = await fetch("/api/sub-categories/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: safeCategory, resolveId: subCategoryId }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { id?: string; data?: SubCategory[] };
    if (typeof json.id === "string" && isValidUUID(json.id)) return json.id;
    const match = json.data?.find((s) => s.id === subCategoryId || s.slug);
    // After seed, re-fetch and match by slug from original seed id
    const slug = subCategoryId.includes(":")
      ? subCategoryId.slice(subCategoryId.lastIndexOf(":") + 1)
      : null;
    if (slug && json.data) {
      const row = json.data.find((s) => s.slug === slug);
      if (row && isValidUUID(row.id)) return row.id;
    }
    if (match && isValidUUID(match.id)) return match.id;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Fetch all sub-categories grouped by main category.
 * Useful for preloading the entire taxonomy.
 */
export async function fetchAllSubCategoriesGrouped(): Promise<
  ServiceResult<Record<string, SubCategoryWithMeta[]>>
> {
  const supabase = createClient();

  try {
    const { data, error } = await supabase
      .from("sub_categories")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;

    const subs = (data as SubCategory[]) ?? [];
    const grouped: Record<string, SubCategoryWithMeta[]> = {};

    for (const sub of subs) {
      if (!grouped[sub.category]) {
        grouped[sub.category] = [];
      }
      grouped[sub.category].push({
        ...sub,
        mainCategory: sub.category,
      });
    }

    return { success: true, data: grouped };
  } catch (err) {
    logError(err, { module: "subCategoryService.fetchAllSubCategoriesGrouped" });
    return { success: false, error: toError(err) };
  }
}

/**
 * Look up a single sub-category by its ID.
 */
export async function fetchSubCategoryById(
  subCategoryId: string,
): Promise<ServiceResult<SubCategoryWithMeta | null>> {
  // Validate subCategoryId is a well-formed UUID before querying
  if (!subCategoryId || typeof subCategoryId !== "string" || !isValidUUID(subCategoryId)) {
    return { success: false, error: "Invalid sub-category ID." };
  }

  const supabase = createClient();

  try {
    const { data, error } = await supabase
      .from("sub_categories")
      .select("*")
      .eq("id", subCategoryId)
      .eq("is_active", true)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return { success: true, data: null };
      }
      throw error;
    }

    const sub = data as SubCategory;
    return {
      success: true,
      data: sub ? { ...sub, mainCategory: sub.category } : null,
    };
  } catch (err) {
    logError(err, {
      module: "subCategoryService.fetchSubCategoryById",
      meta: { subCategoryId },
    });
    return { success: false, error: toError(err) };
  }
}

/**
 * Get the 'Others' sub-category ID for a given main category.
 * If not found in DB, returns a synthetic fallback ID.
 */
export async function getOthersSubCategoryId(
  category: string,
): Promise<string> {
  // Sanitize and validate category before querying
  const safeCategory = sanitizeCategoryParam(category);
  if (!safeCategory) {
    return "fallback-others-unknown";
  }

  const supabase = createClient();

  try {
    const { data } = await supabase
      .from("sub_categories")
      .select("id")
      .eq("category", safeCategory)
      .eq("is_others", true)
      .eq("is_active", true)
      .single();

    if (data) return (data as { id: string }).id;
  } catch {
    // Fall through to synthetic
  }

  // Synthetic fallback ID — consistent across calls
  return `fallback-others-${safeCategory.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`;
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  Super-Admin Taxonomy Management                                            */
/*  RLS restricts writes to admins (see sub_categories_admin_manage policy).   */
/* ──────────────────────────────────────────────────────────────────────────── */

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

/**
 * Create a new sub-category under an existing top-level category.
 */
export async function createSubCategory(input: {
  category: string;
  name: string;
  description?: string;
  icon?: string;
  sortOrder?: number;
}): Promise<ServiceResult<SubCategoryWithMeta>> {
  const safeCategory = sanitizeCategoryParam(input.category);
  const name = truncate(sanitizeLight(input.name), 60);
  if (!safeCategory) return { success: false, error: "Invalid main category." };
  if (!name) return { success: false, error: "Sub-category name is required." };

  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("sub_categories")
      .insert({
        category: safeCategory,
        name,
        slug: slugify(name),
        description: truncate(sanitizeLight(input.description ?? ""), 200),
        icon: (input.icon ?? "📦").slice(0, 8),
        sort_order: Number.isFinite(input.sortOrder) ? input.sortOrder : 100,
        is_active: true,
        is_others: false,
      })
      .select()
      .single();

    if (error) throw error;
    const sub = data as SubCategory;
    return { success: true, data: { ...sub, mainCategory: safeCategory } };
  } catch (err) {
    logError(err, { module: "subCategoryService.createSubCategory", meta: { input } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Toggle a sub-category's active state (soft-delete without breaking existing
 * product references, which use `sub_category_id` with ON DELETE SET NULL).
 */
export async function setSubCategoryActive(
  subCategoryId: string,
  isActive: boolean,
): Promise<ServiceResult<null>> {
  if (!isValidUUID(subCategoryId)) {
    return { success: false, error: "Invalid sub-category ID." };
  }
  const supabase = createClient();
  try {
    const { error } = await supabase
      .from("sub_categories")
      .update({ is_active: isActive })
      .eq("id", subCategoryId);

    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "subCategoryService.setSubCategoryActive", meta: { subCategoryId, isActive } });
    return { success: false, error: toError(err) };
  }
}

/**
 * Rename/update the description or icon of an existing sub-category.
 */
export async function updateSubCategory(
  subCategoryId: string,
  updates: { name?: string; description?: string; icon?: string; sortOrder?: number },
): Promise<ServiceResult<null>> {
  if (!isValidUUID(subCategoryId)) {
    return { success: false, error: "Invalid sub-category ID." };
  }
  const supabase = createClient();
  try {
    const patch: Record<string, unknown> = {};
    if (updates.name !== undefined) {
      const name = truncate(sanitizeLight(updates.name), 60);
      if (!name) return { success: false, error: "Name cannot be empty." };
      patch.name = name;
      patch.slug = slugify(name);
    }
    if (updates.description !== undefined) patch.description = truncate(sanitizeLight(updates.description), 200);
    if (updates.icon !== undefined) patch.icon = updates.icon.slice(0, 8);
    if (updates.sortOrder !== undefined) patch.sort_order = updates.sortOrder;

    const { error } = await supabase
      .from("sub_categories")
      .update(patch)
      .eq("id", subCategoryId);

    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, { module: "subCategoryService.updateSubCategory", meta: { subCategoryId, updates } });
    return { success: false, error: toError(err) };
  }
}
