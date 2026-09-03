/* -------------------------------------------------------------------------- */
/*  TrendsMart — Platform brand theme API                                      */
/*  GET  /api/brand-theme  — public published preset id                        */
/*  PUT  /api/brand-theme  — admin publish (body: { id })                      */
/* -------------------------------------------------------------------------- */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_BRAND_THEME,
  normalizeBrandThemeId,
  type BrandThemeId,
} from "@/lib/brandThemes";

const SETTING_KEY = "brand_theme";

function parseThemeId(raw: unknown): BrandThemeId {
  if (raw && typeof raw === "object" && "id" in raw) {
    return normalizeBrandThemeId((raw as { id: unknown }).id);
  }
  if (typeof raw === "string") return normalizeBrandThemeId(raw);
  return DEFAULT_BRAND_THEME;
}

export async function GET() {
  try {
    const admin = getSupabaseAdminClient();
    const supabase = admin ?? (await createClient());

    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", SETTING_KEY)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { success: true, id: DEFAULT_BRAND_THEME, source: "fallback" },
        { headers: { "Cache-Control": "public, max-age=30" } },
      );
    }

    const id = parseThemeId(data?.value);
    return NextResponse.json(
      { success: true, id, source: "platform" },
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } },
    );
  } catch {
    return NextResponse.json(
      { success: true, id: DEFAULT_BRAND_THEME, source: "fallback" },
      { headers: { "Cache-Control": "public, max-age=10" } },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Sign in required." }, { status: 401 });
    }

    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (isAdmin !== true) {
      return NextResponse.json({ success: false, error: "Admin only." }, { status: 403 });
    }

    const body = (await request.json()) as { id?: unknown };
    const id = normalizeBrandThemeId(body?.id);

    const payload = {
      key: SETTING_KEY,
      value: { id },
      updated_at: new Date().toISOString(),
    };

    // Prefer user-scoped client (RLS admin write). Fallback to service role.
    let saveError: string | null = null;
    {
      const { error } = await supabase.from("platform_settings").upsert(payload, { onConflict: "key" });
      if (error) saveError = error.message;
    }

    if (saveError) {
      const admin = getSupabaseAdminClient();
      if (!admin) {
        return NextResponse.json(
          { success: false, error: saveError || "Could not save brand theme." },
          { status: 500 },
        );
      }
      const { error } = await admin.from("platform_settings").upsert(payload, { onConflict: "key" });
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
