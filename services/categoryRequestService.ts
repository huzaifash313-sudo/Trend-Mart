/* TrendsMart — merchant custom category / subcategory requests + admin review */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import { sanitizeLight, truncate } from "@/lib/sanitization";
import { PRODUCT_CATEGORIES, SHOP_CATEGORIES } from "@/types";
import { createSubCategory } from "@/services/subCategoryService";

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type CategoryRequestType = "category" | "subcategory";
export type CategoryRequestStatus = "pending" | "approved" | "rejected";
export type PlatformCategoryStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "disabled";

export interface ProposedSubCategory {
  name: string;
  icon?: string;
}

export interface PlatformCategory {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description: string;
  status: PlatformCategoryStatus;
  is_active: boolean;
  sort_order: number;
  requested_by_shop_id: string | null;
  rejection_reason?: string | null;
  created_at: string;
}

export interface CategoryRequest {
  id: string;
  shop_id: string;
  request_type: CategoryRequestType;
  category_name: string | null;
  category_icon: string | null;
  category_description: string | null;
  proposed_subcategories: ProposedSubCategory[];
  parent_category: string | null;
  subcategory_name: string | null;
  subcategory_icon: string | null;
  subcategory_description: string | null;
  status: CategoryRequestStatus;
  platform_category_id: string | null;
  created_sub_category_id: string | null;
  rejection_reason: string | null;
  created_at: string;
  shop_name?: string;
}

function toError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function parseProposedSubs(raw: unknown): ProposedSubCategory[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const name = truncate(
        sanitizeLight(String((row as { name?: string }).name ?? "")),
        60,
      );
      if (!name) return null;
      const icon = String((row as { icon?: string }).icon ?? "📦").slice(0, 8);
      return { name, icon };
    })
    .filter(Boolean) as ProposedSubCategory[];
}

/** Built-in + approved custom (+ optional shop-owned pending) for store settings. */
export async function fetchSellableCategoryOptions(
  shopId?: string | null,
): Promise<ServiceResult<string[]>> {
  const builtins = [...PRODUCT_CATEGORIES];
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("platform_categories")
      .select("name, status, is_active, requested_by_shop_id")
      .eq("is_active", true)
      .in("status", shopId ? ["approved", "pending"] : ["approved"]);

    if (error) throw error;

    const extras: string[] = [];
    for (const row of data ?? []) {
      const r = row as {
        name: string;
        status: string;
        requested_by_shop_id: string | null;
      };
      if (r.status === "approved") {
        extras.push(r.name);
        continue;
      }
      if (
        r.status === "pending" &&
        shopId &&
        r.requested_by_shop_id === shopId
      ) {
        extras.push(r.name);
      }
    }

    return { success: true, data: [...new Set([...builtins, ...extras])] };
  } catch (err) {
    logError(err, {
      module: "categoryRequestService.fetchSellableCategoryOptions",
    });
    return { success: true, data: builtins };
  }
}

/** Homepage / discovery: builtins + approved customs only. */
export async function fetchDiscoveryCategoryNames(): Promise<string[]> {
  const names = SHOP_CATEGORIES.filter((c) => c !== "All") as string[];
  const supabase = createClient();
  try {
    const { data } = await supabase
      .from("platform_categories")
      .select("name")
      .eq("status", "approved")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    for (const row of data ?? []) {
      const n = (row as { name: string }).name;
      if (n && !names.includes(n)) names.push(n);
    }
  } catch {
    /* keep builtins */
  }
  return names;
}

export async function fetchPendingCategoryRequests(): Promise<
  ServiceResult<CategoryRequest[]>
> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("category_requests")
      .select("*, shops(name)")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const rows = (data ?? []).map((row) => {
      const r = row as CategoryRequest & { shops?: { name?: string } | null };
      return {
        ...r,
        proposed_subcategories: parseProposedSubs(r.proposed_subcategories),
        shop_name: r.shops?.name ?? undefined,
      } as CategoryRequest;
    });
    return { success: true, data: rows };
  } catch (err) {
    logError(err, {
      module: "categoryRequestService.fetchPendingCategoryRequests",
    });
    return { success: false, error: toError(err) };
  }
}

