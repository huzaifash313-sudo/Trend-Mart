/* -------------------------------------------------------------------------- */
/*  POS staff management — /api/pos/staff                                      */
/*                                                                              */
/*  Owner-only CRUD. `pin_hash` is never included in any response.             */
/*    GET    ?shopId=…   list staff                                            */
/*    POST               create  { shopId, name, pin, role }                   */
/*    PATCH              update  { shopId, staffId, name?, role?, pin?, isActive? }
/*    DELETE ?shopId=&staffId=   deactivate (soft — keeps audit history)       */
/* -------------------------------------------------------------------------- */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidUUID, sanitizeLight, truncate } from "@/lib/sanitization";
import { hashPin, isValidPinFormat, type StaffRole } from "@/lib/pos/staffAuth";
import { logPosAudit } from "@/lib/pos/posAudit";

export const runtime = "nodejs";

/** Columns safe to return to the client — deliberately excludes pin_hash. */
const SAFE_COLUMNS = "id, shop_id, name, role, is_active, created_at, updated_at";

type Guard =
  | { ok: true; admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>> }
  | { ok: false; response: NextResponse };

/** Every handler here requires a signed-in user who owns the shop. */
async function requireOwner(shopId: string): Promise<Guard> {
  if (!isValidUUID(shopId)) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: "Invalid shop." }, { status: 400 }),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: "Sign in required." }, { status: 401 }),
    };
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Server is not configured." },
        { status: 500 },
      ),
    };
  }

  const { data: shop } = await admin
    .from("shops")
    .select("id, owner_id")
    .eq("id", shopId)
    .maybeSingle();

  if (!shop || (shop as { owner_id?: string }).owner_id !== user.id) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Not your store." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, admin };
}

function cleanName(raw: unknown): string {
  return truncate(sanitizeLight(String(raw ?? "")).trim(), 40);
}

function cleanRole(raw: unknown): StaffRole {
  return raw === "manager" ? "manager" : "cashier";
}

export async function GET(request: Request) {
  const shopId = new URL(request.url).searchParams.get("shopId") || "";
  const guard = await requireOwner(shopId);
  if (!guard.ok) return guard.response;

  const { data, error } = await guard.admin
    .from("pos_staff")
    .select(SAFE_COLUMNS)
    .eq("shop_id", shopId)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, error: "Could not load staff." }, { status: 500 });
  }
  return NextResponse.json({ success: true, staff: data ?? [] });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }

  const shopId = String(body.shopId ?? "");
  const guard = await requireOwner(shopId);
  if (!guard.ok) return guard.response;

  const name = cleanName(body.name);
  const pin = String(body.pin ?? "").trim();
  const role = cleanRole(body.role);

  if (!name) {
    return NextResponse.json({ success: false, error: "Staff name is required." }, { status: 400 });
  }
  if (!isValidPinFormat(pin)) {
    return NextResponse.json(
      { success: false, error: "PIN must be 4–8 digits and not all the same digit." },
      { status: 400 },
    );
  }

  const { data, error } = await guard.admin
    .from("pos_staff")
    .insert({ shop_id: shopId, name, role, pin_hash: hashPin(pin) } as never)
    .select(SAFE_COLUMNS)
    .single();

  if (error || !data) {
    return NextResponse.json({ success: false, error: "Could not add staff." }, { status: 500 });
  }

  await logPosAudit({
    shopId,
    actorLabel: "Owner",
    eventType: "staff.created",
    metadata: { staffName: name, role },
  });

  return NextResponse.json({ success: true, staff: data });
}

export async function PATCH(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }

  const shopId = String(body.shopId ?? "");
  const staffId = String(body.staffId ?? "");
  const guard = await requireOwner(shopId);
  if (!guard.ok) return guard.response;
  if (!isValidUUID(staffId)) {
    return NextResponse.json({ success: false, error: "Invalid staff." }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let pinReset = false;

  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) {
      return NextResponse.json({ success: false, error: "Staff name is required." }, { status: 400 });
    }
    patch.name = name;
  }
  if (body.role !== undefined) patch.role = cleanRole(body.role);
  if (body.isActive !== undefined) patch.is_active = body.isActive !== false;
  if (body.pin !== undefined) {
    const pin = String(body.pin ?? "").trim();
    if (!isValidPinFormat(pin)) {
      return NextResponse.json(
        { success: false, error: "PIN must be 4–8 digits and not all the same digit." },
        { status: 400 },
      );
    }
    patch.pin_hash = hashPin(pin);
    pinReset = true;
  }

  const { data, error } = await guard.admin
    .from("pos_staff")
    .update(patch as never)
    .eq("id", staffId)
    .eq("shop_id", shopId)
    .select(SAFE_COLUMNS)
    .single();

  if (error || !data) {
    return NextResponse.json({ success: false, error: "Could not update staff." }, { status: 500 });
  }

  const staffName = (data as { name?: string }).name ?? "";
  if (pinReset) {
    await logPosAudit({
      shopId,
      actorLabel: "Owner",
      eventType: "staff.pin_reset",
      severity: "warning",
      metadata: { staffId, staffName },
    });
  }
  if (body.isActive === false) {
    await logPosAudit({
      shopId,
      actorLabel: "Owner",
      eventType: "staff.deactivated",
      severity: "warning",
      metadata: { staffId, staffName },
    });
  }

  return NextResponse.json({ success: true, staff: data });
}

export async function DELETE(request: Request) {
  const params = new URL(request.url).searchParams;
  const shopId = params.get("shopId") || "";
  const staffId = params.get("staffId") || "";

  const guard = await requireOwner(shopId);
  if (!guard.ok) return guard.response;
  if (!isValidUUID(staffId)) {
    return NextResponse.json({ success: false, error: "Invalid staff." }, { status: 400 });
  }

  // Soft delete: hard-deleting would strip the name from historical audit rows.
  const { data, error } = await guard.admin
    .from("pos_staff")
    .update({ is_active: false, updated_at: new Date().toISOString() } as never)
    .eq("id", staffId)
    .eq("shop_id", shopId)
    .select(SAFE_COLUMNS)
    .single();

  if (error || !data) {
    return NextResponse.json({ success: false, error: "Could not remove staff." }, { status: 500 });
  }

  await logPosAudit({
    shopId,
    actorLabel: "Owner",
    eventType: "staff.deactivated",
    severity: "warning",
    metadata: { staffId, staffName: (data as { name?: string }).name ?? "" },
  });

  return NextResponse.json({ success: true, staff: data });
}
