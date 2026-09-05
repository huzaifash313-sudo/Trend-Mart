/* -------------------------------------------------------------------------- */
/*  TrendsMart — Shared Delivery Fee Helper (single source of truth)           */
/*                                                                             */
/*  Priority (never mix free + paid in one bill):                               */
/*    1. Pickup / takeaway → Rs 0                                              */
/*    2. Named free-delivery area match → Rs 0                                 */
/*    3. Free-delivery radius: within `freeRadiusKm` of shop pin → Rs 0        */
/*    4. Free-delivery threshold: subtotal >= threshold → Rs 0                 */
/*       (threshold uses cart subtotal BEFORE coupon — merchant protection)    */
/*    5. Paid delivery (only if not free):                                     */
/*         fee = flat + (per_km × distance_km)                                 */
/*       - flat alone → flat (GPS optional)                                    */
/*       - per_km alone / with flat → GPS REQUIRED; else incomplete (no fee)   */
/*    6. flat=0 AND perKm=0 (and not free above) → unconfigured                */
/*       NOT "FREE" — checkout / API must not invent free delivery             */
/*                                                                             */
/*  service_radius_km / delivery_zones = coverage eligibility ONLY.            */
/*  They do NOT auto-zero the fee.                                             */
/*                                                                             */
/*  Result is whole PKR (Math.round) when isFinal.                             */
/* -------------------------------------------------------------------------- */

export interface DeliveryFeeInput {
  /** Flat base charge (Rs). 0 / null when the shop has none. */
  flat?: number | null;
  /** Per-kilometre charge (Rs/km). 0 / null when the shop has none. */
  perKm?: number | null;
  /** Exact haversine distance in km (fraction allowed). Null = no GPS fix. */
  distanceKm?: number | null;
  /** Free-delivery threshold (Rs). 0 / null disables the rule. */
  freeThreshold?: number | null;
  /** Free-delivery radius (km): customers within this distance pay Rs 0. 0/null = off. */
  freeRadiusKm?: number | null;
  /** Order subtotal BEFORE coupon (Rs). Used for free-delivery threshold. */
  subtotal?: number;
  /** True when the order is self-pickup / takeaway → fee is always 0. */
  isPickup?: boolean;
  /** Merchant-declared localities where delivery is ALWAYS free. */
  freeAreas?: string[] | null;
  /** Customer's selected area / mohalla / colony (e.g. "Peoples Colony"). */
  customerArea?: string | null;
}

export interface DeliveryFeeBreakdown {
  /**
   * Chargeable fee in whole PKR when `isFinal`.
   * When incomplete / unconfigured → 0 (do NOT treat as FREE — check flags).
   */
  fee: number;
  /** Why fee is free, if applicable. */
  freeReason: "pickup" | "threshold" | "area" | "radius" | null;
  /** Flat portion included in fee (0 when free / incomplete / unconfigured). */
  flatPart: number;
  /** Distance portion included in fee (0 when free / no GPS). */
  distancePart: number;
  /** True when per-km is set but distance is missing — UI/API must block. */
  incompleteDistance: boolean;
  /** Merchant set neither flat nor per-km — not free delivery. */
  unconfigured: boolean;
  /** True only when fee (including FREE via pickup/threshold) is exact & billable. */
  isFinal: boolean;
  /** Human-readable formula for checkout / WhatsApp / merchant preview. */
  formulaLabel: string;
}

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/**
 * Normalize an area/colony name so "Peoples Colony" matches "People's Colony"
 * and "peoples  coloney". Mirrors lib/cityAreas.normalizeAreaName without
 * importing (keeps this module dependency-free for tests).
 */
