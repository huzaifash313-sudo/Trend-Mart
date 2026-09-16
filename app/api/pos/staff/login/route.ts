/* -------------------------------------------------------------------------- */
/*  POS staff shift login — POST /api/pos/staff/login                          */
/*                                                                              */
/*  The terminal is already signed in as the shop owner; this establishes WHO   */
/*  is at the counter. PINs are verified server-side against scrypt hashes that */
/*  never leave the database.                                                   */
/* -------------------------------------------------------------------------- */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidUUID } from "@/lib/sanitization";
import {
  STAFF_COOKIE,
  STAFF_SESSION_TTL_MS,
  signStaffSession,
  verifyPin,
  type StaffRole,
} from "@/lib/pos/staffAuth";
import { logPosAudit } from "@/lib/pos/posAudit";

export const runtime = "nodejs";

interface LoginBody {
  shopId?: string | null;
  staffId?: string | null;
  pin?: string | null;
}

export async function POST(request: Request) {
  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }

  const shopId = (body.shopId || "").trim();
  const staffId = (body.staffId || "").trim();
  const pin = (body.pin || "").trim();

  if (!isValidUUID(shopId) || !isValidUUID(staffId) || !pin) {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }

  // The terminal must still be a signed-in session that owns this shop —
  // staff PINs are an identity layer on top, not a replacement for auth.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Sign in required." }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { success: false, error: "Server is not configured." },
      { status: 500 },
    );
  }

  const { data: shop } = await admin
    .from("shops")
    .select("id, owner_id")
    .eq("id", shopId)
    .maybeSingle();

  if (!shop || (shop as { owner_id?: string }).owner_id !== user.id) {
    return NextResponse.json(
      { success: false, error: "You can only open a shift for your own store." },
      { status: 403 },
    );
  }

  const { data: staff } = await admin
    .from("pos_staff")
    .select("id, shop_id, name, role, pin_hash, is_active")
    .eq("id", staffId)
    .eq("shop_id", shopId)
    .maybeSingle();

  const row = staff as
    | { id: string; name: string; role: StaffRole; pin_hash: string; is_active: boolean }
    | null;

  // Same generic message whether the staff row is missing, inactive, or the PIN
  // is wrong — don't help someone enumerate valid staff/PIN combinations.
  const reject = () =>
    NextResponse.json({ success: false, error: "Wrong PIN." }, { status: 401 });

  if (!row || !row.is_active) return reject();
  if (!verifyPin(pin, row.pin_hash)) return reject();

  const token = signStaffSession({
    staffId: row.id,
    shopId,
    role: row.role,
    name: row.name,
  });

  await logPosAudit({
    shopId,
    staff: { staffId: row.id, name: row.name },
    eventType: "staff.login",
    metadata: { role: row.role },
  });

  const response = NextResponse.json({
    success: true,
    staff: { id: row.id, name: row.name, role: row.role },
  });

  response.cookies.set(STAFF_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(STAFF_SESSION_TTL_MS / 1000),
  });

  return response;
}
