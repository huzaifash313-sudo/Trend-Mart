/* -------------------------------------------------------------------------- */
/*  POST /api/sub-categories/seed                                              */
/*  Upserts built-in sub-category catalog into Supabase (service role).        */
/* -------------------------------------------------------------------------- */

import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sanitizeLight } from "@/lib/sanitization";
import { SHOP_CATEGORIES } from "@/types";
import {
  getDefaultSubCategories,
  isSeedSubCategoryId,
} from "@/lib/defaultSubCategories";
import { isValidUUID } from "@/lib/sanitization";
import { requireAdminUser } from "@/lib/requireAdmin";

export const runtime = "nodejs";

function isAllowedCategory(category: string): boolean {
  return (SHOP_CATEGORIES as readonly string[]).includes(category) && category !== "All";
}

async function seedCategory(category: string) {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return { seeded: false, reason: "Configuration not complete", rows: [] as Array<Record<string, unknown>> };
  }

  const defs = getDefaultSubCategories(category);
  const payload: Array<{
    category: string;
    name: string;
    slug: string;
    description: string;
    icon: string;
    sort_order: number;
    is_others: boolean;
    is_active: boolean;
  }> = defs.map((d) => ({
    category,
    name: d.name,
    slug: d.slug,
    description: d.description,
    icon: d.icon,
    sort_order: d.sort_order,
    is_others: Boolean(d.is_others),
    is_active: true,
  }));

  // Admin client may not include generated table typings — cast for upsert.
  const { error } = await admin
    .from("sub_categories")
    .upsert(payload as unknown as never, {
      onConflict: "category,slug",
      ignoreDuplicates: false,
    });

  if (error) {
    return { seeded: false, reason: error.message, rows: [] as Array<Record<string, unknown>> };
  }

  const { data } = await admin
    .from("sub_categories")
    .select("*")
    .eq("category", category)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return { seeded: true, reason: "ok", rows: (data as Array<Record<string, unknown>>) ?? [] };
}

export async function POST(request: Request) {
  try {
    // Idempotent built-in catalog upsert — merchants need this when adding
    // products; guests never hit it (fetchSubCategories no longer auto-POSTs).
    const gate = await requireAdminUser();
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const url = new URL(request.url);
    let category = sanitizeLight(url.searchParams.get("category") ?? "");
    let resolveId: string | null = null;

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => ({}))) as {
        category?: string;
        resolveId?: string;
      };
      if (body.category) category = sanitizeLight(body.category);
      if (body.resolveId) resolveId = String(body.resolveId);
    }

    if (!category || !isAllowedCategory(category)) {
      return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    }

    const result = await seedCategory(category);

    let resolvedId: string | null = null;
    if (resolveId && result.rows.length) {
      if (isValidUUID(resolveId)) {
        resolvedId = resolveId;
      } else if (isSeedSubCategoryId(resolveId)) {
        const slug = resolveId.slice(resolveId.lastIndexOf(":") + 1);
        const row = result.rows.find((r) => r.slug === slug);
        if (row && typeof row.id === "string" && isValidUUID(row.id)) {
          resolvedId = row.id;
        }
      }
    }

    return NextResponse.json({
      success: result.seeded,
      reason: result.reason,
      id: resolvedId,
      data: result.rows,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Seed failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
