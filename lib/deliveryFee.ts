/* -------------------------------------------------------------------------- */
/*  TrendMart — Shared Delivery Fee Helper                                     */
/*                                                                             */
/*  THE single source of truth for delivery-charge calculation. Both the       */
/*  client checkout modal and the server-side /api/orders route call this, so  */
/*  the fee the customer sees always matches the fee stored on the order.      */
/*                                                                             */
/*  Rules (in priority order):                                                 */
/*    1. Self-pickup / takeaway → Rs 0 (never a delivery fee).                 */
/*    2. Free-delivery threshold met (subtotal >= threshold) → Rs 0.           */
/*    3. Per-km pricing is PROPORTIONAL to the exact distance, including the   */
/*       fraction: 2.2 km at Rs 40/km → 80 (2 km) + 8 (0.2 km) = Rs 88.        */
/*    4. Without a GPS distance, only the flat fee applies.                    */
/*    5. Fixed-only shops (no per-km) → just the flat fee.                     */
/*                                                                             */
/*  Result is rounded to whole rupees (PKR has no paise in practice).          */
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
  /** Order subtotal (Rs). Used to test the free-delivery threshold. */
  subtotal?: number;
  /** True when the order is self-pickup / takeaway → fee is always 0. */
  isPickup?: boolean;
}

export function computeDeliveryFee(input: DeliveryFeeInput): number {
  const {
    flat = 0,
    perKm = 0,
    distanceKm = null,
    freeThreshold = 0,
    subtotal = 0,
    isPickup = false,
  } = input;

  // Takeaway / self-pickup never pays a delivery fee.
  if (isPickup) return 0;

  // Free-delivery threshold.
  const threshold = Number(freeThreshold) || 0;
  const subtotalVal = Number(subtotal) || 0;
  if (threshold > 0 && subtotalVal >= threshold) return 0;

  let fee = Number(flat) || 0;
  const kmRate = Number(perKm) || 0;
  if (kmRate > 0 && distanceKm != null && Number.isFinite(distanceKm) && distanceKm > 0) {
    // Proportional fractional-km charge — 2.2 km @ 40 → 80 + 8 = 88.
    fee += kmRate * distanceKm;
  }

  return Math.max(0, Math.round(fee));
}