export async function fetchShopCategoryRequests(
  shopId: string,
): Promise<ServiceResult<CategoryRequest[]>> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("category_requests")
      .select("*")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw error;
    const rows = ((data as CategoryRequest[]) ?? []).map((r) => ({
      ...r,
      proposed_subcategories: parseProposedSubs(r.proposed_subcategories),
    }));
    return { success: true, data: rows };
  } catch (err) {
    logError(err, {
      module: "categoryRequestService.fetchShopCategoryRequests",
    });
    return { success: false, error: toError(err) };
  }
}

export async function requestCustomCategory(input: {
  shopId: string;
  name: string;
  icon?: string;
  description?: string;
  subcategories?: string[];
}): Promise<
  ServiceResult<{ request: CategoryRequest; category: PlatformCategory }>
> {
  const name = truncate(sanitizeLight(input.name), 60);
  if (!name) return { success: false, error: "Category name required." };
  if ((PRODUCT_CATEGORIES as readonly string[]).includes(name)) {
    return {
      success: false,
      error: "This category already exists on the platform.",
    };
  }

  const icon = (input.icon ?? "📦").slice(0, 8);
  const description = truncate(sanitizeLight(input.description ?? ""), 200);
  const subs = (input.subcategories ?? [])
    .map((s) => truncate(sanitizeLight(s), 60))
    .filter(Boolean)
    .slice(0, 20)
    .map((n) => ({ name: n, icon: "📦" }));

  const supabase = createClient();
  try {
    const { data: cat, error: catErr } = await supabase
      .from("platform_categories")
      .insert({
        name,
        slug: slugify(name),
        icon,
        description,
        status: "pending",
        is_active: true,
        requested_by_shop_id: input.shopId,
      })
      .select()
      .single();
    if (catErr) throw catErr;

    const { data: req, error: reqErr } = await supabase
      .from("category_requests")
      .insert({
        shop_id: input.shopId,
        request_type: "category",
        category_name: name,
        category_icon: icon,
        category_description: description,
        proposed_subcategories: subs,
        platform_category_id: (cat as PlatformCategory).id,
        status: "pending",
      })
      .select()
      .single();
    if (reqErr) throw reqErr;

    for (const sub of subs) {
      await supabase.from("sub_categories").insert({
        category: name,
        name: sub.name,
        slug: slugify(sub.name),
        description: "",
        icon: sub.icon ?? "📦",
        sort_order: 50,
        is_active: true,
        is_others: false,
        approval_status: "pending",
        requested_by_shop_id: input.shopId,
      });
    }

    return {
      success: true,
      data: {
        request: {
          ...(req as CategoryRequest),
          proposed_subcategories: parseProposedSubs(
            (req as CategoryRequest).proposed_subcategories,
          ),
        },
        category: cat as PlatformCategory,
      },
    };
  } catch (err) {
    logError(err, {
      module: "categoryRequestService.requestCustomCategory",
      meta: input,
    });
    return { success: false, error: toError(err) };
  }
}

export async function requestCustomSubCategory(input: {
  shopId: string;
  parentCategory: string;
  name: string;
  icon?: string;
  description?: string;
}): Promise<ServiceResult<CategoryRequest>> {
  const parent = truncate(sanitizeLight(input.parentCategory), 80);
  const name = truncate(sanitizeLight(input.name), 60);
  if (!parent || !name) {
    return { success: false, error: "Parent category and name are required." };
  }

  const icon = (input.icon ?? "📦").slice(0, 8);
  const description = truncate(sanitizeLight(input.description ?? ""), 200);
  const supabase = createClient();

  try {
    const { data: sub, error: subErr } = await supabase
      .from("sub_categories")
      .insert({
        category: parent,
        name,
        slug: slugify(name),
        description,
        icon,
        sort_order: 80,
        is_active: true,
        is_others: false,
        approval_status: "pending",
        requested_by_shop_id: input.shopId,
      })
      .select()
      .single();
    if (subErr) throw subErr;

    const { data: req, error: reqErr } = await supabase
      .from("category_requests")
      .insert({
        shop_id: input.shopId,
        request_type: "subcategory",
        parent_category: parent,
        subcategory_name: name,
        subcategory_icon: icon,
        subcategory_description: description,
        created_sub_category_id: (sub as { id: string }).id,
        status: "pending",
      })
      .select()
      .single();
    if (reqErr) throw reqErr;

    return {
      success: true,
      data: {
        ...(req as CategoryRequest),
        proposed_subcategories: [],
      },
    };
  } catch (err) {
    logError(err, {
      module: "categoryRequestService.requestCustomSubCategory",
      meta: input,
    });
    return { success: false, error: toError(err) };
  }
}

