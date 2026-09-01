/* -------------------------------------------------------------------------- */
/*  TrendsMart — Clear login lockout after authenticated password recovery     */
/*  POST /api/auth/clear-lockout                                                */
/* -------------------------------------------------------------------------- */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clearLoginLockout } from "@/lib/loginLockout";
import { checkRateLimit, RATE_LIMITS, buildRateLimitResponse } from "@/lib/rateLimiter";
import { type NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, { ...RATE_LIMITS.AUTH, name: "auth-clear-lockout" });
  if (!limited.allowed) {
    const res = buildRateLimitResponse(limited);
    return NextResponse.json(res.body, { status: res.status, headers: res.headers });
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
    }

    clearLoginLockout(user.email);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: "Could not clear lockout." },
      { status: 500 },
    );
  }
}
