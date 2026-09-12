import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { ANALYTICS_RETENTION_DAYS } from "@/lib/mobilePerf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Free-tier maintenance hook — prune analytics_logs so the 500 MB Free DB
 * stays healthy. Call daily from Vercel Cron / GitHub Actions with:
 *   Authorization: Bearer $CRON_SECRET
 * Or set CRON_SECRET in env and schedule GET/POST this route.
 */
export async function POST(req: Request) {
  return run(req);
}

export async function GET(req: Request) {
  return run(req);
}

async function run(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization")?.trim() ?? "";
  const token = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : auth;
  if (token !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = getSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json(
        { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" },
        { status: 503 },
      );
    }

    // RPC args not yet in generated Database types — cast keeps production `tsc` green.
    const { data, error } = await admin.rpc(
      "cleanup_analytics_logs" as never,
      { retention_days: ANALYTICS_RETENTION_DAYS } as never,
    );
    if (error) throw error;
    return NextResponse.json({
      ok: true,
      deleted: data ?? 0,
      retention_days: ANALYTICS_RETENTION_DAYS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "cleanup failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