export async function reviewCategoryRequest(
  requestId: string,
  decision: "approved" | "rejected",
  rejectionReason?: string,
): Promise<ServiceResult<null>> {
  const supabase = createClient();
  try {
    const { data: auth } = await supabase.auth.getUser();
    const adminId = auth.user?.id ?? null;

    const { data: req, error: fetchErr } = await supabase
      .from("category_requests")
      .select("*")
      .eq("id", requestId)
      .single();
    if (fetchErr) throw fetchErr;
    const request = req as CategoryRequest;

    if (decision === "rejected") {
      if (request.platform_category_id) {
        await supabase
          .from("platform_categories")
          .update({
            status: "rejected",
            is_active: false,
            reviewed_by: adminId,
            reviewed_at: new Date().toISOString(),
            rejection_reason: rejectionReason ?? "Rejected by admin",
          })
          .eq("id", request.platform_category_id);
      }
      if (request.created_sub_category_id) {
        await supabase
          .from("sub_categories")
          .update({ is_active: false, approval_status: "rejected" })
          .eq("id", request.created_sub_category_id);
      }
      if (request.request_type === "category" && request.category_name) {
        await supabase
          .from("sub_categories")
          .update({ is_active: false, approval_status: "rejected" })
          .eq("category", request.category_name)
          .eq("approval_status", "pending");
      }
    } else {
      if (request.request_type === "category" && request.platform_category_id) {
        await supabase
          .from("platform_categories")
          .update({
            status: "approved",
            is_active: true,
            reviewed_by: adminId,
            reviewed_at: new Date().toISOString(),
            rejection_reason: null,
          })
          .eq("id", request.platform_category_id);

        if (request.category_name) {
          await supabase
            .from("sub_categories")
            .update({ approval_status: "approved", is_active: true })
            .eq("category", request.category_name);

          const others = await createSubCategory({
            category: request.category_name,
            name: "Others / General",
            icon: "📦",
            sortOrder: 999,
          });
          if (others.success) {
            await supabase
              .from("sub_categories")
              .update({ is_others: true, approval_status: "approved" })
              .eq("id", others.data.id);
          }
        }
      }

      if (
        request.request_type === "subcategory" &&
        request.created_sub_category_id
      ) {
        await supabase
          .from("sub_categories")
          .update({ approval_status: "approved", is_active: true })
          .eq("id", request.created_sub_category_id);
      }
    }

    const { error: updErr } = await supabase
      .from("category_requests")
      .update({
        status: decision,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        rejection_reason:
          decision === "rejected"
            ? (rejectionReason ?? "Rejected by admin")
            : null,
      })
      .eq("id", requestId);
    if (updErr) throw updErr;

    return { success: true, data: null };
  } catch (err) {
    logError(err, {
      module: "categoryRequestService.reviewCategoryRequest",
      meta: { requestId, decision },
    });
    return { success: false, error: toError(err) };
  }
}

/** Admin can shut off an approved custom category anytime. */
export async function setPlatformCategoryDisabled(
  categoryId: string,
  disabled: boolean,
): Promise<ServiceResult<null>> {
  const supabase = createClient();
  try {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("platform_categories")
      .update({
        status: disabled ? "disabled" : "approved",
        is_active: !disabled,
        reviewed_by: auth.user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", categoryId);
    if (error) throw error;
    return { success: true, data: null };
  } catch (err) {
    logError(err, {
      module: "categoryRequestService.setPlatformCategoryDisabled",
      meta: { categoryId, disabled },
    });
    return { success: false, error: toError(err) };
  }
}

export async function fetchAllPlatformCategoriesForAdmin(): Promise<
  ServiceResult<PlatformCategory[]>
> {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("platform_categories")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return { success: true, data: (data as PlatformCategory[]) ?? [] };
  } catch (err) {
    logError(err, {
      module: "categoryRequestService.fetchAllPlatformCategoriesForAdmin",
    });
    return { success: false, error: toError(err) };
  }
}