function normalizeAreaToken(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when the customer's selected area matches one of the shop's
 * free-delivery areas. Normalized + containment-aware so a shop can mark a
 * broad locality and still cover sub-areas (e.g. "Satellite" covers
 * "Satellite Town").
 */
export function findFreeDeliveryAreaMatch(
  customerArea: string | null | undefined,
  freeAreas: string[] | null | undefined,
): string | null {
  const target = normalizeAreaToken(customerArea ?? "");
  if (!target || !Array.isArray(freeAreas) || freeAreas.length === 0) return null;
  for (const area of freeAreas) {
    const original = String(area ?? "").trim();
    const token = normalizeAreaToken(original);
    if (!token) continue;
    if (token === target || target.includes(token) || token.includes(target)) {
      return original;
    }
  }
  return null;
}

/** True when the customer's selected area/address lands in a free-delivery area. */
export function areaQualifiesForFreeDelivery(
  customerArea: string | null | undefined,
  freeAreas: string[] | null | undefined,
): boolean {
  return findFreeDeliveryAreaMatch(customerArea, freeAreas) != null;
}

/** Full breakdown — prefer this when UI needs to explain the fee. */
export function computeDeliveryFeeBreakdown(
  input: DeliveryFeeInput,
): DeliveryFeeBreakdown {
  const flat = Math.max(0, n(input.flat));
  const perKm = Math.max(0, n(input.perKm));
  const threshold = Math.max(0, n(input.freeThreshold));
  const subtotal = Math.max(0, n(input.subtotal));
  const isPickup = Boolean(input.isPickup);
  const distanceKm =
    input.distanceKm != null && Number.isFinite(input.distanceKm)
      ? Math.max(0, Number(input.distanceKm))
      : null;
  const freeAreaMatch = !isPickup ? findFreeDeliveryAreaMatch(input.customerArea, input.freeAreas) : null;

  if (isPickup) {
    return {
      fee: 0,
      freeReason: "pickup",
      flatPart: 0,
      distancePart: 0,
      incompleteDistance: false,
      unconfigured: false,
      isFinal: true,
      formulaLabel: "Self-pickup — no delivery fee",
    };
  }

  if (freeAreaMatch) {
    // Show the merchant-declared locality, not the customer's full typed address.
    const label = freeAreaMatch || (input.customerArea ?? "").trim() || "your area";
    return {
      fee: 0,
      freeReason: "area",
      flatPart: 0,
      distancePart: 0,
      incompleteDistance: false,
      unconfigured: false,
      isFinal: true,
      formulaLabel: `FREE delivery to ${label}`,
    };
  }

  // Free-delivery radius — "FREE within X km of the shop". Needs a live
  // distance; a customer with no GPS pin simply falls through to the paid
  // rules below (never guesses the radius as free).
  const freeRadiusKm = Math.max(0, n(input.freeRadiusKm));
  if (freeRadiusKm > 0 && distanceKm != null && distanceKm <= freeRadiusKm) {
    const kmLabel =
      distanceKm < 1
        ? `${Math.round(distanceKm * 1000)} m`
        : `${distanceKm.toFixed(1)} km`;
    return {
      fee: 0,
      freeReason: "radius",
      flatPart: 0,
      distancePart: 0,
      incompleteDistance: false,
      unconfigured: false,
      isFinal: true,
      formulaLabel: `FREE delivery within ${freeRadiusKm} km — you're ${kmLabel} away`,
    };
  }

  if (threshold > 0 && subtotal >= threshold) {
    return {
      fee: 0,
      freeReason: "threshold",
      flatPart: 0,
      distancePart: 0,
      incompleteDistance: false,
      unconfigured: false,
      isFinal: true,
      formulaLabel: `FREE — cart Rs. ${Math.round(subtotal).toLocaleString()} ≥ Rs. ${Math.round(threshold).toLocaleString()} threshold`,
    };
  }

  const incompleteDistance = perKm > 0 && distanceKm == null;
  if (incompleteDistance) {
    return {
      fee: 0,
      freeReason: null,
      flatPart: 0,
      distancePart: 0,
      incompleteDistance: true,
      unconfigured: false,
      isFinal: false,
      formulaLabel:
        flat > 0
          ? `Location needed — fee = Rs. ${Math.round(flat).toLocaleString()} flat + Rs. ${Math.round(perKm).toLocaleString()}/km × distance`
          : `Location needed — fee = Rs. ${Math.round(perKm).toLocaleString()}/km × distance`,
    };
  }

  const unconfigured = flat <= 0 && perKm <= 0;
  if (unconfigured) {
    return {
      fee: 0,
      freeReason: null,
      flatPart: 0,
      distancePart: 0,
      incompleteDistance: false,
      unconfigured: true,
      isFinal: false,
      formulaLabel:
        threshold > 0
          ? `Delivery fee not set (FREE only above Rs. ${Math.round(threshold).toLocaleString()})`
          : "Delivery fee not set by shop",
    };
  }

  const flatPart = flat;
  const distancePart =
    perKm > 0 && distanceKm != null && distanceKm > 0 ? perKm * distanceKm : 0;
  const fee = Math.max(0, Math.round(flatPart + distancePart));

  let formulaLabel: string;
  if (perKm > 0 && distanceKm != null) {
    const kmLabel =
      distanceKm < 1
        ? `${Math.round(distanceKm * 1000)} m`
        : `${distanceKm.toFixed(1)} km`;
    formulaLabel =
      flatPart > 0
        ? `Rs. ${Math.round(flatPart).toLocaleString()} flat + Rs. ${Math.round(perKm).toLocaleString()}/km × ${kmLabel}`
        : `Rs. ${Math.round(perKm).toLocaleString()}/km × ${kmLabel}`;
  } else {
    formulaLabel = `Flat Rs. ${Math.round(flatPart).toLocaleString()}`;
  }

  if (threshold > 0 && fee > 0) {
    formulaLabel += ` · FREE above Rs. ${Math.round(threshold).toLocaleString()}`;
  }

  return {
    fee,
    freeReason: null,
    flatPart: Math.round(flatPart),
    distancePart: Math.round(distancePart),
    incompleteDistance: false,
    unconfigured: false,
    isFinal: true,
    formulaLabel,
  };
}

/**
 * Final fee only when computable. Returns 0 for incomplete/unconfigured —
 * callers MUST check breakdown flags before treating 0 as FREE.
 */
export function computeDeliveryFee(input: DeliveryFeeInput): number {
  return computeDeliveryFeeBreakdown(input).fee;
}

/**
 * Marketplace / ticker copy — shows free offer AND paid rates without hiding one.
 * Never invents amounts; returns null when shop set nothing.
 */
export function describeDeliveryPricing(input: {
  freeDeliveryThreshold?: number | null;
  freeDeliveryRadiusKm?: number | null;
  deliveryFeeFlat?: number | null;
  deliveryFeePerKm?: number | null;
}): string | null {
  const free = n(input.freeDeliveryThreshold);
  const radius = n(input.freeDeliveryRadiusKm);
  const flat = n(input.deliveryFeeFlat);
  const perKm = n(input.deliveryFeePerKm);

  const parts: string[] = [];
  if (radius > 0) {
    parts.push(`Free within ${radius} km`);
  }
  if (free > 0) {
    parts.push(`Free over Rs. ${Math.round(free).toLocaleString()}`);
  }
  if (flat > 0 && perKm > 0) {
    parts.push(
      `Else Rs. ${Math.round(flat).toLocaleString()} + Rs. ${Math.round(perKm).toLocaleString()}/km`,
    );
  } else if (flat > 0) {
    parts.push(`Delivery Rs. ${Math.round(flat).toLocaleString()}`);
  } else if (perKm > 0) {
    parts.push(`Delivery Rs. ${Math.round(perKm).toLocaleString()}/km`);
  } else if (free <= 0 && radius <= 0) {
    return null;
  }

  return parts.join(" · ");
}
