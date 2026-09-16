/* -------------------------------------------------------------------------- */
/*  POS staff — client calls into the server-verified staff API.               */
/*                                                                              */
/*  PINs are only ever sent to the server; nothing here hashes, compares, or    */
/*  caches a PIN locally.                                                       */
/* -------------------------------------------------------------------------- */

import { logError } from "@/services/errorService";

export type PosStaffRole = "cashier" | "manager";

export interface PosStaff {
  id: string;
  shop_id: string;
  name: string;
  role: PosStaffRole;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

/** The identity of whoever is currently on shift at this terminal. */
export interface ActiveStaff {
  id: string;
  name: string;
  role: PosStaffRole;
}

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Staff list for a shop (owner only — the API enforces it).
 * Never includes PIN hashes.
 */
export async function listPosStaff(shopId: string): Promise<ServiceResult<PosStaff[]>> {
  try {
    const res = await fetch(`/api/pos/staff?shopId=${encodeURIComponent(shopId)}`);
    const json = await readJson(res);
    if (!res.ok || !json.success) {
      return { success: false, error: String(json.error || "Could not load staff.") };
    }
    return { success: true, data: (json.staff as PosStaff[]) ?? [] };
  } catch (err) {
    logError(err, { module: "posStaffService.listPosStaff", meta: { shopId } });
    return { success: false, error: "Could not load staff." };
  }
}

export async function createPosStaff(params: {
  shopId: string;
  name: string;
  pin: string;
  role: PosStaffRole;
}): Promise<ServiceResult<PosStaff>> {
  try {
    const res = await fetch("/api/pos/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const json = await readJson(res);
    if (!res.ok || !json.success) {
      return { success: false, error: String(json.error || "Could not add staff.") };
    }
    return { success: true, data: json.staff as PosStaff };
  } catch (err) {
    logError(err, { module: "posStaffService.createPosStaff" });
    return { success: false, error: "Could not add staff." };
  }
}

export async function updatePosStaff(params: {
  shopId: string;
  staffId: string;
  name?: string;
  role?: PosStaffRole;
  pin?: string;
  isActive?: boolean;
}): Promise<ServiceResult<PosStaff>> {
  try {
    const res = await fetch("/api/pos/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const json = await readJson(res);
    if (!res.ok || !json.success) {
      return { success: false, error: String(json.error || "Could not update staff.") };
    }
    return { success: true, data: json.staff as PosStaff };
  } catch (err) {
    logError(err, { module: "posStaffService.updatePosStaff" });
    return { success: false, error: "Could not update staff." };
  }
}

/** Soft-remove (deactivate) so audit history keeps resolving the name. */
export async function removePosStaff(
  shopId: string,
  staffId: string,
): Promise<ServiceResult<PosStaff>> {
  try {
    const res = await fetch(
      `/api/pos/staff?shopId=${encodeURIComponent(shopId)}&staffId=${encodeURIComponent(staffId)}`,
      { method: "DELETE" },
    );
    const json = await readJson(res);
    if (!res.ok || !json.success) {
      return { success: false, error: String(json.error || "Could not remove staff.") };
    }
    return { success: true, data: json.staff as PosStaff };
  } catch (err) {
    logError(err, { module: "posStaffService.removePosStaff" });
    return { success: false, error: "Could not remove staff." };
  }
}

/** Start a shift. On success the server sets an httpOnly session cookie. */
export async function startStaffShift(params: {
  shopId: string;
  staffId: string;
  pin: string;
}): Promise<ServiceResult<ActiveStaff>> {
  try {
    const res = await fetch("/api/pos/staff/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const json = await readJson(res);
    if (!res.ok || !json.success) {
      return { success: false, error: String(json.error || "Wrong PIN.") };
    }
    const staff = json.staff as { id: string; name: string; role: PosStaffRole };
    return { success: true, data: staff };
  } catch (err) {
    logError(err, { module: "posStaffService.startStaffShift" });
    return { success: false, error: "Could not start shift." };
  }
}

export async function endStaffShift(): Promise<void> {
  try {
    await fetch("/api/pos/staff/logout", { method: "POST" });
  } catch (err) {
    logError(err, { module: "posStaffService.endStaffShift" });
  }
}

const ACTIVE_STAFF_KEY = (shopId: string) => `tm_pos_active_staff_${shopId}`;

/**
 * Remember who is on shift for UI purposes only.
 *
 * The authoritative session is the httpOnly cookie the server set — this cache
 * just avoids a flash of the lock screen on reload and is never trusted for
 * permissions.
 */
export function cacheActiveStaff(shopId: string, staff: ActiveStaff | null): void {
  if (typeof window === "undefined") return;
  try {
    if (staff) {
      localStorage.setItem(ACTIVE_STAFF_KEY(shopId), JSON.stringify(staff));
    } else {
      localStorage.removeItem(ACTIVE_STAFF_KEY(shopId));
    }
  } catch {
    /* ignore */
  }
}

export function readCachedActiveStaff(shopId: string): ActiveStaff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACTIVE_STAFF_KEY(shopId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveStaff;
    return parsed?.id && parsed?.name ? parsed : null;
  } catch {
    return null;
  }
}
